# London Pipeline: demo script and talk track (final, 4 Nov)

Part 1 is the 3-minute video. Part 2 is everything I built and how to explain it, for judges' questions, LinkedIn and interviews.

---

## Part 1: 3-minute video

### Before recording (10 minutes)

- Use one browser window with four tabs already loaded:
  - https://london-pipeline.fly.dev/
  - https://london-pipeline.fly.dev/area/E14%209AF?lens=investor
  - https://london-pipeline.fly.dev/diligence
  - https://london-pipeline.fly.dev/screen
- The app now stays on all the time, so there is no cold start.
- **Diligence input.** Paste this exactly, buyer lens:
  `2 bed flat on Copleston Road, London SE15 4AN. £650,000. 70 sq m internal area.`
  It is served from the recorded run and shows a "cached run" label. Say so on camera, because hiding it looks worse if a judge notices.
- **Live question, by voice.** Ask Ask London: "Which three boroughs have the highest gross rental yield?" This runs live and takes about 10 seconds. Read the boroughs off the screen, not from memory.
- **Do NOT ask "which boroughs have the most units approved but not started?"** Borough-level approvals aren't in the build, and the agent will say so.
- **Recording.** Use QuickTime: File > New Screen Recording, mic on, 1080p, under 3:00. Upload it to YouTube as Unlisted and paste the link into the submission.

### Script

**0:00–0:20 — Who and why** (tab: map)
"I'm Max, the real estate analyst at Loughborough's Student Managed Fund. Working out where London supply is building, and whether a flat is fairly priced, means a dozen tabs: Land Registry, the EPC register, flood maps, Ofsted, planning. London Pipeline puts it in one place and lets Muse Spark do the analysis."

**0:20–0:45 — The supply map**
Toggle the layer to supply pressure, then to cycle phase.
"All 33 boroughs. Supply pressure is homes started but not yet completed, against what the borough normally completes in a year. Above one year's worth, the rules call it hypersupply. The phase comes from rules, not the model, so it's explainable. Muse Spark writes the reasoning."

**0:45–1:05 — Postcode, investor lens** (tab: E14 9AF)
"Down to postcode level. On the investor lens E14 9AF scores 61, Elevated. The biggest driver is new supply: 13,145 homes approved or under construction within a kilometre, more than 99% of London. A landlord needs to price that in."

**1:05–1:55 — The due-diligence agent** (tab: diligence)
Paste the listing and run it. Let the step trace show.
"This is the main agent. I paste a listing and Muse Spark decides which tools to call. First it extracts the listing, then street comparables, the area risk score and borough data. This is the recorded run, so it's instant. Live it takes about 20 seconds."
Point at the verdict.
"Looks fair. On a size-adjusted basis, using EPC floor areas, the range is £587,000 to £789,000, and £650,000 sits inside it. It gives three risks, two strengths and the questions to ask the agent. Then the important bit: a verifier checks every number in the verdict against the tool outputs, and here it's 10 out of 10. If a number doesn't match, the model gets one repair attempt. Otherwise the app says 'not enough data' instead of guessing."

**1:55–2:20 — Ask London, live, by voice**
Click the mic and ask the yield question.
"Same tools, plain English, and this one is live. Meta's Muse Voice Transcribe handles the speech, then Spark calls the borough tools and answers with numbers it was given."

**2:20–2:40 — Value screen** (tab: screen)
Tick "Exclude Flood Zone 3" and set a max risk score. Point at the top row.
"For an investor: neighbourhoods at least 10% cheaper per square metre than their borough, where prices are moving faster than the borough. The risk filters knock out anything flood-exposed."

**2:40–3:00 — How it's built, close**
"Public data from Land Registry, MHCLG, the EPC register, the GLA and a dozen more, in SQLite, on Next.js, deployed on Fly. Muse Spark runs two tool-calling agents and reads listings and floorplans. Muse Code wrote most of the code, running as parallel agents; I planned it, reviewed it and merged it. Everything was built during the hackathon. Next: phase-change alerts and borough approvals data. Thanks."

---

## Part 2: Talk track (everything I did)

### 30-second version
I built a London property analysis tool on Meta's Muse Spark. It works at two levels. At borough level, it maps where the housing pipeline is building up and classifies each borough's cycle phase. At listing level, an agent takes a pasted listing, pulls street-level sales, scores the area on ten risk signals and returns a verdict. Every number in that verdict is checked against the data before you see it. I built it solo during the hackathon week, with Muse Code agents writing most of the code.

