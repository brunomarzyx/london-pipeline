# Short-let pressure (`shortlets`)

Signal per postcode: entire-home Airbnb listings in the postcode's LSOA 2021
and how many are available >90 nights/year (London's 90-night rule for
short-term lets). Score = London percentile of the entire-home count across
all London LSOAs (100 = worst). Direction "risk": short lets remove homes
from long-term supply, pressuring prices/rents.

## Method

1. Download `listings.csv.gz` for the latest London date from
   [Inside Airbnb — Get the Data](https://insideairbnb.com/get-the-data/)
   (used 2026-09-17; 91,954 rows) into `data/raw/shortlets/` (gitignored).
2. Keep `room_type == "Entire home/apt"` with valid coords (61,074); assign
   each to the nearest postcode centroid in `data/street.db` (grid-bucketed
   search, ~180k centroids with lat/lon). All 61,074 matched.
3. Count per LSOA: `n` (entire-home), `gt90` (`availability_365 > 90`).
   Percentile over all 4,994 London LSOAs including zeros.
4. Write `data/context/shortlets.json` (0.2 MB).

## Sources

- Listings: Inside Airbnb, London `2026-09-17`
  `https://data.insideairbnb.com/united-kingdom/england/london/2026-09-17/data/listings.csv.gz`,
  Creative Commons Attribution 4.0 International License. As-of 2026-09-17
  (scrape date). Totals: 91,954 listings, 61,074 entire-home, 33,717 of those
  available >90 nights/year.
- Postcode→LSOA geography: repo `data/street.db` (LSOA 2021 — see `epc.md`).

## Dwelling denominator: not available (recorded attempts)

Per-1,000-dwellings was preferred, but ONS Census 2021 dwelling counts via
nomis could not be fetched unattended:

1. nomis search API (`/api/v01/dataset/def.sdmx.json?search=…`) returns an
   empty structure without a registered `uid` — registration is not possible
   unattended.
2. The `c2021ts041` (Number of Households) download page (HTTP 200) builds
   its CSV links in JavaScript — no static CSV href to fetch.
3. Direct API guesses (`/api/v01/dataset/c2021ts041.…`) return the API help
   page, not data.

Per the spec fallback, the score is the per-LSOA count percentile instead
(`denominator` field in the JSON says so). LSOAs vary in size, so dense
central LSOAs score higher partly by construction — noted as a caveat, and a
per-dwelling version should replace this when nomis access exists.

## Caveats

- `availability_365` is Inside Airbnb's forward availability estimate, not
  measured let nights; ">90 available" flags listings plausibly breaching the
  90-night rule, not proven breaches.
- Nearest-centroid assignment can misallocate listings near LSOA edges; counts
  are densities, not exact addresses.
- Inside Airbnb scrapes public listings; coverage/timing reflect the scrape.
