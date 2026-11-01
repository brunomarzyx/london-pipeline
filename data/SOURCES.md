# Data sources (all Open Government Licence v3; pulled 30 Oct 2026)

| File | Source | URL | Covers |
|---|---|---|---|
| data/raw/Average-prices-2026-08.csv | HM Land Registry, UK House Price Index (Aug 2026 release) | https://publicdata.landregistry.gov.uk/market-trend-data/house-price-index-data/Average-prices-2026-08.csv | monthly Apr 1968–Aug 2026 (London borough rows Jan 1995–Aug 2026); ingest keeps Area_Code E09000001–E09000033 |
| data/raw/LiveTable253.ods | MHCLG Live Table 253: permanent dwellings started and completed, by tenure and district (annual) | https://assets.publishing.service.gov.uk/media/6ab3e288734e2435f202ef4e/LiveTable253.ods | financial years 1980-81 to 2025-26; ingest uses 2023-24, 2024-25, 2025-26 |
| data/raw/LiveTable253a.ods | MHCLG Live Table 253a: same, quarterly | https://assets.publishing.service.gov.uk/media/6ab3e296fe72ed1e2b02ef82/LiveTable253a.ods | quarters Q1 2005 to Q2 2026; ingest uses Q3 2024 to Q2 2026 |
| data/raw/statistical-gis-boundaries-london.zip | GLA Statistical GIS Boundary Files for London (2011) | https://data.london.gov.uk/download/20od9/9ba8c833-6370-4b11-abdc-314aa020d5e0/statistical-gis-boundaries-london.zip | boundaries; maps must carry the copyright notice from the GLA dataset page |
| data/raw/PIPR-monthly-2026-10.xlsx | ONS Price Index of Private Rents (PIPR), UK monthly price statistics (Table 1), released 21 Oct 2026 | https://www.ons.gov.uk/economy/inflationandpriceindices/datasets/priceindexofprivaterentsukmonthlypricestatistics | OGL v3; monthly Jan 2015–Sep 2026; ingest keeps Area codes E09000002–E09000033 for Sep 2026 and Sep 2025 (Rental price = average monthly rent). City of London (E09000001) is suppressed by ONS in every month → null |
| data/raw/price-paid-london-2024-2025.csv | HM Land Registry Price Paid Data yearly files, London extract (County = GREATER LONDON; columns transfer_date, price, district, new_build) | https://www.gov.uk/government/statistical-data-sets/price-paid-data-yearly-file (source files https://price-paid-data.publicdata.landregistry.gov.uk/pp-2025.csv and https://price-paid-data.publicdata.landregistry.gov.uk/pp-2024.csv) | OGL v3 (full files 163–173 MB not kept; extract keeps London rows only, ~7 MB). Yearly files hold current (A) records with Date of Transfer in that calendar year; ingest keeps transfers dated 2024 (prior 12m) and 2025 (latest full 12m), all 33 boroughs. Street-level address columns dropped, so no Royal Mail/OS display conditions apply |

Not used: GLA Planning London Datahub approvals (needs an access request); LDD archive (ends 2019).

## Area Risk Score context signals (all feed `lib/area-score.ts`; per-signal docs in `docs/features/area-score.md`)

| Signal | File | Source | Licence | Covers |
|---|---|---|---|---|
| Flood risk | data/context/flood.db | Environment Agency Flood Map for Planning (Rivers and Sea) via planning.data.gov.uk dataset flood-risk-zone | OGL v3 | Flood Zone 1/2/3 per postcode; zones Aug 2023 |
| Air quality | data/context/air.db | GLA/TfL London Atmospheric Emissions Inventory (LAEI) 2022, via London Datastore | OGL v3 | modelled annual-mean concentrations, 2022 |
| Noise | data/context/noise.db | Defra strategic noise mapping Round 4 (2022) Lden, road and rail | OGL v3 | 10 m Lden grids sampled per postcode, 2022 |
| Schools | data/context/schools.db | DfE Get Information About Schools (GIAS) all-establishments extract + Ofsted outcomes | OGL v3 | GIAS Oct 2026; Ofsted Sep 2026 |
| Transport proximity | data/context/transport.db + data/street.db | TfL open data (Elizabeth line StopPoints) + TfL PTAL 2015; price-premium leg uses Price Paid sales Oct 2023–Sep 2026 (excluded from scoring: no pre-2022 baseline) | OGL v3 / TfL open data | Sep 2026 |
| Greenspace | data/context/greenspace.db | OS Open Greenspace (TQ square, GML via OS Data Hub downloads API) | OS Open Data | Nov 2026 |
| Heritage | data/context/heritage.db | planning.data.gov.uk conservation-area, listed-building, article-4-direction-area CSVs | OGL v3 | Nov 2026 |
| EPC / MEES risk | data/context/epc.json | MHCLG domestic EPC register full load via main-repo extract, latest certificate per home | OGL v3 | to Dec 2026 |
| Short lets | data/context/shortlets.json | Inside Airbnb London listings | CC BY 4.0 | Sep 2026 |
| Development pipeline | data/context/pipeline.json | Planning London Datahub guest API, approved decisions 2015-01-01 to 2026-09-30 with ≥1 proposed residential unit | GLA | Nov 2026 |
| Screen index (derived) | data/context/area-score-lsoa.json | built by `scripts/build-area-score-lsoa.ts` from street.db + the 10 signals above | derived | rebuilt on data refresh |

