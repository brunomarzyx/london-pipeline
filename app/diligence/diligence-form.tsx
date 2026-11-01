"use client";
import { useState } from "react";
import MicButton from "../mic-button";
import type { DiligenceResult } from "@/lib/diligence";

type ApiResult = DiligenceResult & { error?: string };

async function post(body: unknown): Promise<ApiResult> {
  const res = await fetch("/api/diligence", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Request failed");
  return res.json() as Promise<ApiResult>;
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
    try {
      const p = price.replace(/[^0-9]/g, "");
      setResult(
        await post({
          text,
          image,
          postcode: postcode.trim() || null,
          price: p ? Number(p) : null,
          goal,
        }),
      );
    } catch {
      setErr("Could not run diligence. Try again.");
    }
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
          <div className="mt-1">
            <MicButton onText={(t) => setText(t)} />
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
        {err ? <p className="text-sm text-red-700">{err}</p> : null}
      </div>

      <div className="space-y-3">
        {result && !result.error ? (
          <>
            <div className="rounded-xl border bg-white p-4">
              <h2 className="text-sm font-semibold text-slate-500">Live step trace ({result.steps.length} steps)</h2>
              <ol className="mt-2 space-y-2">
                {result.steps.map((s, i) => (
                  <li key={i} className="rounded border border-slate-200 p-2 text-xs">
                    <div className="font-mono font-semibold">
                      {i + 1}. {s.name} <span className="font-normal text-slate-500">{s.ms} ms</span>
                    </div>
                    <div className="mt-1 break-words font-mono text-slate-600">
                      args: {JSON.stringify(s.args)}
                    </div>
                    <div className="mt-1 max-h-24 overflow-y-auto break-words text-slate-700">
                      {s.result.slice(0, 400)}
                      {s.result.length > 400 ? "…" : ""}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
            {v ? (
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
