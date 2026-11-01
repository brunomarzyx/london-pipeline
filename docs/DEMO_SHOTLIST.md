# Demo shot list (3 minutes, 7 shots)

Record with live data where the numbers below are quoted from the app on screen — never from memory. Mock mode (`MOCK_META=1`) runs the same UI with zero spend if the API key is unavailable. See [DEMO_SCRIPT.md](DEMO_SCRIPT.md) for the long-form script.

## Shot 1 — 0:00–0:25 — Dashboard map

URL: `/`. Action: load the dashboard, toggle the layer from 12-month price change to supply pressure.

Say: "London's housing supply data is public but scattered, so I put all 33 boroughs on one map. Darker here means more homes still in the pipeline relative to what the borough completes each year."

## Shot 2 — 0:25–0:50 — Borough page + cycle phase

URL/action: click the top-ranked borough under supply pressure, open its borough page.

Say: "Every borough gets a cycle phase — recovery, expansion, hypersupply or recession — from price momentum against supply pressure. The one-paragraph explanation is written by the model; the classification itself is rules, so it never invents a phase."

## Shot 3 — 0:50–1:20 — Area page, buyer lens, fair price

URL: `/area/SE15 4AN?lens=buyer`. Action: point at the fair range, then the Area Risk Score card on the buyer lens.

Say: "Down to street level: EPC floor areas turn each sale into pounds per square metre, so a 70 square metre flat is compared with like-sized sales. On the buyer lens this postcode scores in the Moderate band, with strengths in heritage and flood."

## Shot 4 — 1:20–1:45 — Area page, investor lens, supply pressure

URL: `/area/E14 9AF?lens=investor`. Action: point at the supply-pressure callout naming the largest schemes.

Say: "Flip to the investor lens on E14 9AF and the same engine answers a different question — what hurts an investor. The pipeline driver is near the top of London, so the card calls out the biggest approved schemes within a kilometre."

## Shot 5 — 1:45–2:15 — Ask London, live with tool call

URL/action: open Ask, type "Is £650k fair for a 70 sq m flat at SE15 4AN?", show the tool call and the verified answer.

Say: "The agent calls the postcode tool and answers with the size-adjusted fair range and where this price sits. A verifier then checks every figure in the answer against the tool result before it is shown."

## Shot 6 — 2:15–2:40 — Value screen with risk filters

URL: `/screen`. Action: set max risk score and exclude Flood Zone 3, point at the top row.

Say: "Which neighbourhoods look cheap and are starting to move? These LSOAs trade at least 10 percent below their borough per square metre with momentum above the borough — and the risk filters knock out anything flood-exposed or high-scoring."

## Shot 7 — 2:40–3:00 — Memo download + limits

URL/action: from the borough page, click "Write memo", show the verified badge, download.

Say: "One click writes the analyst memo — call, evidence, risks, what would change its mind — with each figure badge-verified, and it downloads. Limits: screens are starting lists, not valuations, and prices are averages, not forecasts."
