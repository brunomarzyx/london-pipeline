# Demo script (3 minutes)

Total: 3:00. Timings are cumulative. All figures on screen come from the app — don't quote numbers from memory.

## 0:00–0:25 — Problem and headline

"London housing supply data is public but scattered — Land Registry prices in one place, MHCLG starts and completions in another, boundaries somewhere else. If you're a student fund analyst or a small developer asking 'where is the pipeline building up, and could it weigh on prices?', there's no single view. I built one: 33 boroughs on a map, with an analyst you can question."

Point at the headline under the header: "That line is computed live from BIS data on load — London in real terms over five years and off its peak. That frames everything that follows."

## 0:25–0:55 — Map and toggles

Open `/` (mock mode off if live; note `MOCK_META=1` runs the same UI with zero spend).

- "The choropleth covers all 33 boroughs. Layers: 12-month price change, net pipeline build-up, supply pressure, starts momentum, gross yield, rent change, sales change — and Cycle phase."
- Toggle price change → net build-up: "Darker means more homes building up in the pipeline: starts over three years minus completions."
- Toggle supply pressure: "This normalises it — build-up divided by average annual completions. High readings mean years of output still in the pipe."
- Point at the ranked side table: "Every layer re-ranks the boroughs. Click any borough for the detail page."

## 0:55–1:35 — Borough memo with verified badge

Click the top-ranked borough under supply pressure.

- "Two charts: price over time from the House Price Index, and starts versus completions by financial year — plus rents, yields and sales volumes."
- Click "Write memo": "This is a structured analyst memo — call, evidence with per-figure sources, risks, what would change its mind. Every figure is checked against the source data after generation, and the card shows a verified badge like ✓ 8/8 figures verified. The market read-across is qualitative only — no smuggled numbers."
- "Export Markdown downloads the memo with its badge and method footnote."

## 1:35–2:20 — Global view

Click the Global tab.

- "London in the global cycle: eight cities from BIS residential property prices, deflated with national CPI into real indices, against central-bank policy rates — ranked by one-year real momentum with sparklines. London is highlighted."
- "Tokyo is near its peak while London and Toronto sit deep below theirs — same rates shock, different cycle positions. Note the caveat on screen: supply data isn't comparable across cities, so this view is prices and rates only."

## 2:20–3:00 — Ask London live

Back on London, open Ask. Type: "Where is London in the global housing cycle compared with Tokyo and Toronto?"

- "This is a tool-calling agent with four tools — the three borough tools plus get_city_metrics — and it must cite only returned numbers. If the data isn't there, it says so."
- Read the answer. Close: "What's next: approvals data when GLA Datahub access lands, and a watch list above a pressure threshold you choose. Limitations: approvals aren't in this build, prices are averages not forecasts, and global series are nominal deflated with national CPI."
