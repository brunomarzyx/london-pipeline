# Air quality (`air`)

## Method
Each located postcode in `data/street.db` is converted from WGS84 to OSGB
(eastings/northings) and sampled against the LAEI 2022 20 m concentration grids
for NO2 and PM2.5 (modelled 2022 annual means, µg/m³). Score = London percentile
of NO2 across the 180,733 located postcodes (100 = dirtiest). PM2.5 is reported
alongside; both are compared to the WHO 2021 guideline values (NO2 10 µg/m³
annual mean, PM2.5 5 µg/m³ annual mean).

London context from the built data: mean NO2 22.3 µg/m³ (max 86.7 at a road
hotspot), mean PM2.5 9.3 µg/m³ — every located London postcode exceeds both WHO
2021 guidelines, consistent with published LAEI findings.

## Sources (downloaded without login)
- `https://data.london.gov.uk/download/2lg5g/7jy/LAEI2022-Concentrations-Data-CSV.zip`
  (189 MB; `CSV/LAEI2022_V1_NO2.csv` + `CSV/LAEI2022_V1_PM25.csv`, `x,y,conc`
  OSGB 20 m grids, ~5.85M cells each) from the dataset page
  `https://data.london.gov.uk/dataset/london-atmospheric-emissions-inventory--laei--2022`
  ("London Atmospheric Emissions Inventory LAEI 2022"; base year 2022; published
  Aug 2025, superseding LAEI 2019). As-of date used: **2022**.
- Attempt history: LAEI 2019 page documents the same CSV product, but 2022 is
  newer and smaller (189 MB vs 562 MB), so 2022 was used per the "LAEI 2019 or
  newest" clause. No login needed.

## Licence
London Datastore data is published for reuse (check dataset page terms; GLA open
data). LAEI © Greater London Authority / Transport for London.

## Caveats
- Modelled annual means, not measurements; 20 m grid cannot resolve
  street-canyon peaks at a doorstep. Postcode value = nearest grid cell to the
  postcode centroid (OS Code-Point Open coordinates).
- WGS84→OSGB conversion is a Helmert + transverse-Mercator implementation in
  `scripts/context/air/build.py`, validated to sub-metre agreement against
  pyproj (`EPSG:4326`→`EPSG:27700`) at 5 London points.
- Grid cells missing from the clipped LAEI raster (outside its irregular
  boundary): none of the 180,733 located postcodes fell outside; 151,906 lookup
  postcodes have no coordinates and return `available: false`.
- `lsoa` codes in `street.db` start with `E01` (all 332,639 rows), consistent
  with LSOA 2021; confirmed via `data/SOURCES.md` (ONS lookup May 2026).

## Reproduce
`.venv/bin/python scripts/context/air/download.py` then
`.venv/bin/python scripts/context/air/build.py` (streams the zip, no extraction;
pyproj only needed to re-run the validation snippet).
