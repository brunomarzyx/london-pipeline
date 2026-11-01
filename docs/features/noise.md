# Noise (`noise`)

## Method
Each located postcode in `data/street.db` is converted WGS84→OSGB and sampled
against Defra strategic noise mapping Round 4 (2022 situation) 10 m Lden grids
for road and rail. Band per source (WHO/END banding): <55 dB low, 55–65 medium,
65–70 high, >70 very high. Grid value 0 means below the strategic-mapping
threshold and counts as low (it does not mean 0 dB of sound). Postcode band =
the noisier of road/rail; score low → 15, medium → 50, high → 80, very high →
95 (equal steps on the 4-point ordinal band scale, headroom at both ends).

Coverage of the 332,639 London-area postcodes: 180,733 located (54.3%) —
low 90,546 (50.1%), medium 58,088 (32.1%), high 19,300 (10.7%), very high
12,799 (7.1%); 151,906 postcodes (45.7%) have no coordinates in the lookup and
return `available: false`.

## Sources (downloaded without login)
- Road: WCS GetCoverage on
  `https://environment.data.gov.uk/spatialdata/road-noise-all-metrics-england-round-4/wcs`,
  coverage `...__Road_Noise_Lden_England_Round_4_All`
  (from dataset page `https://www.data.gov.uk/dataset/38b1444f-47a0-42ca-a358-0d145fcf7d5c/road-noise-all-metrics-england-round-4`,
  "Road Noise - All Metrics - England Round 4").
- Rail: WCS GetCoverage on `https://environment.data.gov.uk/spatialdata/noise-data/wcs`,
  coverage `...__Rail_Noise_Lden_England_Round_4_All`
  (from dataset page `https://www.data.gov.uk/dataset/6747d18d-b43e-4b0e-a45f-e8bc542d657c/rail-noise-all-metrics-england-round-4`,
  "Rail Noise - All Metrics - England Round 4").
- Both clipped to E 503400–561700 / N 156300–201100 (padded London), 5830×4480
  float32 10 m GeoTIFFs, ~113 MB each in `data/raw/noise/`. As-of date: **2022**
  (Round 4 models the 2021 situation, published 2025; labelled 2022).
- Attempt history: the DSP "download by area of interest" links are JS-gated
  (no usable API); no WFS endpoint exists for Round 4; direct raster downloads
  are not offered. WCS GetCoverage worked first time and returns the raw grid,
  so no WMS GetFeatureInfo sampling was needed for the build — though GFI was
  used to independently validate the grids (see Caveats).

## Licence
Open Government Licence v3 (Defra / Environment Agency).

## Caveats
- Independent check: live WMS GetFeatureInfo at 10 spot points agreed with the
  downloaded grids to ≤0.1 dB in 7 of 9 successful probes; the 2 outliers
  (2.7–4.5 dB) sit exactly on 10 m pixel boundaries inside extreme gradients
  next to major roads/railways, i.e. sub-pixel registration between the
  server-side transform and the build's Helmert (validated to sub-metre vs
  pyproj in the air feature). Values at such points are grid-faithful but
  boundary-sensitive — inherent to 10 m sampling, not a data error.
- Strategic maps model major sources only and ignore Diurnal detail below the
  threshold; not a substitute for a BS 4142 / ProPG assessment. Aircraft noise
  is out of scope (separate CAA/Defra product).
- `lsoa` codes in `street.db` start with `E01` (all 332,639 rows), consistent
  with LSOA 2021; confirmed via `data/SOURCES.md` (ONS lookup May 2026).

## Reproduce
`.venv/bin/python scripts/context/noise/download.py` then
`.venv/bin/python scripts/context/noise/build.py` (pure stdlib incl. tiled
float32 TIFF reader).
