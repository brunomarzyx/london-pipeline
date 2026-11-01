# Area Risk Score

Weighted mean of the 10 available context signals (0 = best, 100 = worst),
rounded. `transport-premium` is excluded: sales data starts Oct 2023, so no
pre-2022 baseline exists. Overall score = Σ(weight × score) / Σ(weights) over
available components. Band: Low <33 / Moderate 33–55 / Elevated 55–70 /
High >70. Coverage <5/10 → "low coverage", no band. Drivers = 3 largest
weight×score; strengths = 2 lowest scores.

## Buyer weights

| Component | w | Reason |
|---|---|---|
| flood | 2 | ruin risk for an owner-occupier |
| schools | 1.5 | family buyers pay for catchments |
| air | 1 | daily health exposure |
| noise | 1 | daily comfort |
| transport-proximity | 1 | commute access |
| greenspace | 1 | nearby open space |
| heritage | 0.5 | planning friction, rarely binding |
| epc | 0.5 | running costs, upgradeable |
| shortlets | 0.5 | neighbour nuisance only |
| pipeline | 0.5 | future supply, slow to matter for living |

## Investor weights

| Component | w | Reason |
|---|---|---|
| pipeline | 2 | new supply competes on price and rent |
| shortlets | 1.5 | visitor-led demand / regulation proxy |
| epc | 1.5 | MEES letting risk for F/G stock |
| flood | 1.5 | insurance and mortgageability |
| transport-proximity | 1 | rental demand follows access |
| air | 0.5 | priced in weakly |
| noise | 0.5 | priced in weakly |
| schools | 0.5 | matters less for typical rental stock |
| greenspace | 0.5 | priced in weakly |
| heritage | 0.5 | planning friction, rarely binding |

## Limits

Scores are percentiles/bands within London, not absolute risk. Components
missing for a postcode are dropped (reweighted), so two postcodes with
different coverage are not strictly comparable. Flood zones are Aug 2023;
PTAL underlies transport access at 2015.

## Screen index

`/screen` joins buyer score + flood-zone flag per LSOA from
`data/context/area-score-lsoa.json` (representative = busiest-sales
postcode per LSOA). Rebuild with the esbuild command at the top of
`scripts/build-area-score-lsoa.ts` after any street.db or signal refresh.
Live-scoring all ~5k representative postcodes costs ~2.7s, hence the file.
Rows missing from the index get nulls: a max-score filter drops them, the
flood filter keeps them (unknown is not Zone 3).
