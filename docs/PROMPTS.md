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
