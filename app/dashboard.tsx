"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { BoroughMetrics } from "@/lib/db";
import {
  PHASE_COLOR,
  PHASE_LABEL,
  classifyCycle,
  type CyclePhase,
} from "@/lib/cycle-phase";
import AskBox from "./ask-box";
import GlobalView from "./global-view";

export type MetricKey = "priceChange" | "netBuildup" | "pressure" | "momentum" | "grossYield" | "rentChange" | "salesChange";
export type LayerKey = MetricKey | "phase";

const PHASE_ORDER: CyclePhase[] = ["hypersupply", "expansion", "recession", "recovery", "unknown"];

function phaseOf(m: BoroughMetrics): CyclePhase {
  return classifyCycle(m.priceChange, m.pressure, m.momentum);
}

const minus = (s: string) => s.replace("-", "−");
const METRICS: { key: MetricKey; label: string; fmt: (v: number | null) => string }[] = [
  { key: "priceChange", label: "Price Δ 12m %", fmt: (v) => (v == null ? "no data" : `${minus(v.toFixed(1))}%`) },
  { key: "netBuildup", label: "Net build-up", fmt: (v) => (v == null ? "no data" : Math.round(v).toLocaleString()) },
  { key: "pressure", label: "Supply pressure", fmt: (v) => (v == null ? "no data" : `${minus(v.toFixed(2))}×`) },
  { key: "momentum", label: "Starts momentum", fmt: (v) => (v == null ? "no data" : `${minus((v * 100).toFixed(1))}%`) },
  { key: "grossYield", label: "Gross yield", fmt: (v) => (v == null ? "no data" : `${minus(v.toFixed(1))}%`) },
  { key: "rentChange", label: "Rent Δ 12m %", fmt: (v) => (v == null ? "no data" : `${minus(v.toFixed(1))}%`) },
  { key: "salesChange", label: "Sales Δ 2025 vs 2024", fmt: (v) => (v == null ? "no data" : `${minus((v * 100).toFixed(1))}%`) },
];

const COLORS = ["#e0f2fe", "#7dd3fc", "#0284c7", "#0c4a6e", "#020617"];
const NODATA = "#d4d4d8";

function breaksFor(vals: number[]): number[] {
  if (!vals.length) return [];
  const s = [...vals].sort((a, b) => a - b);
  const q = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return [q(0.2), q(0.4), q(0.6), q(0.8)];
}

function colorFor(v: number | null, breaks: number[]): string {
  if (v == null || !Number.isFinite(v)) return NODATA;
  let i = 0;
  for (const b of breaks) if (v > b) i++;
  return COLORS[Math.min(i, COLORS.length - 1)];
}

