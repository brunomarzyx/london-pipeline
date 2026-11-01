# Greenspace — amenity context

## What it does
`getGreenspaceSignal(postcode)` reports public green access: distance to the
nearest public park/garden/playing-field access point and public green area
within 800 m, scored 0–100 (0 = best, amenity). Score = mean of the London
percentile of access-point distance and the London percentile of green area
(inverted) — equal weights: a buyer needs green space both near and of usable
size. Precomputed per postcode for all 332,639 London postcodes.

## Sources (URLs)
- OS Open Greenspace, TQ 100 km square, GML3 via the OS Data Hub downloads
  API (no key): `https://api.os.uk/downloads/v1/products/OpenGreenspace/downloads`
  file `opgrsp_gml3_tq.zip` → `data/raw/greenspace/` (5.2 MB zip, 52.8 MB GML).
  Downloaded 2026-11-01. TQ covers all of Greater London (envelope
  499596,99770–600740,201001 OSGB36).
- 21,992 sites in TQ; kept functions `Public Park Or Garden` (3,312) and
  `Playing Field` (2,325) → 5,637 sites, 23,028 access points. Excluded by
  design: Play Space (6,563, mostly small playgrounds often inside kept
  sites), Other Sports Facility, Tennis Court, Golf Course, Allotments,
  Religious Grounds, Cemeteries, Bowling Greens.

## Licence
OS Open Greenspace is © Ordnance Survey, available under the OS Open Data
licence (see `licence.txt` inside the download).

## As-of
2026-11-01 (download date; `asof` field). OS metadata: "Ordnance Survey Crown
Copyright 2026".

## Caveats
- Access points are entrances OS captured; distance is straight-line to the
  nearest one, not a walking route.
- Area counts the FULL area of any kept site containing the postcode or
  touching its 800 m circle (exact point-in-polygon / edge-distance test, so
  large parks like Hampstead Heath and Richmond Park count correctly), capped
  at the 800 m circle area (π·800² ≈ 201 ha). Overlapping designations (e.g.
  a playing field inside a park) count twice below the cap; polygon holes are
  not subtracted. Treat area as an upper-bound estimate.
- Sites outside London but inside TQ (Kent/Surrey/Essex/Herts fringe) are
  included — correct for border postcodes whose nearest green is across the
  boundary.
- Postcodes without coords scored at LSOA/MSOA centroid (as schools).
- Median across London: 235 m to nearest access point, 24.1 ha within 800 m.
