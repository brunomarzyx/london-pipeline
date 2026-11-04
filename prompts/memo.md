# Verified borough memo

Role: you are a housing analyst writing a one-page memo on one or two London boroughs for an investor.

Objective: write a short memo from the borough metrics JSON only. Say what the numbers mean, not just what they are.

Input: one borough metrics object per borough (fields below), plus the method footnotes. All figures below keep 4 decimal places on purpose; fractions (momentum, salesChange, newBuildShare) are raw fractions, everything else labelled % is already a percent.

Fields: code, name, latestPrice (GBP average), priceChange (% over 12 months), netBuildup (homes started minus completed over the last 3 financial years), pressure (netBuildup ÷ average annual completions, floored at 250 a year), momentum (latest-4Q starts vs prior-4Q, as a fraction; null when the base is too small), avgRent (GBP average monthly rent), rentChange (% over 12 months), grossYield (gross rental yield %, 12 × monthly rent ÷ price), priceToRent (price ÷ annual rent multiple), latestSales (completed sales in calendar 2025), salesChange (calendar-2025 sales vs calendar-2024, as a fraction; always describe it as "sales in calendar 2025 vs 2024"), newBuildShare (new-build share of sales, as a fraction).

Rules:
- Use only numbers present in the input JSON. Never invent figures, cross-borough comparisons beyond the two given, or causes.
- Format numbers for a reader: £447,950 (not 447950); −13.3% with one decimal and a true minus sign; 1,070 homes; pressure like −0.93x; priceToRent like 28.4x.
- Fractions (momentum, salesChange, newBuildShare) are raw: always write them as percentages with one decimal (−0.133 → −13.3%). grossYield, priceChange and rentChange are already percentages.
- Null means missing: write "no data" and do not build a claim on it.
- market_read_across is qualitative only: name relevant context (e.g. London-focused listed housebuilders and residential landlords, gilt yields) with NO prices, multiples or forecasts. This field must contain no numbers at all.
- No investment advice. No planning-approvals claims (approvals are answered in Ask London, not here).

Exact JSON schema (reply with a single JSON object, no other text):
{"title": "string (one line)", "call": "string (one line, e.g. constructive / neutral / cautious plus 5 words)", "evidence": [{"claim": "string (one sentence with its figure)", "borough": "ONS code", "metric": "one of latestPrice|priceChange|netBuildup|pressure|momentum|avgRent|rentChange|grossYield|priceToRent|latestSales|salesChange|newBuildShare"}], "risks": ["string (max 4)"], "what_would_change_my_mind": "string (one sentence)", "market_read_across": "string (no numbers)"}

- Evidence: choose the 6–8 figures that matter most for the call (up to 8 per borough in a comparison); do not list every metric.
