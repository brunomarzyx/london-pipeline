# EPC & retrofit risk (`epc`)

Signal per postcode: share of EPC-rated homes rated D–G / E–G / F–G and median
rating, via a street → sector → LSOA → MSOA ladder (first level with n ≥ 10;
min_n = 10 matches the default in `lib/street.ts`, chosen so a single block of
certificates cannot swing the headline). Score = London percentile of the
D-or-below share across areas at the chosen level (100 = worst).

## Method

1. Read the main repo's EPC extract read-only:
   `../london-pipeline/data/street/epc/epc_*.parquet` (latest certificate per
   home, deduped by UPRN else address+postcode keeping max `lodgement_date`).
   No re-download (extract is ~4.6M rows / 3.0M unique London homes).
2. Join each cert's postcode to `data/street.db` postcodes for
   street_key/sector/LSOA/MSOA codes.
3. Aggregate counts A–G per (level, code); compute shares, median letter, and
   the percentile of `share_dg` within each level.
4. Write `data/context/epc.json` (5.3 MB).

## Sources

- EPC data: MHCLG domestic EPC full load, Energy Performance of Buildings Data,
  Open Government Licence, via `https://get-energy-performance-data.communities.gov.uk`
  (fetched in main repo; see `logs/epc-fetch.log` there). As-of 2026-12-31
  (latest cert year present).
- Postcode geography: repo `data/street.db` (LSOA codes are LSOA 2021 —
  verified: `SE15 4AN → E01032782`, an E0103xxxx 2021 code; 4,994 distinct
  LSOAs matches the 2021 London count).

## MEES letting rules (checked 1 Nov 2026)

- **In force:** minimum EPC **E** for domestic private rented lets in England
  and Wales — all tenancies since 1 April 2020, under the Energy Efficiency
  (Private Rented Property) Regulations 2015. Source:
  [gov.uk landlord guidance](https://www.gov.uk/guidance/domestic-private-rented-property-minimum-energy-efficiency-standard-landlord-guidance)
  (last updated 5 May 2026, still states band E).
- **Proposed, NOT in force:** EPC **C by 1 October 2030** (Warm Homes Plan,
  Jan 2026); needs an Act of Parliament + amending SI expected ~2027.
  `facts.mees_proposed` says "C by 2030 (announced, not in force)".

## Caveats

- EPCs cover only homes certified since 2008 (~3M of ~3.7M London homes);
  new builds skew ratings up, older unrated stock is invisible.
- One cert per home (latest lodgement); rating changes from retrofit are
  captured only when re-certified.
- Direction "risk": poor ratings mean retrofit cost exposure and letting
  restrictions for landlords — a drag on price/rent growth, not an amenity.
