# Demo script (3 minutes)

Total: 3:00. Timings are cumulative. All figures on screen come from the app — don't quote numbers from memory.

## 0:00–0:20 — Problem

"London housing supply data is public but scattered — Land Registry prices in one place, MHCLG starts and completions in another, boundaries somewhere else. If you're a student fund analyst or a small developer asking 'where is the pipeline building up, and could it weigh on prices?', there's no single view. I built one: 33 boroughs on a map, with an analyst you can question."

## 0:20–1:00 — Map and toggles

Open `/` (mock mode off if live; note `MOCK_META=1` runs the same UI with zero spend).

- "The choropleth covers all 33 boroughs. Five layers: 12-month price change, net pipeline build-up, supply pressure, starts momentum — and Cycle phase."
- Toggle price change → net build-up: "Darker means more homes building up in the pipeline: starts over three years minus completions."
- Toggle supply pressure: "This normalises it — build-up divided by average annual completions. High readings mean years of output still in the pipe."
- Point at the ranked side table: "Every layer re-ranks the boroughs. Click any borough for the detail page."

## 1:00–1:45 — Borough page and brief

Click the top-ranked borough under supply pressure.

- "Two charts: price over time from the House Price Index, and starts versus completions by financial year."
- Scroll to the Muse Spark Brief card: "This is structured output — headline, supply view, price view, a low/medium/high risk flag and confidence — generated from this borough's metrics only, validated against a schema. If the model fails, the card falls back gracefully instead of inventing numbers."

## 1:45–2:30 — Ask London live

Type: "Which 3 boroughs have the highest supply pressure, and what does that mean for prices?"

- "This is a tool-calling agent. The model gets three tools — list boroughs, get borough metrics, rank boroughs — and must cite only the numbers the tools return. If the data isn't there, it says so."
- Read the 2–3 sentence answer. Follow up: "How does [borough] compare on starts momentum?" — note the honest "n/a" if the prior 4-quarter base is under 100 homes.

## 2:30–3:00 — Cycle view and what's next

- Toggle the Cycle phase layer: "A rule-based classifier maps 12-month price change against supply pressure into recovery, expansion, hypersupply or recession. Each borough page has a one-paragraph Muse Spark explanation of its phase."
- Close: "What's next: approvals data when GLA Datahub access lands, and a watch list that flags boroughs above a pressure threshold you choose. Limitations to know: approvals aren't in this build, and prices shown are averages from the source data, not forecasts."
