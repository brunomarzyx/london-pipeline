import { getStreetDb, normalisePostcode } from "./street";
import { getAirSignal, type ContextSignal } from "./context/air";
import { getEpcSignal } from "./context/epc";
import { getFloodSignal } from "./context/flood";
import { getGreenspaceSignal } from "./context/greenspace";
import { getHeritageSignal } from "./context/heritage";
import { getNoiseSignal } from "./context/noise";
import { getPipelineSignal } from "./context/pipeline";
import { getSchoolsSignal } from "./context/schools";
import { getShortletsSignal } from "./context/shortlets";
import { getTransportSignal } from "./context/transport";

export type Lens = "buyer" | "investor";

/** Buyer lens: day-to-day liveability first — flood safety and schools weigh most. */
export const BUYER_WEIGHTS: Record<string, number> = {
  flood: 2, // ruin risk for an owner-occupier
  air: 1, // daily health exposure
  noise: 1, // daily comfort
  schools: 1.5, // family buyers pay for catchments
  "transport-proximity": 1, // commute access (proximity only)
  greenspace: 1, // nearby open space
  heritage: 0.5, // planning friction, rarely binding
  epc: 0.5, // running costs, upgradeable
  shortlets: 0.5, // neighbour nuisance only
  pipeline: 0.5, // future supply, slow to matter for living
};

/** Investor lens: cashflow and exit risk first — pipeline glut and letting rules weigh most. */
export const INVESTOR_WEIGHTS: Record<string, number> = {
  pipeline: 2, // new supply competes on price and rent
  shortlets: 1.5, // visitor-led demand / regulation proxy
  epc: 1.5, // MEES letting risk for F/G stock
  flood: 1.5, // insurance and mortgageability
  "transport-proximity": 1, // rental demand follows access
  air: 0.5, // priced in weakly
  noise: 0.5, // priced in weakly
  schools: 0.5, // matters less for typical rental stock
  greenspace: 0.5, // priced in weakly
  heritage: 0.5, // planning friction, rarely binding
};

export const LENS_WEIGHTS: Record<Lens, Record<string, number>> = {
  buyer: BUYER_WEIGHTS,
  investor: INVESTOR_WEIGHTS,
};

export interface ScoredComponent {
  key: string;
  label: string;
  available: boolean;
  score: number | null;
  weight: number;
  contribution: number | null;
  headline: string;
  facts: Record<string, string | number | boolean | null>;
  source: string;
  asof: string;
}

export interface AreaScore {
  postcode: string | null;
  lens: Lens;
  located: boolean;
  score: number | null;
  band: "Low" | "Moderate" | "Elevated" | "High" | null;
  lowCoverage: boolean;
  available: number;
  total: number;
  drivers: ScoredComponent[];
  strengths: ScoredComponent[];
  components: ScoredComponent[];
  supplyPressure: {
    units: number | null;
    percentile: number | null;
    top: { ref: string | null; units: number | null; status: string | null }[];
  } | null;
}

/** Collect the 10 scored signals, dropping unavailable ones and transport-premium. */
export function getAreaScore(postcode: string, lens: Lens = "buyer"): AreaScore {
  const pc = normalisePostcode(postcode);
  const weights = LENS_WEIGHTS[lens] ?? LENS_WEIGHTS.buyer;
  const empty = (located: boolean): AreaScore => ({
    postcode: pc,
    lens,
    located,
    score: null,
    band: null,
    lowCoverage: true,
    available: 0,
    total: 10,
    drivers: [],
    strengths: [],
    components: [],
    supplyPressure: null,
  });
  if (!pc) return { ...empty(false), located: false };

  let located = true;
  try {
    const d = getStreetDb();
    const row = d
      ?.prepare("SELECT lat, lon FROM postcodes WHERE postcode=?")
      .get(pc) as { lat: number | null; lon: number | null } | undefined;
    if (!row || row.lat == null || row.lon == null) located = false;
  } catch {
    located = false;
  }

  const raw: ContextSignal[] = [
    getFloodSignal(pc),
    getAirSignal(pc),
    getNoiseSignal(pc),
    getSchoolsSignal(pc),
    ...getTransportSignal(pc).filter((s) => s.key !== "transport-premium"),
    getGreenspaceSignal(pc),
    getHeritageSignal(pc),
    getEpcSignal(pc),
    getShortletsSignal(pc),
    getPipelineSignal(pc),
  ];
  const seen = new Set<string>();
  const signals = raw.filter((s) => {
    if (seen.has(s.key)) return false;
    seen.add(s.key);
    return weights[s.key] != null;
  });

  const components: ScoredComponent[] = signals.map((s) => ({
    key: s.key,
    label: s.label,
    available: s.available && s.score != null,
    score: s.available ? s.score : null,
    weight: weights[s.key],
    contribution:
      s.available && s.score != null
        ? Math.round(weights[s.key] * s.score * 100) / 100
        : null,
    headline: s.headline,
    facts: s.facts,
    source: s.source,
    asof: s.asof,
  }));

  const avail = components.filter((c) => c.available && c.score != null);
  const total = 10;
  const lowCoverage = avail.length < total / 2;
  let score: number | null = null;
  let band: AreaScore["band"] = null;
  if (!lowCoverage && avail.length > 0) {
    const wSum = avail.reduce((a, c) => a + c.weight, 0);
    const cSum = avail.reduce((a, c) => a + c.weight * (c.score as number), 0);
    score = Math.round(cSum / wSum);
    band = score < 33 ? "Low" : score <= 55 ? "Moderate" : score <= 70 ? "Elevated" : "High";
  }
  const drivers = [...avail]
    .sort((a, b) => (b.contribution as number) - (a.contribution as number))
    .slice(0, 3);
  const strengths = [...avail].sort((a, b) => (a.score as number) - (b.score as number)).slice(0, 2);

  const pipe = signals.find((s) => s.key === "pipeline");
  const pf = pipe?.facts ?? {};
  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
  const supplyPressure =
    pipe?.available && num(pf.units_pipeline_1km) != null
      ? {
          units: num(pf.units_pipeline_1km),
          percentile: num(pf.pct_pipeline_london),
          top: [1, 2, 3]
            .map((i) => ({
              ref: str(pf[`top${i}_ref`]),
              units: num(pf[`top${i}_units`]),
              status: str(pf[`top${i}_status`]),
            }))
            .filter((t) => t.units != null),
        }
      : null;

  return {
    postcode: pc,
    lens,
    located,
    score,
    band,
    lowCoverage,
    available: avail.length,
    total,
    drivers,
    strengths,
    components,
    supplyPressure,
  };
}
