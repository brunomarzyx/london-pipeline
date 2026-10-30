"use client";
import { useState } from "react";

export const EXAMPLES = [
  "Which 5 boroughs have the biggest pipeline build-up?",
  "Where is supply pressure highest relative to completions?",
  "How has Tower Hamlets compared with Newham?",
];

interface Verification {
  total: number;
  verified: number;
}

interface MemoLite {
  title: string;
  call: string;
  evidence: { claim: string; borough: string; metric: string }[];
  market_read_across: string;
}

function badgeText(v: Verification): string {
  if (v.total === 0) return "no figures to verify";
  return `✓ ${v.verified}/${v.total} figures verified against source data`;
}

export default function AskBox() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [verification, setVerification] = useState<Verification | null>(null);
  const [memoCodes, setMemoCodes] = useState<string[]>([]);
  const [memo, setMemo] = useState<MemoLite | null>(null);
  const [memoVerification, setMemoVerification] = useState<Verification | null>(null);
  const [memoMarkdown, setMemoMarkdown] = useState("");
  const [loading, setLoading] = useState(false);
  const [memoLoading, setMemoLoading] = useState(false);

  async function findCodes(text: string): Promise<string[]> {
    try {
      const res = await fetch("/api/metrics");
      const rows = (await res.json()) as { code: string; name: string }[];
      const lower = text.toLowerCase();
      const hits = rows
        .filter((r) => lower.includes(r.name.toLowerCase()))
        .sort((a, b) => b.name.length - a.name.length);
      return [...new Map(hits.map((h) => [h.code, h.code])).values()].slice(0, 2);
    } catch {
      return [];
    }
  }

  async function send(question: string) {
    const text = question.trim();
    if (!text || loading) return;
    setQ(text);
    setLoading(true);
    setAnswer(null);
    setVerification(null);
    setMemo(null);
    setMemoVerification(null);
    setMemoCodes([]);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: text }),
      });
      const data = await res.json();
      const a = data.answer ?? data.error ?? "No answer.";
      setAnswer(a);
      if (data.verification) setVerification(data.verification);
      setMemoCodes(await findCodes(`${text} ${a}`));
    } catch {
      setAnswer("Request failed. Try again.");
    } finally {
      setLoading(false);
    }
  }

  async function writeMemo() {
    if (memoLoading || memoCodes.length === 0) return;
    setMemoLoading(true);
    try {
      const res = await fetch("/api/memo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ codes: memoCodes }),
      });
      const data = await res.json();
      if (res.ok) {
        setMemo(data.memo);
        setMemoVerification(data.verification);
        setMemoMarkdown(data.markdown);
      }
    } finally {
      setMemoLoading(false);
    }
  }

  function downloadMemo() {
    const blob = new Blob([memoMarkdown], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `memo-${memoCodes.join("-")}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (!open)
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-full bg-sky-400 px-3 py-1 text-sm font-medium text-slate-950"
      >
        Ask London
      </button>
    );

  return (
    <div className="fixed left-4 top-16 z-20 w-[min(400px,calc(100vw-2rem))] rounded-xl border border-slate-700 bg-slate-900 p-4 text-slate-100 shadow-xl">
      <div className="flex items-center">
        <h2 className="text-sm font-semibold">Ask London</h2>
        <button
          onClick={() => setOpen(false)}
          className="ml-auto text-sm text-slate-400 hover:text-white"
        >
          Close
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {EXAMPLES.map((e) => (
          <button
            key={e}
            onClick={() => send(e)}
            className="rounded-full border border-slate-600 px-2.5 py-1 text-xs text-slate-200 hover:border-sky-400 hover:text-white"
          >
            {e}
          </button>
        ))}
      </div>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(ev) => {
          ev.preventDefault();
          send(q);
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ask about supply and prices…"
          maxLength={500}
          className="min-w-0 flex-1 rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm placeholder:text-slate-500"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-sky-400 px-3 py-1.5 text-sm font-medium text-slate-950 disabled:opacity-50"
        >
          {loading ? "…" : "Ask"}
        </button>
      </form>
      {answer && <p className="mt-2 text-sm leading-relaxed">{answer}</p>}
      {verification && (
        <p className="mt-1 text-xs font-medium text-emerald-400">
          {badgeText(verification)}
        </p>
      )}
      {memoCodes.length > 0 && !memo && (
        <button
          onClick={writeMemo}
          disabled={memoLoading}
          className="mt-2 rounded-lg border border-slate-600 px-3 py-1.5 text-sm hover:border-sky-400 disabled:opacity-50"
        >
          {memoLoading
            ? "Writing…"
            : memoCodes.length > 1
              ? "Write memo: compare these boroughs"
              : "Write memo for this borough"}
        </button>
      )}
      {memo && (
        <div className="mt-2 rounded-lg border border-slate-700 p-2 text-sm">
          <p className="font-medium">{memo.title}</p>
          <p className="text-slate-300">{memo.call}</p>
          {memoVerification && (
            <p className="mt-1 text-xs font-medium text-emerald-400">
              {badgeText(memoVerification)}
            </p>
          )}
          <ul className="mt-1 space-y-0.5 text-slate-200">
            {memo.evidence.map((e, i) => (
              <li key={i}>
                {e.claim}{" "}
                <a
                  href={`/borough/${e.borough}#metric-${e.metric}`}
                  className="text-xs text-sky-400 hover:underline"
                >
                  source
                </a>
              </li>
            ))}
          </ul>
          <button
            onClick={downloadMemo}
            className="mt-2 rounded-lg border border-slate-600 px-2.5 py-1 text-xs hover:border-sky-400"
          >
            Export Markdown
          </button>
        </div>
      )}
    </div>
  );
}
