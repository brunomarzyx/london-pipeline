# AGENTS.md — read every session. Rules at the top win.

## 1. Priority rules (non-negotiable)
1. **Budget is fixed at $150 of API credit. Every token costs money.** Be terse. No preamble, no recaps, no restating the task, no summaries of files you just read.
2. **Never read the whole repo.** Read only the files the current task names, plus `docs/SPEC.md` sections it cites. Use `grep`/`ls` before opening files. Never re-read a file you just wrote.
3. **One phase per session.** Do only the phase the user names. When its acceptance checks pass, stop and print the handoff block (section 6). Do not start the next phase.
4. **Plan before code.** Before editing, print a plan of at most 8 lines: the files to touch and the check that proves it works. Then execute without asking, unless a step deletes data or changes the stack.
5. **Never invent results.** If a command, API call or test fails, show the real error and fix it. Never claim something works without running the check. If data is missing, write `unknown`. Never fabricate it.
6. **Secrets:** API keys live only in `.env` (gitignored). Never print, log or commit them. Keep `.env.example` updated with names only.
7. **Git:** commit only when the user says "commit". Use small conventional commits (`feat:`, `fix:`, `test:`).

## 2. Project
- Read `docs/SPEC.md` for what we are building, the scope and the acceptance criteria. It is the single source of truth. If this file and SPEC disagree, SPEC wins on product and this file wins on process.
- Hackathon: Meta Global AI Developer Hackathon, Indie track. Hard deadline **Wed 4 Nov, 21:00 ET (02:00 UK, Thu 5 Nov)**. Only work done from 26 Oct onward counts. The repo must be public at submission. The deliverable includes a 3-minute demo video.
- Judging is weighted equally on impact, **use of Meta AI tooling**, technical depth and demo. Every Meta model call must do real work that shows on screen.

## 3. Stack (do not change without asking)
- Next.js (App Router) + TypeScript (strict), Tailwind, Leaflet with OpenStreetMap tiles, recharts for charts, zod for validation, SQLite via `better-sqlite3`, Vitest for tests.
- Meta Model API through the `openai` npm SDK with `baseURL: process.env.META_BASE_URL` (default `https://api.meta.ai/v1`), `apiKey: process.env.MODEL_API_KEY`, and model `process.env.META_MODEL` (default `muse-spark-1.3`).
- All Meta calls go through **one wrapper**, `lib/meta.ts`. It logs prompt, completion and cached tokens per call to `logs/usage.jsonl`, and it supports a `MOCK_META=1` mode that returns fixtures, so the UI and tests run without spending credits.

## 4. Coding rules
- Write the smallest code that passes the acceptance check. No speculative abstractions, no extra libraries without a one-line reason.
- Use pure functions for core logic (parsing, metrics, scoring) in `lib/`, each with Vitest tests. Keep UI thin.
- Send structured output from the model as JSON with a schema. Validate it with `zod`, and on failure retry once with the error, then fall back gracefully.
- Model prompts live in `prompts/*.md`. Put stable instructions first and variable data last, so prompt caching hits. Never put timestamps in the system prompt.
- Use the lowest reasoning effort that works: `low` for formatting and extraction, `medium` for normal code, `high` only for tricky algorithms.

## 5. Checks (run the relevant ones before saying done)
- `npm run typecheck` · `npm test` · `npm run build` · then the manual check named in the phase.

## 6. Handoff block (print at the end of every phase, then stop)
```
PHASE <n> DONE
Changed: <files>
Checks: <command → result>
Known issues: <list or none>
Next: <exact next phase name>
Spend this session: <tokens if known, else unknown>
```
