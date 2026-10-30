import { PHASE_COLOR, classifyCycle, explainCyclePhase } from "@/lib/cycle";
import { getBoroughDetail } from "@/lib/db";

export default async function CycleCard({ code }: { code: string }) {
  const d = getBoroughDetail(code);
  if (!d) return null;
  const phase = classifyCycle(d.priceChange, d.pressure, d.momentum);
  const text = await explainCyclePhase(code);
  return (
    <section className="mt-6 rounded-xl border bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold text-slate-500">
          Muse Spark on the cycle
        </h2>
        <span
          className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
          style={{ background: PHASE_COLOR[phase] }}
        >
          {phase === "unknown" ? "no data" : phase}
        </span>
      </div>
      <p className="mt-2 text-sm">{text}</p>
    </section>
  );
}
