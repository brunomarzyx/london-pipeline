# Submission draft (Meta Global AI Developer Hackathon, Indie track)

Due Wed 4 Nov, 9:00 PM ET (02:00 UK, Thu 5 Nov). Submit at https://cerebralvalley.ai/e/meta-ai-developer-hackathon/hackathon/submit

## Project name
London Pipeline

## One-liner
Paste a London property listing and Muse Spark checks the price against street-level sales, scores the area on eleven public risk datasets and returns a verdict where every number is traced to a source.

## Problem statement
Build for Your World

## Description
I'm a Real Estate Sector Analyst at Loughborough's Student Managed Fund, and checking whether a London flat is fairly priced still means a dozen tabs: Land Registry for comps, the EPC register for floor area, the Environment Agency for flood zones, Ofsted for schools, the council planning portal for what's being built next door. London Pipeline puts that work in one place and lets Muse Spark run it.

There are two ways in. A buyer pastes a listing into the due-diligence agent. Muse Spark reads the listing (and a floorplan image if there is one), then decides which tools to call: street comparables with a size-adjusted fair range, an Area Risk Score, borough supply and yield data, and neighbourhood context. It returns a verdict with three risks, two strengths and three questions to ask the agent. On a test listing (2-bed flat, SE15 4AN, £650,000, 70 sq m) it took 21 seconds and five tool rounds, and the verifier matched all 6 numbers in the verdict to tool outputs.

An investor starts from the map. The Area Risk Score has a buyer lens and an investor lens with different weights, and flags supply pressure: E14 9AF has 13,145 homes approved or under construction within 1 km, which is in the top 1% of London. Ask London answers plain-English questions over the same data, and every answer goes through the same number check before it is shown.

## How Meta's models are used
- Muse Spark (muse-spark-1.3, Meta Model API) runs two tool-calling agents: Ask London (borough metrics, rankings, street comps, area risk, global city comparison) and the due-diligence agent (up to 8 rounds, model chooses tool order and lens).
- A verifier checks every figure in a final answer against the tool outputs; if one fails, the model gets one repair round, otherwise the app returns "not enough data" instead of a guess.
- Muse Spark vision extracts price, floor area and postcode from listing text and floorplan images, and is told not to infer missing fields.
- Muse Spark writes the borough briefs and the downloadable analyst memo, both under the same number check.
- Muse Voice Transcribe (muse-voice-transcribe-1.0) lets you ask Ask London or the agent a question out loud.
- Most of the code was written by Muse Code (muse-spark-1.3-contributor), run as several agents in parallel git worktrees; I planned the phases, reviewed and merged.

## What was built during the hackathon
Everything. The repo starts at commit af51132 on 30 Oct 2026; every commit is from 30 Oct onwards. Built in phases: data ingest and borough map, Ask London, cycle-phase classifier, rents and yields, analyst memo, global capitals view, street-level comps from Land Registry, EPC floor areas and fair range, value screen, neighbourhood context, eleven area datasets with the Area Risk Score, and the due-diligence agent with voice.

## Data
HM Land Registry Price Paid and UK HPI, MHCLG EPC register, ONS postcode lookup and rents, OS Code-Point Open and Open Greenspace, IMD 2025, TfL PTAL, data.police.uk, Environment Agency flood zones, LAEI air quality, Defra noise mapping (Round 4), DfE GIAS with Ofsted outcomes, NaPTAN, planning.data.gov.uk heritage datasets, Planning London Datahub, Inside Airbnb. Licences and as-of dates are in data/SOURCES.md.

## Links
- Repo: https://github.com/brunomarzyx/london-pipeline (make public before submitting)
- Live demo: [Fly.io URL after deploy]
- Video (3 min): [link]
- X post (Most Viral prize): [link]
