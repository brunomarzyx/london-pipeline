import { promises as fs } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { createRequire } from "node:module";

// xlsx's ESM build has no readFile; use the CJS build.
const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const XLSX: typeof import("xlsx") = require("xlsx");
type WorkBook = import("xlsx").WorkBook;
import { normaliseBoroughCode } from "../lib/boroughs";
import { netPipelineBuildup, supplyPressureRatio } from "../lib/metrics";

const RAW = path.join(process.cwd(), "data", "raw");
const DB_PATH = path.join(process.cwd(), "data", "london.db");

const FY_SHEETS = ["FY_2023_24", "FY_2024_25", "FY_2025_26"];
const Q_SHEETS = [
  "Q3_2024",
  "Q4_2024",
  "Q1_2025",
  "Q2_2025",
  "Q3_2025",
  "Q4_2025",
  "Q1_2026",
  "Q2_2026",
];

type Cell = string | number | boolean | null;

function toNumberOrNull(v: Cell): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const t = v.trim();
    if (t === "" || t === "..") return null;
    const n = Number(t.replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = false;
      } else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

interface PriceRow {
  code: string;
  borough: string;
  month: string;
  avg: number | null;
}

async function readPrices(): Promise<PriceRow[]> {
  const text = await fs.readFile(
    path.join(RAW, "Average-prices-2026-08.csv"),
    "utf8",
  );
  const lines = text.split("\n");
  const rows: PriceRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const [date, name, code, avg] = splitCsv(line);
    if (!code || !/^E090\d{5}$/.test(code.trim())) continue;
    rows.push({
      code: code.trim(),
      borough: (name ?? "").trim(),
      month: (date ?? "").trim().slice(0, 7),
      avg: avg == null || avg === "" ? null : Number(avg),
    });
  }
  return rows;
}

interface PipelineRow {
  code: string;
  borough: string;
  period: string;
  periodType: "FY" | "Q";
  starts: number | null;
  completions: number | null;
}

function readSheet(
  wb: WorkBook,
  sheet: string,
  period: string,
  periodType: "FY" | "Q",
): PipelineRow[] {
  const grid = XLSX.utils.sheet_to_json<Cell[]>(wb.Sheets[sheet], {
    header: 1,
    defval: null,
  });
  const hi = grid.findIndex((r) => r && r.includes("Current ONS code"));
  if (hi < 0) throw new Error(`header not found in ${sheet}`);
  const hdr = grid[hi];
  const codeCol = hdr.indexOf("Current ONS code");
  const nameCol = hdr.indexOf("Authority data");
  const startsCol = hdr.indexOf("All Starts");
  const compCol = hdr.indexOf("All Completions");
  const rows: PipelineRow[] = [];
  for (const r of grid.slice(hi + 1)) {
    if (!r) continue;
    const rawCode =
      r[codeCol] != null && String(r[codeCol]).trim() !== ""
        ? String(r[codeCol]).trim()
        : null;
    const name = r[nameCol] != null ? String(r[nameCol]).trim() : "";
    const code =
      rawCode && /^E09/.test(rawCode)
        ? rawCode
        : normaliseBoroughCode(name);
    if (!code || !/^E090\d{5}$/.test(code)) continue;
    rows.push({
      code,
      borough: name,
      period,
      periodType,
      starts: toNumberOrNull(r[startsCol]),
      completions: toNumberOrNull(r[compCol]),
    });
  }
  return rows;
}

function fyPeriod(sheet: string): string {
  const m = sheet.match(/^FY_(\d{4})_(\d{2})$/);
  if (!m) throw new Error(`bad FY sheet ${sheet}`);
  return `${m[1]}-${m[2]}`;
}

function qPeriod(sheet: string): string {
  const m = sheet.match(/^(Q\d)_(\d{4})$/);
  if (!m) throw new Error(`bad Q sheet ${sheet}`);
  return `${m[2]}-${m[1]}`;
}

async function main(): Promise<void> {
  const prices = await readPrices();
  const wbAnnual = XLSX.readFile(path.join(RAW, "LiveTable253.ods"));
  const wbQuarterly = XLSX.readFile(path.join(RAW, "LiveTable253a.ods"));
  const pipeline: PipelineRow[] = [];
  for (const sh of FY_SHEETS)
    pipeline.push(...readSheet(wbAnnual, sh, fyPeriod(sh), "FY"));
  for (const sh of Q_SHEETS)
    pipeline.push(...readSheet(wbQuarterly, sh, qPeriod(sh), "Q"));

  const db = new Database(DB_PATH);
  db.exec(`DROP TABLE IF EXISTS prices; DROP TABLE IF EXISTS pipeline;
    CREATE TABLE prices (borough_code TEXT, borough TEXT, month TEXT, avg_price REAL);
    CREATE TABLE pipeline (borough_code TEXT, borough TEXT, period TEXT, period_type TEXT, started_units INTEGER, completed_units INTEGER);`);
  const insertPrice = db.prepare(
    "INSERT INTO prices VALUES (?, ?, ?, ?)",
  );
  const insertPipe = db.prepare(
    "INSERT INTO pipeline VALUES (?, ?, ?, ?, ?, ?)",
  );
  const tx = db.transaction(() => {
    for (const p of prices)
      insertPrice.run(p.code, p.borough, p.month, p.avg);
    for (const p of pipeline)
      insertPipe.run(
        p.code,
        p.borough,
        p.period,
        p.periodType,
        p.starts,
        p.completions,
      );
  });
  tx();

  const priceCount = (
    db.prepare("SELECT COUNT(*) AS n FROM prices").get() as { n: number }
  ).n;
  const pipeCount = (
    db.prepare("SELECT COUNT(*) AS n FROM pipeline").get() as { n: number }
  ).n;
  console.log(`prices: ${priceCount} rows`);
  console.log(`pipeline: ${pipeCount} rows`);

  // Top-5 boroughs by supply pressure over the last 3 financial years.
  const byBorough = new Map<
    string,
    { borough: string; starts: (number | null)[]; comp: (number | null)[] }
  >();
  for (const p of pipeline) {
    if (p.periodType !== "FY") continue;
    let e = byBorough.get(p.code);
    if (!e) {
      e = { borough: p.borough, starts: [], comp: [] };
      byBorough.set(p.code, e);
    }
    e.starts.push(p.starts);
    e.comp.push(p.completions);
  }
  const ranked = [...byBorough.entries()]
    .map(([code, e]) => {
      const bad =
        e.starts.length !== 3 ||
        [...e.starts, ...e.comp].some((v) => v == null);
      const s = bad ? null : (e.starts as number[]).reduce((a, b) => a + b, 0);
      const c = bad ? null : (e.comp as number[]).reduce((a, b) => a + b, 0);
      const buildup = netPipelineBuildup(s, c);
      const ratio =
        buildup == null || c == null ? null : supplyPressureRatio(buildup, c / 3);
      return { code, borough: e.borough, ratio };
    })
    .filter((r) => r.ratio != null)
    .sort((a, b) => (b.ratio as number) - (a.ratio as number))
    .slice(0, 5);
  console.log("top-5 by supply pressure:");
  for (const r of ranked)
    console.log(`  ${r.borough} (${r.code}): ${(r.ratio as number).toFixed(2)}`);
  db.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
