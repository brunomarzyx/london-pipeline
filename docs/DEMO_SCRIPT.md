# Demo script (3 minutes)

Total: 3:00. Timings are cumulative. All figures on screen come from the app — don't quote numbers from memory.

## 0:00–0:20 — Problem and headline

"London housing supply data is public but scattered — Land Registry prices in one place, MHCLG starts and completions in another, boundaries somewhere else. If you're a student fund analyst or a small developer asking 'where is the pipeline building up, and could it weigh on prices?', there's no single view. I built one: 33 boroughs on a map, with an analyst you can question."

Point at the headline under the header: "That line is computed live from BIS data on load — London in real terms over five years and off its peak."

## 0:20–0:45 — Map and toggles

Open `/` (mock mode off if live; note `MOCK_META=1` runs the same UI with zero spend).

- "The choropleth covers all 33 boroughs. Layers include 12-month price change, net pipeline build-up, supply pressure, starts momentum, gross yield and Cycle phase."
- Toggle price change → supply pressure: "Darker means more homes still in the pipe relative to what the borough completes each year. Every layer re-ranks the side table."

## 0:45–1:10 — Borough memo with verified badge

Click the top-ranked borough under supply pressure, then "Write memo".

- "A structured analyst memo: call, evidence, risks, what would change its mind. Every figure is checked against the source data after generation, and the card shows a badge like ✓ 8/8 figures verified. The market read-across is qualitative only — no smuggled numbers."

## 1:10–1:25 — Global view

Click the Global tab.

- "Eight cities from BIS prices, deflated with national CPI, against policy rates. London sits well below its peak while Tokyo is close to its own. Supply data isn't comparable across cities, so this view is prices and rates only."

## 1:25–1:55 — Street level: fair range and neighbourhood card

Type SE15 4AN in the header postcode search (flat) to open the area page.

- "Borough averages hide a lot, so I went down to street level. EPC floor areas turn every sale into pounds per square metre, which means a 70 sq m flat is compared with like-sized sales, not the street's average price. That's 4.6 million London EPC certificates matched to Price Paid sales, 90.1% of them."
- Point at the fair range: "Fair range, where £650k sits within it, and the fallback ladder: street, then sector, LSOA, MSOA, borough, using the first level with ten or more sales. Momentum is repeat sales — same homes resold, new builds excluded."
- Point at the neighbourhood card: "Deprivation from IMD 2025, transport access from TfL PTAL, and police.uk crime for September 2025 to August 2026, all at LSOA level."

## 1:55–2:25 — Value vs momentum screen

Open `/screen`.

- "Which neighbourhoods look cheap and are starting to move? This screen finds LSOAs at least 10% below their borough on pounds per square metre, where the MSOA's repeat-sales momentum is above the borough's, with at least 150 repeat-sale pairs. One row per MSOA."
- "52 qualify. Tick good transport, PTAL 3 plus, and exclude the most deprived 20%, and it's 30."
- Point at the top row: "SE12 9 in Lewisham: 26% below the borough per square metre, up 11.1% over a year while the borough is down 0.3%. Click through and it opens the area comps. It's cached, so it loads in about 0.02 seconds."

## 2:25–3:00 — Ask London on a real postcode

Open Ask. Type: "Is £650k fair for a 70 sq m flat at SE15 4AN?"

- "The agent calls the postcode tool and answers with the size-adjusted fair range, where £650k sits against recent sales, and the neighbourhood context. The number verifier then checks each figure in the answer against the tool result. On the live run, 9 of 9 were verified."
- Close: "Limits: the screen is a starting list, not a valuation; momentum is MSOA-level, not street-level; and prices are averages, not forecasts. Next: approvals data when GLA Datahub access lands."
