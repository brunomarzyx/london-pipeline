# Deploy assessment

Measured 1 Nov 2026 (macOS `du -sm`; standalone via `output: "standalone"` build).

## What the app reads at runtime

| File | Size | How |
|---|---|---|
| data/street.db | 113M | better-sqlite3, readonly (comps, repeat-sales, screen) |
| data/context/transport.db | 28M | readonly (Area Risk Score) |
| data/context/schools.db | 27M | readonly |
| data/context/heritage.db | 26M | readonly |
| data/context/greenspace.db | 22M | readonly |
| data/context/noise.db | 15M | readonly |
| data/context/flood.db | 12M | readonly |
| data/context/air.db | 10M | readonly |
| data/context/epc.json | 6M | readFileSync, cached |
| data/context/pipeline.json | 3M | readFileSync, cached |
| data/london.db | 1M | better-sqlite3 (borough prices, pipeline) |
| data/global.json | 1M | readFileSync (BIS snapshot) |
| data/boroughs.geojson | 1M | served by /api/geo |
| data/context/area-score-lsoa.json | 1M | readFileSync (screen Risk column) |
| data/context/shortlets.json | 1M | readFileSync, cached |
| **Runtime data total** | **~243M** (traced into `.next/standalone/data`) | |

Not read at runtime (excluded from the image): `data/raw` (68M), `data/street/` intermediates (~880M), `data/context/ptal_lsoa2011.csv` + `imd2025_file1.xlsx` (build-time only), `logs/`, `.next` (rebuilt).

## Build output size

| Artefact | Size |
|---|---|
| `.next` (default `next build`) | 116M |
| `.next/standalone` (with `output: "standalone"`) | 269M (incl. 243M traced data + better-sqlite3 native binding) |
| Docker image (estimated, node:22-slim + standalone) | ~450M |

## Host comparison (free/cheap, public demo URL)

| Host | Fits 243M data + native module? | Verdict |
|---|---|---|
| Vercel (serverless, hobby) | No: 250 MB unzipped function limit, and better-sqlite3 needs a native binding per invocation; read-only FS also blocks the usage log. One DB alone (street.db 113M) plus the Next server would be near the cap before the 7 context DBs. | Ruled out |
| Railway (hobby, usage-based ~$5 credit) | Yes via Dockerfile, ephemeral disk fits. Sleeps on free tier; cold starts re-read ~250M of SQLite. Works but free credit burns fast under demo traffic. | Backup |
| Render (free web service + Docker) | Yes via Dockerfile, 512M RAM free tier. Free disks are ephemeral and the service sleeps after inactivity; 243M image pulls are slow on every cold start. | Backup |
| Fly.io (Docker + baked-in data, lhr) | Yes: no function-size cap, native module runs on plain Node, data baked into the image so no volume needed (DBs are opened readonly). `shared-cpu-1x/1gb` + scale-to-zero keeps cost near zero; region `lhr` suits a London demo. | **Pick** |

Why Fly.io, in 5 lines: it is the only option with no 250 MB function cap, so the 243 MB of SQLite/JSON can ship inside the image. better-sqlite3 needs its compiled binding, which runs unmodified on Fly's plain Node 22 image. All DBs open readonly, so no volume or writable FS is required. Scale-to-zero keeps an idle demo near free, waking on request. lhr region keeps the London demo snappy. Risk: cold starts pull a ~450 MB image; mitigate with min_machines_running = 1 on demo day if budget allows.

## Deploy (Fly.io)

```bash
# 1. Build data locally first (gitignored artefacts, must exist in build context):
npx tsx scripts/ingest.ts            # data/london.db
bash scripts/street/run_all.sh       # data/street.db
node scripts/build-area-score-lsoa.ts  # data/context/area-score-lsoa.json (if refreshed)
# 2. Create + ship (interactive, needs a Fly account; no sign-in done in this repo):
fly launch --no-deploy
fly secrets set MODEL_API_KEY=... META_BASE_URL=https://api.meta.ai/v1 META_MODEL=muse-spark-1.3
fly deploy
```

`output: "standalone"` is set in `next.config.mjs` (verified: build passes, standalone server includes better-sqlite3 + all data files), so the image runs `node server.js`.

## Env vars

| Var | Purpose | Default / safe public value |
|---|---|---|
| MODEL_API_KEY | Meta Model API key | (secret, `fly secrets set`; never commit) |
| META_BASE_URL | Model endpoint | `https://api.meta.ai/v1` |
| META_MODEL | Model name | `muse-spark-1.3` |
| RATE_LIMIT_MAX | Ask London + memo + check-extract calls per IP per window | `15` |
| RATE_LIMIT_BRIEF_MAX | Borough brief calls per IP per window | `60` |
| RATE_LIMIT_WINDOW_SECONDS | Rate-limit window | `3600` |
| RATE_LIMIT_DAILY_MAX | Model calls across all visitors per 24h (global kill-switch) | `1000` in code; `300` in `fly.toml` for public deploys |
| META_DAILY_TOKEN_CAP | Live tokens per UTC day (from `logs/usage.jsonl`) before model calls are refused with "Demo limit reached for today"; `0` disables | `200000` |
| META_PRICE_IN_PER_M / META_PRICE_OUT_PER_M | US$ per 1M input / output tokens for `npm run spend`; unset prints "price unknown", never $0 | (unset; set from your Meta invoice) |
| DEMO_CACHE_DIR | Override for the demo cache folder (tests) | `data/demo-cache` |

## Demo protection

Rate limiter (`lib/ratelimit.ts`, in-memory, per-IP fixed window + global daily cap; `MOCK_META=1` bypasses it) guards every model-spending route: `/api/ask` + `/api/memo` + `/api/check` (extract action only; verdict is pure code) share the `model` bucket; `/api/brief/[code]` uses the `brief` bucket with its own daily share. Over-limit returns 429 with `Retry-After`. Public deploys should keep `RATE_LIMIT_DAILY_MAX=300`: enough for repeated demo walkthroughs (each Ask/memo/brief/check-extract costs one or two model calls) without letting one viral day drain the $150 credit pool. If the cap trips, the UI shows the 429 message and the owner raises it via `fly secrets` / env.

Docker is not installed in this environment (`docker version`: command not found), so no local `docker build` was attempted.

## Demo cache

`npx tsx --env-file=.env scripts/precompute-demo.ts` runs each demo input live once (about 10 model calls) and saves `data/demo-cache/*.json`. Exact-match inputs (Ask London, `/diligence`, `/check` for SE15 4AN, flat, 70 sq m, £650k) are then served from cache with a "cached run · <date>" label, bypassing the model and rate limits; add `?live=1` to the page URL (or tick "Run live" on `/diligence`) to force a live run. The cache folder is committed, so redeploys keep it. The daily cap only applies to live calls.