export default function Dashboard({ metrics, headline }: { metrics: BoroughMetrics[]; headline?: string }) {
  const [metric, setMetric] = useState<LayerKey>("priceChange");
  const isPhase = metric === "phase";
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<"london" | "global">("london");
  const mapRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<any>(null);
  const mapObj = useRef<any>(null);
  const stateRef = useRef({ metric, selected, metrics });
  stateRef.current = { metric, selected, metrics };

  const byCode = useMemo(() => Object.fromEntries(metrics.map((m) => [m.code, m])), [metrics]);
  const vals = useMemo(
    () =>
      isPhase
        ? []
        : metrics
            .map((m) => m[metric as MetricKey])
            .filter((v): v is number => v != null && Number.isFinite(v)),
    [metrics, metric, isPhase],
  );
  const breaks = useMemo(() => breaksFor(vals), [vals]);
  const breaksRef = useRef(breaks);
  breaksRef.current = breaks;
  const ranked = useMemo(() => {
    const arr = [...metrics];
    if (isPhase) {
      arr.sort(
        (a, b) =>
          PHASE_ORDER.indexOf(phaseOf(a)) - PHASE_ORDER.indexOf(phaseOf(b)) ||
          a.name.localeCompare(b.name),
      );
      return arr;
    }
    const key = metric as MetricKey;
    arr.sort((a, b) => {
      const av = a[key] as number | null, bv = b[key] as number | null;
      if (av == null && bv == null) return a.name.localeCompare(b.name);
      if (av == null) return 1;
      if (bv == null) return -1;
      return (bv as number) - (av as number);
    });
    return arr;
  }, [metrics, metric, isPhase]);

  useEffect(() => {
    let dead = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (!mapRef.current || mapObj.current || dead) return;
      const map = L.map(mapRef.current).setView([51.5074, -0.1278], 10);
      mapObj.current = map;
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors | Borough boundaries: Greater London Authority (GLA) — contains Ordnance Survey data © Crown copyright and database right',
      }).addTo(map);
      const geo = await (await fetch("/api/geo")).json();
      const paint = (f: any) => {
        const s = stateRef.current;
        const code = f?.properties?.code as string;
        const m = s.metrics.find((x) => x.code === code);
        const isSel = code === s.selected;
        const fillColor =
          s.metric === "phase"
            ? PHASE_COLOR[m ? phaseOf(m) : "unknown"]
            : colorFor((m?.[s.metric as MetricKey] ?? null) as number | null, breaksRef.current);
        return {
          fillColor,
          weight: isSel ? 3 : 1,
          color: isSel ? "#0f172a" : "#ffffff",
          fillOpacity: 0.8,
        };
      };
      const layer = L.geoJSON(geo, {
        style: paint,
        onEachFeature: (f: any, l: any) => {
          l.on("click", () => setSelected(f.properties.code));
          l.bindTooltip(f.properties.name);
        },
      }).addTo(map);
      layerRef.current = layer;
      map.fitBounds(layer.getBounds());
    })();
    return () => { dead = true; };
  }, []);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    const fmt = METRICS.find((m) => m.key === metric)?.fmt;
    layer.setStyle((f: any) => {
      const code = f?.properties?.code as string;
      const m = byCode[code];
      const isSel = code === selected;
      const fillColor =
        isPhase || !m
          ? PHASE_COLOR[m ? phaseOf(m) : "unknown"]
          : colorFor((m[metric as MetricKey] ?? null) as number | null, breaks);
      return {
        fillColor,
        weight: isSel ? 3 : 1,
        color: isSel ? "#0f172a" : "#ffffff",
        fillOpacity: 0.8,
      };
    });
    layer.eachLayer((l: any) => {
      const m = byCode[l.feature?.properties?.code];
      if (m)
        l.setTooltipContent(
          isPhase || !fmt
            ? `${l.feature.properties.name}: ${PHASE_LABEL[phaseOf(m)]}`
            : `${l.feature.properties.name}: ${fmt((m[metric as MetricKey] ?? null) as number | null)}`,
        );
    });
  }, [metric, breaks, byCode, selected, isPhase]);

  const fmt = METRICS.find((m) => m.key === metric)?.fmt
    ?? ((v: number | null) => (v == null ? "no data" : String(v)));

  return (
    <div className="flex h-screen flex-col bg-slate-950 text-slate-100">
      <header className="flex flex-wrap items-center gap-3 border-b border-slate-800 px-5 py-3">
        <h1 className="text-lg font-semibold tracking-tight">London Pipeline</h1>
        <span className="text-sm text-slate-400">supply vs price by borough</span>
        <div className="flex gap-1 rounded-full bg-slate-900 p-1">
          {(["london", "global"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`rounded-full px-3 py-1 text-sm capitalize ${view === v ? "bg-slate-100 font-medium text-slate-950" : "text-slate-300 hover:text-white"}`}
            >
              {v === "london" ? "London" : "Global"}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <AskBox />
          <div className="flex max-w-full gap-1 overflow-x-auto rounded-full bg-slate-900 p-1">
          {METRICS.map((m) => (
            <button
              key={m.key}
              onClick={() => setMetric(m.key)}
              className={`rounded-full px-3 py-1 text-sm ${metric === m.key ? "bg-sky-400 font-medium text-slate-950" : "text-slate-300 hover:text-white"}`}
            >
              {m.label}
            </button>
          ))}
          <button
            onClick={() => setMetric("phase")}
            className={`rounded-full px-3 py-1 text-sm ${metric === "phase" ? "bg-sky-400 font-medium text-slate-950" : "text-slate-300 hover:text-white"}`}
          >
            Cycle phase
          </button>
          </div>
        </div>
      </header>
      {headline && (
        <div className="border-b border-slate-800 bg-slate-900 px-5 py-1.5 text-sm text-slate-200">
          {headline}
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        {view === "global" ? <GlobalView /> : (
        <>
        <div className="relative min-w-0 flex-1">
          <div ref={mapRef} className="absolute inset-0 z-0" />
          <div className="absolute bottom-6 left-3 z-10 rounded-lg bg-white/95 p-3 text-xs text-slate-800 shadow">
            <div className="mb-1 font-semibold">{isPhase ? "Cycle phase" : METRICS.find((m) => m.key === metric)!.label}</div>
            {isPhase ? (
              <>
                {PHASE_ORDER.map((p) => (
                  <div key={p} className="flex items-center gap-1"><span className="inline-block h-3 w-8" style={{ background: PHASE_COLOR[p] }} />{PHASE_LABEL[p]}</div>
                ))}
              </>
            ) : breaks.length === 0 ? <div>no data</div> : (
              <>
                <div className="flex items-center gap-1"><span className="inline-block h-3 w-8" style={{ background: COLORS[0] }} />≤ {fmt(breaks[0])}</div>
                {breaks.slice(1).map((b, i) => (
                  <div key={i} className="flex items-center gap-1"><span className="inline-block h-3 w-8" style={{ background: COLORS[i + 1] }} />{fmt(breaks[i])} – {fmt(b)}</div>
                ))}
                <div className="flex items-center gap-1"><span className="inline-block h-3 w-8" style={{ background: COLORS[4] }} />&gt; {fmt(breaks[breaks.length - 1])}</div>
              </>
            )}
            {!isPhase && (
              <div className="mt-1 flex items-center gap-1"><span className="inline-block h-3 w-8" style={{ background: NODATA }} />no data</div>
            )}
          </div>
        </div>
        <aside className="hidden w-[380px] shrink-0 flex-col border-l border-slate-800 bg-white text-slate-900 md:flex">
          <div className="border-b px-4 py-2 text-sm font-semibold">Ranked — {isPhase ? "Cycle phase" : METRICS.find((m) => m.key === metric)!.label}</div>
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full text-sm">
              <tbody>
                {ranked.map((r, i) => (
                  <tr key={r.code} onClick={() => setSelected(r.code)}
                    className={`cursor-pointer border-b border-slate-100 ${selected === r.code ? "bg-sky-100" : "hover:bg-slate-50"}`}>
                    <td className="px-3 py-1.5 text-slate-500">{i + 1}</td>
                    <td className="px-1 py-1.5 font-medium">
                      <Link href={`/borough/${r.code}`} className="underline-offset-2 hover:underline">{r.name}</Link>
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {isPhase ? (
                        <span
                          className="inline-block rounded-full px-2 py-0.5 text-xs font-medium text-white"
                          style={{ background: PHASE_COLOR[phaseOf(r)] }}
                        >
                          {PHASE_LABEL[phaseOf(r)]}
                        </span>
                      ) : (r[metric as MetricKey] as number | null) == null ? (
                        <span className="text-slate-400">no data</span>
                      ) : (
                        fmt(r[metric as MetricKey] as number)
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {selected && byCode[selected] && (
            <div className="border-t p-3 text-sm">
              Selected: <strong>{byCode[selected].name}</strong>{" "}
              <Link href={`/borough/${selected}`} className="ml-2 rounded bg-slate-900 px-2 py-1 text-white">Open →</Link>
            </div>
          )}
        </aside>
        </>
        )}
      </div>
    </div>
  );
}
