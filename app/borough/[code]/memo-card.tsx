"use client";
import { useState } from "react";

const METHOD_FOOTNOTE =
  "Gross yield is a borough-level indicator (HPI average price vs ONS average rent). Sales change compares calendar 2025 with calendar 2024 (Land Registry).";

function badgeText(v: Verification): string {
  if (v.total === 0) return "no figures to verify";
  return `✓ ${v.verified}/${v.total} figures verified against source data`;
}

interface Evidence {
  claim: string;
  borough: string;
  metric: string;
}

interface MemoData {
  title: string;
  call: string;
  evidence: Evidence[];
  risks: string[];
  what_would_change_my_mind: string;
  market_read_across: string;
}

interface Verification {
  total: number;
  verified: number;
  unverified: { raw: string; context: string }[];
}

export default function MemoCard({ code }: { code: string }) {
  const [memo, setMemo] = useState<MemoData | null>(null);
  const [verification, setVerification] = useState<Verification | null>(null);
  const [markdown, setMarkdown] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function write() {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/memo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ codes: [code] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Memo failed.");
      setMemo(data.memo);
      setVerification(data.verification);
      setMarkdown(data.markdown);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Memo failed.");
    } finally {
      setLoading(false);
    }
  }

  function download() {
    const blob = new Blob([markdown], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `memo-${code}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (!memo)
    return (
      <section className="mt-6 rounded-xl border bg-white p-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-500">Verified analyst memo</h2>
          <button
            onClick={write}
            disabled={loading}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {loading ? "Writing…" : "Write memo"}
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </section>
    );

  return (
    <section className="mt-6 rounded-xl border bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold">{memo.title}</h2>
      </div>
      <p className="mt-1 text-sm">
        <span className="font-medium">Call:</span> {memo.call}
      </p>
      {verification && (
        <p className="mt-1 text-xs font-medium text-emerald-700">
          {badgeText(verification)}
        </p>
      )}
      <ul className="mt-2 space-y-1 text-sm">
        {memo.evidence.map((e, i) => (
          <li key={i}>
            {e.claim}{" "}
            <a
              href={`#metric-${e.metric}`}
              className="text-xs text-sky-700 hover:underline"
            >
              source
            </a>
          </li>
        ))}
      </ul>
      {memo.risks.length > 0 && (
        <>
          <p className="mt-2 text-sm font-medium">Risks</p>
          <ul className="list-disc pl-5 text-sm">
            {memo.risks.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </>
      )}
      <p className="mt-2 text-sm">
        <span className="font-medium">What would change my mind:</span>{" "}
        {memo.what_would_change_my_mind}
      </p>
      <p className="mt-1 text-sm">
        <span className="font-medium">Market read-across:</span> {memo.market_read_across}
      </p>
      <p className="mt-2 text-xs text-slate-500">{METHOD_FOOTNOTE}</p>
      <div className="mt-2 flex gap-2">
        <button
          onClick={download}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:border-slate-500"
        >
          Export Markdown
        </button>
        <button
          onClick={write}
          disabled={loading}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:border-slate-500 disabled:opacity-50"
        >
          {loading ? "Writing…" : "Rewrite"}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </section>
  );
}
