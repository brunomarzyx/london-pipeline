# New housing supply (`pipeline`)

Signal per postcode: approved-not-started plus under-construction homes within
1 km of the postcode's LSOA centroid, as a London percentile across LSOAs
(100 = worst), with the top 3 schemes by units (reference, borough, status,
decision date). Direction "risk": new supply competes with existing stock on
price and rent growth.

## Method

1. Download from the Planning London Datahub guest API
   (`https://planningdata.london.gov.uk/api-guest/applications/_search`,
   Elasticsearch-style, no key — verified working 1 Nov 2026):
   `decision = Approved`, `total_no_proposed_residential_units >= 1`,
   centroid inside the London bbox, `decision_date` 2015-01-01..2026-09-30,
   sliced by decision quarter (`scripts/context/pipeline/download_pld.py`).
   52,532 unique records → `data/raw/pipeline/pld_approved_2015.jsonl`
   (20.3 MB, gitignored).
2. Classify (`build_pipeline.py`): `actual_completion_date` present →
   completed; `actual_commencement_date` present → started/under construction;
   `lapsed_date` past with no start → dropped as dead pipeline (12,515);
   else approved-not-started. Result: 29,575 completed, 4,809 started,
   5,633 not started.
3. Dedupe: records within ~11 m merged to the largest scheme (4,064 merged;
   condition discharges/amendments otherwise double-count the parent).
   Conservative: adjacent distinct sites can merge; phases collapse to the
   parent total. 9,136 active sites remain.
4. Per LSOA: sum units within 1 km of the LSOA centroid (postcode-centroid
   mean from `data/street.db`), top-3 sites by units, percentile of the total
   across all 4,994 LSOAs. `data/context/pipeline.json` (2.8 MB).

## Sources

- Planning applications: Planning London Datahub / London Development
  Database family, Greater London Authority, via the public guest API above.
  As-of 2026-11-01 (download date; decisions to 2026-09-30). Licence: check
  planningdata.london.gov.uk terms before redistribution — used here as
  derived aggregates only.
- Postcode→LSOA geography: repo `data/street.db` (LSOA 2021 — see `epc.md`).

## Accuracy notes

- Every number comes from the download: units are the Datahub's
  `total_no_proposed_residential_units` (net proposed figure per application).
- Status reflects borough-reported `actual_commencement_date` /
  `actual_completion_date`, which are patchily filled — "approved, not
  started" includes schemes whose start was never recorded, so pressure may
  overstate unbuilt stock; completed schemes are excluded from pressure.
- LDD residential exports on London Datastore were not needed: the Datahub
  guest API (attempt 1) returned full records, so no second source was tried.
- Centroid outliers (e.g. 49.76, −7.55 defaults) are cut by the bbox filter.
