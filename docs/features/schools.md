# Schools — amenity context

## What it does
`getSchoolsSignal(postcode)` reports access to good/outstanding state-funded
primary and secondary schools: distance to the nearest of each, count of each
within 1 km, and a 0–100 score (0 = best access, amenity direction).

## Score
`badness = dist_nearest_good_primary_m + dist_nearest_good_secondary_m`
(each capped at 20 km), `score` = London percentile rank of badness across all
332,639 London postcodes in `data/street.db`. Equal weights: primary and
secondary access matter equally for a family buyer; there is no other
weighting. Percentiles are precomputed at build time and stored in
`data/context/schools.db` table `postcode_metrics`.

## Sources (URLs)
- DfE Get Information About Schools all-establishments extract, downloaded
  2026-11-01: `https://ea-edubase-api-prod.azurewebsites.net/edubase/downloads/public/edubasealldata20261031.csv`
  (as-of 2026-10-31). Tried `edubasealldata20261101.csv` first: it returned
  HTTP 200 but only 34,215 rows with almost no academies (partial extract);
  stepped back one day to 20261031 (52,550 rows, 11,855 academy-type rows).
  Filter: open (`Open` / `Open, but proposed to close`), `GOR = London`,
  state-funded (excludes `Independent schools` type group, FE/HE,
  independent types), phase Primary / Secondary / All-through
  (incl. Middle-deemed), with easting/northing → OSGB36→WGS84 via pyproj
  (EPSG:27700→EPSG:4326). Result: 2,251 schools.
- Ofsted "State-funded schools inspections and outcomes" management
  information, latest inspections as at 30 Sep 2026:
  `https://assets.publishing.service.gov.uk/media/6ad095a72de3184ccf8b818d/Management_information_-_state-funded_schools_-_latest_inspections_as_at_30_Sep_2026.csv`
  via `https://www.gov.uk/government/statistical-data-sets/monthly-management-information-ofsteds-school-inspections-outcomes`.
  Joined on URN; uses `Latest OEIF overall effectiveness` (1 Outstanding /
  2 Good) and `Inspection start date of latest OEIF graded inspection`.
  980 of 2,251 London schools (44%) carry OEIF 1/2.

## Licence
- GIAS: Open Government Licence (DfE terms; reuse allowed with attribution).
- Ofsted MI: Open Government Licence v3.0.

## As-of
GIAS 2026-10-31; Ofsted MI 2026-09-30 (`asof` field = GIAS date).

## Caveats
- Ofsted dropped single-word judgements for new inspections from Sept 2024
  (report cards instead). Schools inspected since then without an overall
  effectiveness grade (`NULL` / `Not judged` in the MI file) count as
  not-good here — conservative; some may be good schools awaiting grading.
  Only the latest available overall effectiveness and its date are used.
- Distances are straight-line (haversine), not walking routes or catchments;
  admissions depend on each school's criteria, not proximity alone.
- 46% of `street.db` postcodes have no lat/lon; those are scored at their
  LSOA centroid (fallback MSOA centroid). `lsoa` codes in `street.db` are
  LSOA 2021 (ONS postcode lookup May 2026, per `meta.source`).
- Nursery, special, post-16-only and independent schools excluded by design.
- `data/raw/schools/` downloads are git-ignored (>10 MB).
