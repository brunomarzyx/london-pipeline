"use client";
import { useEffect, useState } from "react";
import MicButton from "../mic-button";
import type { DiligenceResult } from "@/lib/diligence";
import { formatCacheLabel, type CacheLabel } from "@/lib/cache-label";

type ApiResult = DiligenceResult & { error?: string };

/** A trace row: running (no result yet) or finished. */
interface TraceRow {
  name: string;
  args: unknown;
  result?: string;
  ms?: number;
}

const DEMO_TEXT = "2 bed flat on Copleston Road, London SE15 4AN. £650,000. 70 sq m internal area.";

/** POSTs with stream:true and reads server-sent events (thinking, start, step, done, error). */
async function stream(
  body: unknown,
  live: boolean,
  on: (event: string, data: Record<string, unknown>) => void,
): Promise<void> {
  const res = await fetch(`/api/diligence${live ? "?live=1" : ""}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...(body as object), stream: true }),
  });
  if (!res.ok || !res.body) {
    const j = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(j?.error ?? "Request failed");
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const block = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const ev = /^event: (.+)$/m.exec(block)?.[1];
      const data = /^data: (.+)$/m.exec(block)?.[1];
      if (ev && data) on(ev, JSON.parse(data) as Record<string, unknown>);
    }
  }
}

const VERDICT_STYLE: Record<string, string> = {
  "looks fair": "bg-emerald-100 text-emerald-900",
  "looks cheap": "bg-sky-100 text-sky-900",
  "looks expensive": "bg-amber-100 text-amber-900",
  "not enough data": "bg-slate-200 text-slate-700",
};

export default function DiligenceForm() {
  const [text, setText] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [postcode, setPostcode] = useState("");
  const [price, setPrice] = useState("");
  const [goal, setGoal] = useState("buyer");
  const [result, setResult] = useState<ApiResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [rows, setRows] = useState<TraceRow[]>([]);
  const [status, setStatus] = useState("");
  const [cached, setCached] = useState<CacheLabel | null>(null);
  const [live, setLive] = useState(false);
  useEffect(() => {
    setLive(new URLSearchParams(window.location.search).get("live") === "1");
  }, []);

  function onFile(file: File | undefined) {
    setImage(null);
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 4_000_000) {
      setErr("Floorplan must be a PNG, JPEG or WebP under 4 MB.");
      return;
    }
    setErr("");
    const reader = new FileReader();
    reader.onload = () => setImage(String(reader.result));
    reader.readAsDataURL(file);
  }

  async function run() {
    if (!text.trim() || busy) return;
    setBusy(true);
    setErr("");
    setResult(null);
    setRows([]);
    setCached(null);
    setStatus("Starting…");
    try {
      const p = price.replace(/[^0-9]/g, "");
      await stream(
        { text, image, postcode: postcode.trim() || null, price: p ? Number(p) : null, goal },
        live,
        (event, data) => {
          if (event === "thinking") setStatus(`Agent reasoning (round ${String(data.round)})…`);
          else if (event === "start")
            setRows((r) => [...r, { name: String(data.name), args: data.args }]);
          else if (event === "step") {
            const step = data.step as TraceRow;
            setRows((r) => {
              const open = r.findIndex((x) => x.result === undefined && x.name === step.name);
              if (open < 0) return [...r, step];
              const next = r.slice();
              next[open] = step;
              return next;
            });
          } else if (event === "done") {
            setResult(data.result as ApiResult);
            setCached((data.cached as CacheLabel | undefined) ?? null);
          } else if (event === "error") setErr(String(data.error ?? "Could not run diligence."));
        },
      );
    } catch (e) {
      setErr(e instanceof Error && e.message ? e.message : "Could not run diligence. Try again.");
    }
    setStatus("");
    setBusy(false);
  }

  const input = "w-full rounded border border-slate-300 px-2 py-1 text-sm";
  const v = result && !result.error ? result.verdict : null;

  return (
    <div className="mt-4 grid gap-4 md:grid-cols-2">
      <div className="space-y-3 rounded-xl border bg-white p-4">
        <div>
          <label htmlFor="dd-text" className="text-sm font-semibold">
            Listing text
          </label>
          <textarea
            id="dd-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={9}
            maxLength={20000}
            placeholder="Paste the description, price and address from the listing"
            className={`${input} mt-1`}
          />
          <div className="mt-1 flex items-center gap-3">
            <MicButton onText={(t) => setText(t)} />
            <button type="button" onClick={() => setText(DEMO_TEXT)} className="text-xs text-sky-700 underline">
              Use demo listing
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="text-slate-600">
            Floorplan (optional){" "}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => onFile(e.target.files?.[0])}
              className="text-xs"
            />
          </label>
          {image ? <span className="text-xs text-slate-500">attached</span> : null}
        </div>
        <div className="grid grid-cols-3 gap-2">
          <label className="text-xs text-slate-600">
            Postcode override
            <input
              value={postcode}
              onChange={(e) => setPostcode(e.target.value)}
              placeholder="SE15 4AN"
              className={`${input} mt-1`}
            />
          </label>
          <label className="text-xs text-slate-600">
            Price override (£)
            <input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="650000"
              inputMode="numeric"
              className={`${input} mt-1`}
            />
          </label>
          <label className="text-xs text-slate-600">
            Goal
            <select value={goal} onChange={(e) => setGoal(e.target.value)} className={`${input} mt-1`}>
              <option value="buyer">Buyer</option>
              <option value="investor">Investor</option>
            </select>
          </label>
        </div>
        <button
          onClick={run}
          disabled={busy || !text.trim()}
          className="rounded bg-sky-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? "Running checks…" : "Run due diligence"}
        </button>
        <label className="flex items-center gap-2 text-xs text-slate-600">
          <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} />
          Run live (skip cached demo run)
        </label>
        {err ? <p className="text-sm text-red-700">{err}</p> : null}
      </div>

      <div className="space-y-3">
        {rows.length > 0 || busy || (result && !result.error) ? (
          <>
            <div className="rounded-xl border bg-white p-4">
              <h2 className="text-sm font-semibold text-slate-500">
                Live step trace ({rows.filter((r) => r.result !== undefined).length} steps)
                {cached ? (
                  <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-normal text-slate-600">
                    {formatCacheLabel(cached)}
                  </span>
                ) : null}
              </h2>
              <ol className="mt-2 space-y-2">
                {rows.map((s, i) => (
                  <li key={i} className="rounded border border-slate-200 p-2 text-xs">
                    <div className="font-mono font-semibold">
                      {i + 1}. {s.name}{" "}
                      <span className="font-normal text-slate-500">
                        {s.result === undefined ? "running…" : `done · ${s.ms} ms`}
                      </span>
                    </div>
                    <div className="mt-1 break-words font-mono text-slate-600">
                      args: {JSON.stringify(s.args)}
                    </div>
                    {s.result !== undefined ? (
                      <div className="mt-1 max-h-24 overflow-y-auto break-words text-slate-700">
                        {s.result.slice(0, 400)}
                        {s.result.length > 400 ? "…" : ""}
                      </div>
                    ) : null}
                  </li>
                ))}
                {busy && status ? <li className="text-xs text-slate-500">{status}</li> : null}
              </ol>
            </div>
            {v && result ? (
              <div className="rounded-xl border bg-white p-4">
                <span className={`inline-block rounded-full px-3 py-1 text-sm font-semibold ${VERDICT_STYLE[v.verdict] ?? ""}`}>
                  {v.verdict}
                </span>
                <p className="mt-2 font-medium">{v.headline}</p>
                <p className="mt-1 text-sm text-slate-700">{v.price_check}</p>
                <h3 className="mt-3 text-sm font-semibold">Risks</h3>
                <ul className="list-disc pl-5 text-sm text-slate-700">
                  {v.risks.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
                <h3 className="mt-2 text-sm font-semibold">Strengths</h3>
                <ul className="list-disc pl-5 text-sm text-slate-700">
                  {v.strengths.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
                <h3 className="mt-2 text-sm font-semibold">Questions for the agent</h3>
                <ul className="list-disc pl-5 text-sm text-slate-700">
                  {v.questions_to_ask_agent.map((q, i) => (
                    <li key={i}>{q}</li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-slate-500">
                  Sources: {v.sources.join("; ")} · {result.verification.verified}/
                  {result.verification.total} figures verified
                  {result.repaired ? " (repaired)" : ""}
                </p>
              </div>
            ) : null}
          </>
        ) : (
          <div className="rounded-xl border bg-white p-4 text-sm text-slate-500">
            The agent&apos;s tool calls and verdict will appear here.
          </div>
        )}
      </div>
    </div>
  );
}
