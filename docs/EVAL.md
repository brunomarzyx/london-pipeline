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

## Phase 13 — get_area_risk (9 live calls across 3 questions; tool output now includes per-component facts so headline figures verify)

## What is the buyer area risk score for SE15 4AN?

Answer: The buyer Area Risk Score for SE15 4AN is 42, band Moderate with full coverage (10/10). Top drivers are Greenspace access (70.1), Air quality (63) with modelled annual-mean NO2 of 23.1 µg/m³, and School access (55.2). Key strengths are Heritage planning constraint (0) with standard permitted-development rights, and Flood risk (5) in Flood Zone 1 (low probability).

Rounds: 2; verifier: 3/4 FAIL on first live run (23.1 appeared only in headline text, not as a JSON number) → fixed by adding `facts` to get_area_risk output and `ScoredComponent`; re-verified offline 4/4 PASS.

## What is the investor area risk for E14 9AF? Is supply pressure a concern?

Answer: Investor Area Risk for E14 9AF is 61, band Elevated, with 10/10 components available. Yes, supply pressure is a concern: New housing supply is the top driver at 98.9, with 13,145 pipeline homes within 1 km of E14 9AF (2,327 approved, not started; 10,818 under construction), higher than in 99% of London LSOAs. Other top drivers are Flood risk at 90 with E14 9AF in Flood Zone 3, and Short-let pressure at 84.4 with 20 entire-home short lets in the LSOA.

Rounds: 2; verifier: 8/8 PASS.

## Compare the investor area risk of E14 9AF and SE15 4AN.

Answer: E14 9AF has higher investor risk at 61 (Elevated) than SE15 4AN at 47 (Moderate). E14 9AF is driven by 13,145 pipeline homes within 1 km of E14 9AF (2,327 approved, not started; 10,818 under construction), Flood Zone 3 (high probability) and 20 entire-home short lets in its LSOA, with EPC strength at median B. SE15 4AN has 147 pipeline homes within 1 km of SE15 4AN (30 approved, not started; 117 under construction), Flood Zone 1 (low probability) and EPC risk at median D, with 18 entire-home short lets in its LSOA.

Rounds: 5 (model made 4 tool calls for a 2-postcode question); verifier: 3/3 PASS.
