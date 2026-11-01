# Flood risk (`flood`)

## Method
Each postcode in `data/street.db` with coordinates is tested by point-in-polygon
against Environment Agency Flood Map for Planning (Rivers and Sea) zone polygons.
A postcode takes the highest overlapping zone: Flood Zone 3 (high probability,
≥1% annual river / ≥0.5% sea), Flood Zone 2 (medium, 0.1–1% river / 0.1–0.5% sea),
else Flood Zone 1 (low, <0.1% — FZ1 is everywhere not in FZ2/FZ3 by definition).

Score: FZ1 → 5, FZ2 → 55, FZ3 → 90. Equal steps on the 3-point ordinal band scale
(0 = best, 100 = worst), leaving headroom at both ends because the jump FZ2→FZ3
(medium→high probability) matters more than FZ1→FZ2. Bands are used instead of a
London percentile because zone is already an absolute national risk statement.

Coverage of the 332,639 London-area postcodes: 180,733 located (54.3%) —
FZ3 20,106 (11.1%), FZ2 5,118 (2.8%), FZ1 155,509 (86.0%); 151,906 postcodes
(45.7%) have no coordinates in the lookup (mostly historic/terminated units) and
return `available: false`.

## Sources (all downloaded without login)
- `https://files.planning.data.gov.uk/dataset/flood-risk-zone.csv` (2.0 GB
  national; streamed once, 45,349 London-intersecting rows kept in
  `data/raw/flood/flood-risk-zone-london.csv`) — authoritative Digital Land
  mirror of the EA Flood Map for Planning. Entry-date 2023-08-24; `flood-risk-level`
  2/3 only (FZ1 is unmapped by definition); `flood-risk-type` mostly Fluvial
  Models / Tidal Models. As-of date used: **2023-08-24**.
- Attempted but NOT used: `data.gov.uk` CKAN API (endpoint retired — the
  `package_search` API now returns an HTML placeholder page); Defra DSP portal
  search API (JS app, no usable JSON without a browser session). Risk of Flooding
  from Rivers and Sea (RoFRS) postcode-level data was therefore not obtained —
  Flood Zone only. RoFRS per-postcode WMS sampling is recorded as future work.

## Licence
Open Government Licence v3 (EA / Digital Land planning data).

## Caveats
- FMfP ignores flood defences (Thames Barrier): defended riverside postcodes
  (e.g. E14 Isle of Dogs) still score FZ3. This matches how insurers/lenders
  read the map, but overstates residual risk behind defences.
- Point-in-polygon on the postcode centroid: large postcodes spanning a zone
  boundary take the zone at their centroid point only.
- Zone polygons clipped to an expanded London bbox (lon −0.65…0.50, lat
  51.20…51.80); edge postcodes outside it but in the lookup: none (lookup max
  extent is inside the bbox).
- `lsoa` codes in `street.db` start with `E01` (all 332,639 rows), consistent
  with LSOA 2021 (`E01000001–E010xxxxx`); 2011 LSOAs also used `E01`, so the
  vintage was confirmed via `data/SOURCES.md` (ONS lookup May 2026 → LSOA 2021).

## Reproduce
`.venv/bin/python scripts/context/flood/download.py` then
`.venv/bin/python scripts/context/flood/build.py`.
