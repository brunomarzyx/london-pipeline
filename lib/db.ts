import Database from "better-sqlite3";
import path from "node:path";
import {
  grossYield,
  netPipelineBuildup,
  newBuildShare,
  priceChange12m,
  priceToRent,
  rentChange12m,
  salesVolumeChange12m,
  startsMomentum,
  supplyPressureRatio,
} from "./metrics";

export interface BoroughMetrics {
  code: string;
  name: string;
  latestPrice: number | null;
  priceChange: number | null;
  netBuildup: number | null;
  pressure: number | null;
  momentum: number | null;
  avgRent: number | null;
  rentChange: number | null;
  grossYield: number | null;
  priceToRent: number | null;
  latestSales: number | null;
  salesChange: number | null;
  newBuildShare: number | null;
}

const FY_WINDOW = ["2023-24", "2024-25", "2025-26"];
const LATEST_Q = ["2025-Q3", "2025-Q4", "2026-Q1", "2026-Q2"];
const PRIOR_Q = ["2024-Q3", "2024-Q4", "2025-Q1", "2025-Q2"];

let db: Database.Database | null = null;
export function getDb() {
  if (!db) {
    db = new Database(path.join(process.cwd(), "data", "london.db"), {
      readonly: true,
    });
  }
  return db;
}

export function getAllMetrics(): BoroughMetrics[] {
  const d = getDb();
  const boroughs = d
    .prepare("SELECT DISTINCT borough_code AS code, borough AS name FROM prices")
    .all() as { code: string; name: string }[];
  const maxMonth = (
    d.prepare("SELECT MAX(month) AS m FROM prices").get() as { m: string }
  ).m;
  const [y, m] = maxMonth.split("-").map(Number);
  const d2 = new Date(y, m - 1, 1);
  d2.setMonth(d2.getMonth() - 12);
  const ago = `${d2.getFullYear()}-${String(d2.getMonth() + 1).padStart(2, "0")}`;

  const priceStmt = d.prepare(
    "SELECT avg_price FROM prices WHERE borough_code=? AND month=?",
  );
  const rentMax = (
    d.prepare("SELECT MAX(month) AS m FROM rents").get() as { m: string }
  ).m;
  const [ry, rm] = rentMax.split("-").map(Number);
  const rd = new Date(ry, rm - 1, 1);
  rd.setMonth(rd.getMonth() - 12);
  const rentAgo = `${rd.getFullYear()}-${String(rd.getMonth() + 1).padStart(2, "0")}`;
  const rentStmt = d.prepare(
    "SELECT avg_rent FROM rents WHERE borough_code=? AND month=?",
  );
  const volStmt = d.prepare(
    "SELECT sales, new_build_sales AS nb FROM volumes WHERE borough_code=? AND year=?",
  );
  const volMax = (d.prepare("SELECT MAX(year) AS y FROM volumes").get() as {
    y: string;
  }).y;
  const volPrior = String(Number(volMax) - 1);
  const fyStmt = d.prepare(
    `SELECT SUM(started_units) AS s, SUM(completed_units) AS c FROM pipeline
     WHERE borough_code=? AND period_type='FY' AND period IN ('2023-24','2024-25','2025-26')`,
  );
  const qStmt = (periods: string[]) =>
    d.prepare(
      `SELECT SUM(started_units) AS s FROM pipeline WHERE borough_code=? AND period IN (${periods.map(() => "?").join(",")})`,
    );

  return boroughs.map((b) => {
    const latest = priceStmt.get(b.code, maxMonth) as
      | { avg_price: number | null }
      | undefined;
    const prev = priceStmt.get(b.code, ago) as
      | { avg_price: number | null }
      | undefined;
    const fy = fyStmt.get(b.code) as { s: number | null; c: number | null };
    const lq = qStmt(LATEST_Q).get(b.code, ...LATEST_Q) as { s: number | null };
    const pq = qStmt(PRIOR_Q).get(b.code, ...PRIOR_Q) as { s: number | null };
    const net = netPipelineBuildup(fy.s, fy.c);
    const avgAnnual =
      fy.c == null ? null : fy.c / FY_WINDOW.length;
    const rent = rentStmt.get(b.code, rentMax) as
      | { avg_rent: number | null }
      | undefined;
    const rentPrev = rentStmt.get(b.code, rentAgo) as
      | { avg_rent: number | null }
      | undefined;
    const vol = volStmt.get(b.code, volMax) as
      | { sales: number | null; nb: number | null }
      | undefined;
    const volPrev = volStmt.get(b.code, volPrior) as
      | { sales: number | null; nb: number | null }
      | undefined;
    const latestPrice = latest?.avg_price ?? null;
    const avgRent = rent?.avg_rent ?? null;
    return {
      ...b,
      latestPrice,
      priceChange: priceChange12m(
        latestPrice,
        prev?.avg_price ?? null,
      ),
      netBuildup: net,
      pressure: supplyPressureRatio(net, avgAnnual),
      momentum: startsMomentum(lq.s, pq.s),
      avgRent,
      rentChange: rentChange12m(avgRent, rentPrev?.avg_rent ?? null),
      grossYield: grossYield(avgRent, latestPrice),
      priceToRent: priceToRent(latestPrice, avgRent),
      latestSales: vol?.sales ?? null,
      salesChange: salesVolumeChange12m(
        vol?.sales ?? null,
        volPrev?.sales ?? null,
      ),
      newBuildShare: newBuildShare(vol?.nb ?? null, vol?.sales ?? null),
    };
  });
}

export interface BoroughDetail extends BoroughMetrics {
  priceSeries: { month: string; price: number | null }[];
  yearly: { fy: string; starts: number | null; completions: number | null }[];
}

export function getBoroughDetail(code: string): BoroughDetail | null {
  const all = getAllMetrics().find((b) => b.code === code);
  if (!all) return null;
  const d = getDb();
  const priceSeries = d
    .prepare(
      "SELECT month, avg_price AS price FROM prices WHERE borough_code=? ORDER BY month",
    )
    .all(code) as { month: string; price: number | null }[];
  const yearly = d
    .prepare(
      `SELECT period AS fy, started_units AS starts, completed_units AS completions
       FROM pipeline WHERE borough_code=? AND period_type='FY' ORDER BY period`,
    )
    .all(code) as BoroughDetail["yearly"];
  return { ...all, priceSeries, yearly };
}