## Street-level data (all OGL v3; pulled Oct 2026; built with `scripts/street/run_all.sh` → `data/street.db`)

| File | Source | Covers |
|---|---|---|
| Price Paid yearly files (pp-2016.csv → pp-2026) | HM Land Registry Price Paid Data (OGL v3), https://www.gov.uk/government/statistical-data-sets/price-paid-data-downloads | Category A (standard market) sales only, types D/S/T/F, price in [£50k, £50m]; London rows kept in `data/street/ppd_london.parquet` |
| ONS Postcode to OA/LSOA/MSOA lookup, May 2026 | ONS Geoportal postcode lookup | Every London postcode mapped to LSOA/MSOA/LAD + lat/lon (`data/street/pcd`, OS Code-Point Open coordinates) |
| OS Code-Point Open | Ordnance Survey (via ONS lookup) | Postcode coordinates |

Method: keep category A sales from the last 36 months (to 2026-09-30); drop log-price outliers beyond 3×IQR within MSOA × type; aggregate medians/p25/p75 at street → sector → LSOA → MSOA → borough → London; a level is reliable (`reliable=1`) only with n ≥ 10; repeat-sales BMN index per MSOA/borough/London (pairs ≥ 60), reported as 12-month-average vs prior-12-month change (`rs_chg_1y/5y`). Street code is `"<postal district>|<STREET>"` (e.g. `E14|MARSH WALL`).

## Global capitals view (BIS; pulled 30 Oct 2026; build with `python3 scripts/build-global.py data/global.json`)

| File | Source | URL | Covers |
|---|---|---|---|
| data/raw/bis-dpp-col.zip | BIS detailed residential property prices (topic RPP) | https://data.bis.org/static/bulk/WS_DPP_csv_col.zip | city series used (see below); reduced to `data/global.json` |
| data/raw/bis-long-cpi-col.zip | BIS long consumer-price series (national CPI, monthly index level) | https://data.bis.org/static/bulk/WS_LONG_CPI_csv_col.zip | monthly CPI to 2026-09 (AU 2026-06, IL 2026-08) for deflation |
| data/raw/bis-cbpol-flat.zip | BIS central bank policy rates (daily, month-end taken) | https://data.bis.org/static/bulk/WS_CBPOL_csv_flat.zip | month-end rates to 2026-10 for GB, XM, IL, CA, BR, AU, JP |

City series used (all nominal; `lib/global.ts` deflates with national CPI into real indices):

| City | BIS Series id | What it is | Latest |
|---|---|---|---|
| London | M:GB:2:1:0:1:0:0 | all dwellings, GBP per dwelling, monthly | 2026-08 |
| Paris | Q:FR:2:8:1:1:0:0 | existing flats index, quarterly | 2026-Q2 |
| Berlin | Q:DE:2:1:0:2:6:0 | all dwellings index, quarterly | 2026-Q2 |
| Tel Aviv | M:IL:3:1:0:1:6:0 | all dwellings index, monthly | 2026-06 |
| Toronto | Q:CA:3:0:0:2:6:0 | Greater Toronto index, quarterly | 2026-Q2 |
| Sao Paulo | M:BR:2:1:0:2:6:0 | all dwellings index, monthly | 2026-08 |
| Sydney | Q:AU:2:1:0:2:6:0 | all dwellings index, quarterly | 2026-Q2 |
| Tokyo | M:JP:3:1:0:3:6:0 | all dwellings index, monthly | 2025-12 |

Paris and Berlin use the euro-area (XM) policy rate. The 10-year peak for Tel Aviv uses available history only (series starts 2017).

Checked but not included: Dubai (city series ends 2024-04 and BIS has no UAE policy rate); New York (BIS US city series `Q:US:3:2:1:3:6:0` does not name the metro, so it cannot be labelled); Singapore, Istanbul, Seoul, Mexico City (series found, cut to keep 8 cities with Europe/Middle East/North America/South America/Asia-Pacific spread).

## Floor areas (£ per sq m) — MHCLG domestic EPC register
- Source: get-energy-performance-data.communities.gov.uk, domestic full load (CSV zip, last updated 13 Oct 2026), OGL. Bearer token in `.env` as `EPC_TOKEN` (never committed).
- `scripts/street/04_epc_fetch.py` streams the 8.3 GB zip with HTTP range requests and keeps London rows only (local_authority E09*): 4,601,394 certificates, 2008–2026. The zip is never written to disk.
- `scripts/street/05_epc_join.py` matches Land Registry sales to certificates on postcode + house/flat numbers, tie-broken by address-word overlap; floor area from the certificate closest in time to the sale. Areas outside 15–1,000 sq m and prices outside £1,500–£60,000/sq m are dropped.
- Match rate (all London sales 2016–Sep 2026): 90.1% overall; flats 91.8%, terraced 97.2%, semis 98.1%, detached 96.6%, "other" 25% (mostly non-standard/commercial). 99% of matches share at least half their address words.
- Limits: floor area is as assessed at the certificate date, so later extensions can be missed; unmatched sales are excluded from £/sq m but still count in price medians.
