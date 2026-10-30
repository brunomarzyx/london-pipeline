# Muse Code session prompts — London Pipeline

**Rules of use:** one prompt per fresh `muse` session, run from the repo root. When the handoff block shows `PHASE n DONE`, type `commit`, then quit. Don't chat in between; every extra turn re-sends the whole conversation.

Before every session: `/models` → `muse-spark-1.3`; `/effort` → the level in the table.

| Phase | Effort | Rough spend (estimate) |
|---|---|---|
| 0 Scaffold | medium | $1–3 |
| 1 Ingest + metrics | high | $3–8 |
| 2 Dashboard | medium | $4–10 |
| 3 Meta features | high | $3–8 |
| 4 Stretch | medium | $2–6 |
| 5 Polish | low | $1–3 |

These spend figures are estimates at standard-tier prices. Never use `ultra` or Muse Wonder.

---

### Phase 0 — Scaffold
```
Phase 0. Goal: a runnable skeleton with zero features. .gitignore, .env.example, AGENTS.md, docs/ and data/ already exist; keep them.
1. Scaffold the stack from AGENTS.md §3 in the repo root. Add recharts and zod. Add scripts: dev, build, test, typecheck.
2. lib/meta.ts as AGENTS.md §3 specifies: chat() and chatJSON(schema), using the openai SDK with the env baseURL and model, usage logging to logs/usage.jsonl, and MOCK_META=1 fixtures from fixtures/meta/*.json.
3. scripts/ping-meta.ts: one live call, "reply with the word ok". Print the reply and usage.
Acceptance: typecheck, test (1 smoke test) and build pass; `MOCK_META=1 npx tsx scripts/ping-meta.ts` prints the mock reply. Then I run it live.
Stop with the handoff block.
```

### Phase 1 — Ingest and metrics
```
Phase 1. SPEC "Data" plus MVP items 1–2. My raw files are in data/raw/.
1. First run `ls -la data/raw` and `head -5` the CSV (don't read whole files). Read the .ods files with the `xlsx` npm package: print the sheet names, then the first 15 rows of the London part only. Tell me in ≤6 lines which columns you'll use. If something needed is missing, stop and tell me exactly what.
2. Unzip data/raw/statistical-gis-boundaries-london.zip to data/raw/boundaries/ and convert the London borough shapefile to data/boroughs.geojson with `npx mapshaper` (reproject to wgs84, simplify to under 1 MB, keep the ONS code and name).
3. scripts/ingest.ts → SQLite tables per SPEC. Normalise borough names to ONS codes (handle "City of London", "Kingston upon Thames", "Richmond upon Thames", "Hammersmith and Fulham" and "&" variants).
4. lib/metrics.ts: the SPEC metrics as pure functions, with null-safe handling.
5. data/SOURCES.md already lists the sources; fill in the date range each file actually covers.
Tests first: at least 10 covering name normalisation, every metric, nulls and a borough with zero completions (the ratio must be null, not Infinity).
Acceptance: tests pass; ingest prints row counts per table and a top-5 by supply pressure.
Never invent numbers.
Stop with the handoff block.
```

### Phase 2 — Dashboard
```
Phase 2. SPEC MVP item 3. It must look sharp in a screen recording.
- /: a full-height Leaflet choropleth from data/boroughs.geojson; a metric toggle (4 metrics); a legend with breaks; a ranked side table (click a row to select the borough); "no data" in grey; the GLA boundary copyright notice in the map attribution.
- /borough/[code]: the headline numbers, a price line chart, and a starts-versus-completions bar chart by financial year (recharts).
- Use server components and route handlers that read SQLite. No client-side database.
Acceptance: build passes. Give me the 3 URLs to click through.
Stop with the handoff block.
```

### Phase 3 — Meta AI features (judged at 25%)
```
Phase 3. SPEC MVP items 4–5, through lib/meta.ts only.
- prompts/ask.md and lib/ask.ts: a tool-calling loop with list_boroughs, get_borough_metrics and rank_boroughs (zod-validated args, max 4 tool rounds, never invent tool results, cite only returned numbers, say when data is missing, including that approvals data is not in this build). Effort: medium.
- prompts/brief.md: system prompt order is role → objective → rules → exact JSON schema → fallback (confidence "low" if a metric is null). The user message is that borough's metrics as compact JSON. Effort: low.
- UI: an "Ask London" box on / with 3 example chips ("Which 5 boroughs have the biggest pipeline build-up?", "Where is supply pressure highest relative to completions?", "How has Tower Hamlets compared with Newham?"); a Brief card on each borough page.
- fixtures/meta for both, so MOCK_META works.
Acceptance: both work in mock and live. Show me 3 live answers and their usage log lines (prompt, completion and cached tokens).
Stop with the handoff block.
```

### Phase 4 — Stretch (only if Phase 3 passed by Tue 18:00 UK)
```
Phase 4. SPEC stretch item 6 only. lib/cycle.ts: a rule-based phase classifier using 12-month price change and supply pressure, with thresholds as named constants and at least 4 tests. Show the phase as a badge and a map layer, plus a one-paragraph Muse Spark explanation on the borough page (chatJSON, effort low, mock fixture).
Acceptance: tests pass; the map layer and the explanation work live.
Stop with the handoff block.
```

