"use client";
import { useState } from "react";

export const EXAMPLES = [
  "Which 5 boroughs have the biggest pipeline build-up?",
  "Where is supply pressure highest relative to completions?",
  "How has Tower Hamlets compared with Newham?",
];

export default function AskBox() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function send(question: string) {
    const text = question.trim();
    if (!text || loading) return;
    setQ(text);
    setLoading(true);
    setAnswer(null);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: text }),
      });
      const data = await res.json();
      setAnswer(data.answer ?? data.error ?? "No answer.");
    } catch {
      setAnswer("Request failed. Try again.");
    } finally {
      setLoading(false);
    }
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
    </div>
  );
}
