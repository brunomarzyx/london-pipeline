# Transport — Elizabeth line effect

## What it does
`getTransportSignal(postcode)` returns two signals:
1. `transport-proximity` — distance to the nearest Elizabeth line station in
   Greater London, scored 0–100 (0 = best, amenity). Score = London percentile
   of straight-line distance across all 332,639 London postcodes.
2. `transport-premium` — informational only (`score: null`): median sale price
   within 1 km of an Elizabeth line station vs the borough median over the
   same window, with sale counts.

## Sources (URLs)
- TfL open data, `Line/elizabeth` StopPoints snapshot 2026-11-01
  (`data/raw/transport/tfl_elizabeth_stoppoints.json`):
  `https://api.tfl.gov.uk/Line/elizabeth/StopPoints` (no key required).
  43 stop points returned; 31 kept inside Greater London (dedupe Liverpool
  Street/Paddington pairs; excluded 12: Burnham, Brentwood, Iver, Langley,
  Maidenhead, Reading, Shenfield, Slough, Taplow, Twyford — all outside
  London). NaPTAN bulk CSV
  (`https://naptan.api.dft.gov.uk/v1/access-nodes?dataFormat=csv`, ~100 MB)
  was probed successfully but not needed — TfL coords used directly.
- Sales: `data/street.db` table `sales` (HM Land Registry Price Paid),
  window 2023-10-01 to 2026-09-30, via indexed postcode lookups.

## Opening dates (documented, in `stations` table)
- Central section (Paddington–Abbey Wood) opened **24 May 2022**; all central
  stations and the TfL Rail surface branches rebranded to Elizabeth line
  service from that date.
- **Bond Street opened 24 Oct 2022** (late).
- Through-running Stratford–Paddington Nov 2022; full end-to-end timetable
  May 2023. Surface stations themselves are mostly Victorian-era; the
  "treatment" here is Elizabeth line service, not the station opening.

## Licence
TfL open data (TfL terms / OGL-compatible); Price Paid OGL v3.0.

## As-of
2026-09-30 (sales window end; `asof` field).

## Caveats — read before quoting a "premium"
- The requested before (2019–2021) vs after (2022–2025) design is **not
  possible**: `street.db` holds sales from 2023-10-01 only — entirely
  post-opening, no pre-2022 baseline, no repeat-sales pairs table. The premium
  is a same-window cross-section (near-station median vs borough median).
- Borough premiums range from +39% (Hillingdon) to −27% (Waltham Forest):
  composition effects dominate (flats vs houses, new-build share near
  stations). No mix adjustment; n < 10 near-station sales → unavailable.
- Distances are straight-line; station catchments follow lines and buses,
  not circles. Correlation is not causation.
- Postcodes without coords scored at LSOA/MSOA centroid (as schools).