### Phase 5 — Polish and submission pack
```
Phase 5. No new features.
1. README.md: the pitch, a 30-second quick-start (mock and live), a Mermaid architecture diagram, "How we use Meta models" (tool-calling analyst agent, structured borough briefs), data sources and limitations, and the stack.
2. docs/DEMO_SCRIPT.md: a 3-minute script: problem (0:00–0:20) → map and toggles (0:20–1:00) → borough page and brief (1:00–1:45) → Ask London live (1:45–2:30) → cycle view and what's next (2:30–3:00).
3. Fix all typecheck, build and lint warnings; remove dead code.
Acceptance: a clean build; show the output of `git log -p | grep -i "api_key\|sk-"` (it must be empty).
Stop with the handoff block.
```

---

### If a session goes wrong
- It drifts or loops: press Esc, then `Stop. Re-read AGENTS.md §1. State in 2 lines what is failing and the single next fix.`
- The session runs long: quit and start fresh with `Continue Phase <n>. Last handoff: <paste>`.
- It tries a big refactor: `No. Smallest change that passes the acceptance check.`

---
## Upgrade phases (30 Oct, after research)

### Phase 6 — Rents, yields and liquidity (London depth)
```
Phase 6. Add rents, yields and transaction volumes for all 33 boroughs, through the existing ingest → SQLite → metrics pattern.
- Rents: ONS Price Index of Private Rents (PIPR) local-authority average monthly rent, latest available month and 12 months earlier. Download the official ONS file into data/raw, record URL, release date and licence (OGL) in data/SOURCES.md.
- Volumes: HM Land Registry Price Paid Data yearly files (latest full 12 months vs prior 12), London boroughs only, count of sales and new-build share. Record URL and licence (OGL) in data/SOURCES.md. Don't commit files over 50 MB; keep only the London extract.
- New metrics in lib/metrics.ts with tests: grossYield = 12 × avg monthly rent ÷ avg price; priceToRent = price ÷ (12 × rent); rentChange12m; salesVolumeChange12m; newBuildShare. Nulls stay null.
- New map layers (Gross yield, Rent Δ 12m, Sales volume Δ) and the figures on borough pages; add the new metrics to the Ask London tools and the Brief input.
- If a source can't be downloaded or its borough coverage is incomplete, stop and say exactly which, rather than substituting another source.
Acceptance: tests green with MOCK_META=1; typecheck; show 3 boroughs' yield, rent change and volume change with the raw inputs so they can be checked.
Stop with the handoff block.
```

### Phase 7 — Verified analyst memo (the Meta AI showcase)
```
Phase 7. A multi-step Muse Spark analyst that writes a one-page borough or two-borough memo, then proves its numbers.
- lib/memo.ts: plan → call tools (existing + Phase 6 metrics) → draft memo JSON {title, call, evidence[], risks[], what_would_change_my_mind, market_read_across} → verifier pass: extract every number in the draft and match it against tool results; unmatched numbers are removed or flagged. Return verification stats (n numbers, n verified).
- market_read_across is qualitative only (e.g. London-focused listed housebuilders and residential landlords, gilt yields): no prices, multiples or forecasts unless returned by a tool.
- UI: "Write memo" button on borough pages and in Ask London ("compare X and Y"); show a "✓ 14/14 figures verified against source data" badge; each figure links to its source row; export to Markdown.
- Also add the verifier to Ask London answers (badge only).
- Fixtures for mock mode; tests for the verifier (catches an invented number; passes formatted numbers like £447,950 and −13.3%).
Acceptance: tests green; 2 live memos (one single, one comparison) with their verification stats and usage log lines.
Stop with the handoff block.
```

### Phase 8 — London vs the world's capitals
```
Phase 8. A "Global" tab comparing London's housing cycle with other capitals, using BIS residential property price statistics (data.bis.org, topic RPP) and BIS central bank policy rates.
- Pick the 6–8 capitals or largest cities that have a city-level BIS series, aiming for spread across Europe, Middle East, North America, South America, Asia-Pacific; list which were found and which weren't in data/SOURCES.md. Use real (CPI-deflated) indices where available, otherwise label nominal.
- Metrics per city: real price change 1y and 5y, distance from 10-year peak, policy rate and its 12-month change; a simple cycle phase from real price momentum and rate direction (named constants, tests).
- UI: a ranked table plus small-multiple sparklines; London highlighted; clear note that supply data isn't comparable across cities so this view is prices and rates only.
- Add a get_city_metrics tool so Ask London can answer "where is London in the global cycle?".
Acceptance: tests green; show the city list with series IDs and latest dates; one live Ask answer comparing London with two other cities.
Stop with the handoff block.
```

### Phase 9 — Demo polish
```
Phase 9. No new data. Landing headline that states the single strongest live finding; consistent formatting; mobile check; update README and docs/DEMO_SCRIPT.md for Phases 6–8 (demo order: map → borough memo with verified badge → global view → Ask London); key-leak check.
Acceptance: clean build; secret scan empty.
Stop with the handoff block.
```
