# Heritage — planning-constraint context

## What it does
`getHeritageSignal(postcode)` frames heritage as a planning constraint
(direction `risk`): inside a conservation area (y/n + name), listed buildings
within 100 m (count + nearest with grade/distance), inside an Article 4
direction area (y/n). Banded score 0/40/70/100 (0 = best = no constraint).

## Score bands (with reasons)
- **0** — none of the three recorded nearby: standard permitted development.
- **40** — listed building(s) within 100 m only: setting consideration for
  neighbours; no direct control on the property itself (hence lower than 70).
- **70** — inside a conservation area and/or an Article 4 direction area:
  direct controls (demolition in CA, restricted permitted development under
  Article 4), so extensions/alterations are harder.
- **100** — compounding: inside a CA/A4 area AND listed building(s) within
  100 m, or inside both a CA and an A4 area.

## Sources (URLs) — all downloaded 2026-11-01, first attempt each
- `https://files.planning.data.gov.uk/dataset/conservation-area.csv`
  (10,780 rows, 49.7 MB) → 1,356 live London polygons (27 ended-date rows
  excluded; geometry-bbox must intersect the London bbox).
- `https://files.planning.data.gov.uk/dataset/listed-building.csv`
  (382,378 rows, 89.2 MB) → 24,036 live London points.
- `https://files.planning.data.gov.uk/dataset/article-4-direction-area.csv`
  (7,649 rows, 24.1 MB) → 2,604 live London polygons.
- The `organisation` column is blank in these snapshots, so London filtering
  is geographic (POINT in bbox for listings; geometry-bbox intersection for
  polygons — centroid filtering would wrongly drop edge-straddling areas).

## Licence
planning.data.gov.uk data: Open Government Licence (crown/collected data;
check dataset pages for attribution).

## As-of
2026-11-01 (download date; `asof` field). planning.data.gov.uk is a live
collection; entity entry-dates vary.

## Caveats
- Coverage depends on what each borough has supplied to planning.data.gov.uk;
  gaps mean "not recorded", not "no constraint" — conveyancing searches
  remain authoritative.
- 45% of London postcodes fall in an Article 4 area, many under borough-wide
  directions (772 distinct directions hit postcodes; top one covers 31,062
  postcodes). Not every direction restricts householder works (some target
  HMOs or office-to-residential change of use) — the flag means "a direction
  applies here; check what it removes with the borough".
- Point-in-polygon uses the even-odd rule over all rings (holes handled
  unless overlapping other shells). Listed counts use straight-line 100 m.
- Postcodes without coords scored at LSOA/MSOA centroid (as schools).
- Band counts: 0: 119,949 · 40: 21,361 · 70: 90,469 · 100: 100,860.
