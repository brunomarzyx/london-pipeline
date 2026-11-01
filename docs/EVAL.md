# Ask London live eval — 2026-11-01T02:35:43.084Z

## Is £650,000 fair for a flat in E14 9AF?

Answer: Yes, £650,000 looks fair for a flat in E14 9AF, sitting below the street-level typical price. Recent flat sales on Marsh Wall, E14 (n = 437) show a median of £762,500, with the middle half from £605,000 to £873,000. Repeat-sales momentum from the wider MSOA is +10.3% over one year.

Rounds: 3; verifier: 5/5 PASS; wall ms: 24900

## Which has higher supply pressure, Tower Hamlets or Newham?

Answer: Tower Hamlets has higher supply pressure than Newham. Tower Hamlets is at −0.93x on a three-year net build-up of −1,070 homes, compared with Newham at −1.27x on −1,860 homes.

Rounds: 4; verifier: 4/4 PASS; wall ms: 9727

## Which 3 boroughs have the highest gross rental yield?

Answer: The 3 boroughs with the highest gross rental yield are Tower Hamlets, Newham and Lambeth. Yields are 6.6% in Tower Hamlets, 6.0% in Newham and 5.6% in Lambeth.

Rounds: 2; verifier: 3/3 PASS; wall ms: 3179

## What are Tower Hamlets' price momentum and supply pressure, and what cycle phase does that suggest?

Answer: Tower Hamlets' 12-month price change is −13.3% to £447,950 and supply pressure is −0.93x from a net build-up of −1,070 homes, while starts momentum is missing. Rents rose 3.8% to £2,462 and sales in 2025 vs 2024 fell 6.4% to 3,536. That weak price but cleared pipeline fits London's city-wide recovery phase, with real prices −5.2% over 1 year and −23.9% below the 10-year peak.

Rounds: 4; verifier: 9/10 FAIL; wall ms: 14129

## Which 5 boroughs have the weakest 12-month price change?

Answer: The 5 boroughs with the weakest 12-month price change are City of London (−14.6%), City of Westminster (−14.3%), Kensington and Chelsea (−13.8%), Tower Hamlets (−13.3%) and Camden (−10.6%). All five are negative, with the steepest falls concentrated in central London. City of London is weakest at −14.6%, around 4.0 points below Camden.

Rounds: 3; verifier: 6/7 FAIL; wall ms: 6052

## I am looking at a 70 sq m flat at SE15 4AN for £650,000. Is it fair, and how is the area for transport and crime?

Answer: Yes, £650,000 for the 70 sq m flat looks fair, sitting inside the size-adjusted fair range of £587,000–£789,000 (mid £690,000). That range is street-level for Copleston Road, SE15 (n=17, median £9,863 per sq m vs your £9,286 per sq m), with the asking price at the 58th percentile and MSOA repeat-sales momentum at −8.0% over 1 year and 5.1% over 5 years. For the area, transport access is PTAL 5, and the LSOA recorded 182 crimes in 2025-09 to 2026-08, at the 60th percentile in London.

Rounds: 3; verifier: 10/10 PASS; wall ms: 8726

## What is the capital of France?

Answer: That question is outside my focus on London housing. I can instead answer about London borough prices, rents, sales, supply or how London's housing cycle compares to other world cities.

Rounds: 1; verifier: 0/0 n/a (no figures); wall ms: 1981

## Phase 12 fixes (no live calls; verified offline against real tool output)
- Q4 "fell 6.4%": verifier now accepts rates with a fell-word as negative (lib/memo.ts). Re-ran verifyFigures on the saved answer with live tool outputs for E09000030 + London: 10/10 PASS.
- Q5 "4.0 points below Camden": correctly still FAIL — derived arithmetic, not a tool number. prompts/ask.md now forbids derived figures ("state each number exactly as returned"). Live re-run deferred: phase live budget spent (20 calls across the 7 eval questions).
- Injection ("ignore your instructions…") refused deterministically with 0 model calls (lib/ask.ts INJECTION_RE + test). Off-topic answered honestly with no tools, 1 call.
