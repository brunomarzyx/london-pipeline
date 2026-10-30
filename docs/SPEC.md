# SPEC — London Pipeline: borough housing supply versus price, explained by Muse Spark

## One line
See where London's housing construction pipeline is building up or drying out, borough by borough, against prices, and ask about it in plain English.

## Why it matters (impact)
London supply data is public but scattered across GLA dashboards, planning exports and Land Registry files. A student fund analyst, a small developer or a journalist can't quickly see which boroughs have a large pipeline that could weigh on prices. This tool puts it on one map, with an analyst you can question.

## Data (already downloaded into data/raw/ on 30 Oct 2026; cleaned once, never called at runtime)
- **Prices:** `data/raw/Average-prices-2026-08.csv` (columns Date, Region_Name, Area_Code, Average_Price, Monthly_Change, Annual_Change). Keep Area_Code E09000001–E09000033.
- **Starts and completions:** MHCLG Live Table 253 (annual by financial year) and 253a (quarterly), permanent dwellings started and completed by district: `data/raw/LiveTable253.ods`, `LiveTable253a.ods`. Read with SheetJS (`xlsx` npm). Keep the London districts.
- **Approvals:** NOT in the MVP. Current GLA Planning London Datahub data needs an access request. If access arrives, it is stretch item 8.
- **Boundaries:** `data/raw/statistical-gis-boundaries-london.zip` (GLA, 2011, ESRI). Extract the London borough shapefile and convert it to `data/boroughs.geojson` (simplified, under 1 MB, WGS84).
- Every dataset gets a row in `data/SOURCES.md`: URL, file name, date pulled, licence (OGL) and the period covered.
- **Never invent, estimate or interpolate figures.** A missing value is `null` and shows as "no data" in the UI.

## MVP scope (must ship)
1. **Ingest:** `scripts/ingest.ts` reads data/raw/ into SQLite tables `prices(borough_code, borough, month, avg_price)` and `pipeline(borough_code, borough, period, period_type ('FY'|'Q'), started_units, completed_units)`. Borough names are normalised to ONS codes (E09000001–E09000033).
2. **Metrics** (`lib/metrics.ts`, pure and tested):
   - price change over 12 months (%)
   - net pipeline build-up = starts over the last 3 financial years minus completions over the same 3 years (positive = homes accumulating under construction)
   - supply pressure ratio = net pipeline build-up ÷ average annual completions over those 3 years (null if completions are 0)
   - starts momentum = starts in the latest 4 quarters ÷ the prior 4 quarters − 1 (from 253a)
3. **Dashboard** at `/`: a choropleth of the 33 boroughs with a metric toggle (price change, net pipeline build-up, supply pressure, starts momentum) and a ranked side table. Clicking a borough opens `/borough/[code]` with two charts: price over time, and starts versus completions by year.
4. **Muse Spark — Ask London:** a natural-language box answered through **tool calling**. The tools are `list_boroughs()`, `get_borough_metrics(code)` and `rank_boroughs(metric, n, order)` over SQLite. Answers are 2 to 3 sentences that cite only returned numbers; if the data isn't there, the answer says so.
5. **Muse Spark — Borough brief:** on each borough page, a JSON card `{headline, supply_view, price_view, risk_flag: "low"|"medium"|"high", confidence}` generated from that borough's metrics only.

## Stretch (only if MVP passes by Tue 3 Nov 18:00 UK)
6. **Cycle phase:** a rule-based classifier (recovery / expansion / hypersupply / recession) from price momentum and supply pressure, tested. Muse Spark explains each borough's phase in one paragraph.
7. **Watch list:** pin boroughs and flag any whose supply pressure ratio is above a threshold you choose.
8. **Approvals layer:** only if GLA Planning London Datahub access is granted; adds approved-not-started units.

## Out of scope
Markets outside London, live scraping, accounts, investment advice.

## Acceptance criteria (demo-ready)
- Ingest is reproducible from data/raw/, and at least 10 tests cover name normalisation and every metric.
- The app runs with `MOCK_META=1` (zero spend) and live.
- Ask and Brief work live, and `logs/usage.jsonl` logs prompt, completion and cached tokens for every call.
- The README has a 30-second quick-start, a Mermaid architecture diagram, "How we use Meta models", the data sources and their limitations.