### What it does
- **Borough map (`/`):** 33 boroughs, with layers for 12-month price change, net build-up, supply pressure, starts momentum, gross yield and cycle phase.
- **Borough pages:** a Muse Spark brief and a downloadable analyst memo, both number-checked.
- **Area pages (`/area/[postcode]`):** a size-adjusted fair range, neighbourhood context (deprivation, transport, crime) and the Area Risk Score with buyer and investor lenses.
- **Check a listing (`/check`):** paste text or a floorplan image, and Spark vision extracts price, size and postcode. It won't guess a field that isn't there.
- **Due-diligence agent (`/diligence`):** up to 8 tool rounds, with a verdict, risks, strengths and questions to ask.
- **Ask London:** plain-English Q&A across six tools, also usable by voice.
- **Value screen (`/screen`):** cheap-and-moving neighbourhoods, with risk filters.
- **Global view:** eight cities' real house prices (from BIS, CPI-deflated) against policy rates.

### How Meta's models are used
- **Muse Spark (muse-spark-1.3)** runs two tool-calling agents. The model chooses which tools to call and in what order. My code runs the tools and returns the data.
- **The verifier.** Every figure in a final answer must appear in a tool output. One repair round is allowed, then the app says "not enough data". This is the anti-hallucination layer, and it's what I'd lead with if a judge asks what's different.
- **Spark vision** reads listings and floorplans.
- **Spark writes structured JSON** for briefs and memos, validated with zod, with one retry and then a fallback.
- **Muse Voice Transcribe** handles voice questions.
- **Muse Code** wrote most of the code. It ran as several agents in parallel git worktrees, in 17 phases, and I wrote the phase prompts, reviewed and merged.

### Methods I must be able to explain
- **Supply pressure** = (starts − completions over the period) ÷ average annual completions. At 1.0 or above, the borough is hypersupply. Data is from MHCLG.
- **Cycle phase rules.** Supply pressure of 1.0 or more is hypersupply. Otherwise, a falling 12-month price is recession. Otherwise, pressure under 0.25 is recovery. Anything else is expansion.
- **Fair range.**
  - Matching: 4.6m EPC certificates are matched to Land Registry sales (90% match), so every sale gets a £ per sq m figure.
  - Comparables: like-sized sales on the same street, from the last 36 months.
  - Fallback: if a street has fewer than 10 sales, it steps up to sector, then LSOA, then MSOA, then borough.
- **Area Risk Score.** 0–100, where higher is worse, built from 10 signals: flood, air, noise, schools, transport, greenspace, heritage, EPC, short lets and pipeline.
  - Calculation: a weighted average of percentile scores within London.
  - Lenses: the buyer lens weights flood and schools most; the investor lens weights pipeline, short lets and EPC most.
  - Bands: Low under 33, Moderate 33–55, Elevated 55–70, High over 70.
- **Cost control.**
  - Volume: about 400k tokens used across the build.
  - Safeguards: a demo cache for the showcase inputs, rate limits, a daily token cap, and a mock mode that runs the whole app and 190 tests with zero spend.

### Hard questions, short answers
- **"Isn't this just RAG?"** No. Nothing is retrieved as text. The model calls typed tools over a database, picks the order itself, and every number it writes is verified against what the tools returned.
- **"Why is Richmond or Kingston in hypersupply?"** The ratio divides by annual completions. A borough that normally completes few homes looks pressured with a modest pipeline. It's a flag to investigate, not a forecast. I'd add a minimum-size threshold next.
- **"Did you write the code?"** I designed the system, wrote the phase plans and prompts, chose the data and methods, and reviewed and merged everything. Muse Code did most of the typing, and that's the point of the tooling.
- **"How do you know it's right?"** There are 190 automated tests and a logged eval of live questions with pass/fail verifier results (`docs/EVAL.md`). Two early failures led to fixes. The diligence run went from 58 seconds to 21 seconds after a schema fix.
- **"What's missing?"**
  - Borough approvals data: the Datahub needs an access request. Postcode-level pipeline is in.
  - Phase-change alerts.
  - Data age: flood zones are from 2023 and PTAL from 2015.
- **"Is it advice?"** No. Address-level EPC fields are hidden, there's a disclaimer, and it's for information only.

### Numbers to quote (all from the app or EVAL.md)
- **SE15 4AN, 70 sq m, £650k:**
  - Fair range £587k–£789k, midpoint £690k.
  - 58th percentile.
  - Copleston Road median £9,863/sq m from 17 sales.
  - Buyer risk score 42, Moderate.
- **E14 9AF, investor lens:**
  - Score 61, Elevated.
  - 13,145 pipeline homes within 1 km: 2,327 approved not started, 10,818 under construction.
  - More than 99% of London LSOAs.
- **Diligence live end-to-end:** 21 seconds, 5 rounds, 6/6 verified. The recorded run shows 10/10.
