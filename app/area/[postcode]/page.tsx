import Link from "next/link";
import { notFound } from "next/navigation";
import { getAreaComps, normalisePostcode } from "@/lib/street";
import PriceCheck, { AreaMap } from "./widgets";

export const dynamic = "force-dynamic";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function windowLabel(asof: string): string {
  const [y, m] = asof.split("-").map(Number);
  const end = new Date(y, m - 1, 1);
  const start = new Date(y, m - 1, 1);
  start.setMonth(start.getMonth() - 35);
  return `${MONTHS[start.getMonth()]} ${start.getFullYear()}–${MONTHS[end.getMonth()]} ${end.getFullYear()}`;
}

const gbp = (v: number | null) =>
  v == null ? "no data" : `£${Math.round(v).toLocaleString("en-GB")}`;

const pct1 = (v: number | null) =>
  v == null ? "no data" : `${v >= 0 ? "+" : "−"}${Math.abs(v * 100).toFixed(1)}%`;

export default function AreaPage({
  params,
  searchParams,
}: {
  params: { postcode: string };
  searchParams: { type?: string; price?: string };
}) {
  const raw = decodeURIComponent(params.postcode);
  const pc = normalisePostcode(raw);
  if (!pc) notFound();
  const type =
    searchParams.type === "house"
      ? "house"
      : searchParams.type === "flat"
        ? "flat"
        : null;
  const r = getAreaComps(pc, type ?? undefined);
  if ("error" in r) notFound();
  const typeLabel = r.type ?? "property";
  const priceParam = Number(searchParams.price);
  const initialPct =
    Number.isFinite(priceParam) && priceParam > 0 && r.comps.length
      ? Math.round(
          (r.comps.filter((c) => c.price < priceParam).length / r.comps.length) * 100,
        )
      : null;

  return (
    <main className="mx-auto max-w-5xl bg-slate-50 p-6 text-slate-900">
      <Link href="/" className="text-sm text-sky-700 hover:underline">
        ← All boroughs
      </Link>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">
        {r.postcode}
        {r.type ? ` — ${r.type}s` : ""}
      </h1>
      <p className="text-sm text-slate-500">
        Street-level comparables · {r.source} · to {r.asof}
      </p>

      <div className="mt-4 rounded-xl border bg-white p-4">
        <p className="text-lg">
          Typical {typeLabel} price on {r.chosenName}: {gbp(r.chosenMedian)}{" "}
          <span className="text-sm text-slate-600">
            (n = {r.chosenN} sales, {windowLabel(r.asof)}; middle half{" "}
            {gbp(r.chosenP25)}–{gbp(r.chosenP75)})
          </span>
        </p>
        {initialPct != null && (
          <p className="mt-1 text-sm font-medium">
            £{Math.round(priceParam).toLocaleString("en-GB")} is above{" "}
            {initialPct}% of comparable sales.
          </p>
        )}
        <PriceCheck prices={r.comps.map((c) => c.price)} />
        <p className="mt-2 text-xs text-slate-500">
          Not size-adjusted: no floor-area data yet (EPC floor areas are the
          next step).
        </p>
      </div>

      <div className="mt-4 rounded-xl border bg-white p-4">
        <h2 className="text-sm font-semibold">Ladder</h2>
        <table className="mt-2 w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="py-1">Level</th>
              <th>Name</th>
              <th className="text-right">n</th>
              <th className="text-right">Median</th>
            </tr>
          </thead>
          <tbody>
            {r.ladder.map((l) => (
              <tr
                key={l.level}
                className={
                  l.level === r.chosenLevel
                    ? "bg-sky-50 font-medium"
                    : undefined
                }
              >
                <td className="py-1">{l.level}</td>
                <td>{l.name}</td>
                <td className="text-right tabular-nums">{l.n}</td>
                <td className="text-right tabular-nums">{gbp(l.median)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 rounded-xl border bg-white p-4">
        <h2 className="text-sm font-semibold">Momentum</h2>
        <p className="mt-1 text-sm">
          {r.momentum.from == null ? (
            "No repeat-sales index at this level yet."
          ) : (
            <>
              Repeat-sales index ({r.momentum.from}): {pct1(r.momentum.chg1y)}{" "}
              over 1y, {pct1(r.momentum.chg5y)} over 5y.{" "}
              <span className="text-slate-500">
                Repeat-sales index, same homes resold, excludes new builds.
              </span>
            </>
          )}
        </p>
      </div>

      <div className="mt-4 rounded-xl border bg-white p-4">
        <h2 className="text-sm font-semibold">Recent sales</h2>
        <table className="mt-2 w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="py-1">Address</th>
              <th>Date</th>
              <th className="text-right">Price</th>
            </tr>
          </thead>
          <tbody>
            {r.comps.map((c, i) => (
              <tr key={`${c.postcode}-${c.date}-${c.price}-${i}`}>
                <td className="py-1">{c.address}</td>
                <td>{c.date}</td>
                <td className="text-right tabular-nums">
                  £{c.price.toLocaleString("en-GB")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 rounded-xl border bg-white p-4">
        <h2 className="text-sm font-semibold">Map</h2>
        <div className="mt-2">
          <AreaMap comps={r.comps} median={r.chosenMedian} />
        </div>
      </div>
    </main>
  );
}
