import { describe, expect, it, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resetStreetDb } from "../street";
import { getPipelineSignal, resetPipelineData } from "./pipeline";

const FIXTURE = {
  asof: "2026-11-01",
  source: "fixture",
  note: "fixture",
  lsoa: {
    E01000001: {
      ns: 100,
      st: 50,
      tot: 150,
      pct: 80,
      top: [
        { ref: "20/001/FUL", name: "Test Site", borough: "Test", units: 100, status: "not_started", dec: "01/01/2024", dist_km: 0.3 },
        { ref: "21/002/FUL", name: "Other Site", borough: "Test", units: 50, status: "started", dec: "01/06/2023", dist_km: 0.7 },
      ],
    },
    E01000002: { ns: 0, st: 0, tot: 0, pct: 2, top: [] },
  },
  totals: { records: 10, sites: 5, active: 2 },
};

let tmp: string;
let oldStreet: string | undefined;
let oldData: string | undefined;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pipeline-test-"));
  const sdb = path.join(tmp, "street.db");
  const d = new Database(sdb);
  d.exec("CREATE TABLE postcodes(postcode TEXT, sector TEXT, lsoa TEXT, msoa TEXT, lad TEXT, lat REAL, lon REAL, street_key TEXT)");
  d.prepare("INSERT INTO postcodes VALUES(?,?,?,?,?,?,?,?)").run(
    "E15 2AB", "E15 2", "E01000001", "E02000001", "E09000001", 51.5, 0.0, "X",
  );
  d.prepare("INSERT INTO postcodes VALUES(?,?,?,?,?,?,?,?)").run(
    "E15 2AC", "E15 2", "E01000002", "E02000001", "E09000001", 51.5, 0.01, "Y",
  );
  d.close();
  const jp = path.join(tmp, "pipeline.json");
  fs.writeFileSync(jp, JSON.stringify(FIXTURE));
  oldStreet = process.env.STREET_DB_PATH;
  oldData = process.env.PIPELINE_DATA_PATH;
  process.env.STREET_DB_PATH = sdb;
  process.env.PIPELINE_DATA_PATH = jp;
  resetStreetDb();
  resetPipelineData();
});

afterEach(() => {
  process.env.STREET_DB_PATH = oldStreet;
  process.env.PIPELINE_DATA_PATH = oldData;
  resetStreetDb();
  resetPipelineData();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("getPipelineSignal", () => {
  it("returns pressure plus top schemes", () => {
    const s = getPipelineSignal("E15 2AB");
    expect(s.available).toBe(true);
    expect(s.score).toBe(80);
    expect(s.direction).toBe("risk");
    expect(s.facts).toMatchObject({
      units_pipeline_1km: 150,
      top1_ref: "20/001/FUL",
      top1_units: 100,
    });
    expect(s.headline).toContain("150 pipeline homes");
    expect(s.headline).toContain("20/001/FUL");
  });

  it("handles a zero-pressure LSOA", () => {
    const s = getPipelineSignal("E15 2AC");
    expect(s.available).toBe(true);
    expect(s.headline).toContain("No approved-but-unbuilt");
  });

  it("is unavailable for invalid/unknown postcodes and missing data, never throws", () => {
    expect(getPipelineSignal("zzz").available).toBe(false);
    expect(getPipelineSignal("W1A 1AA").available).toBe(false);
    process.env.PIPELINE_DATA_PATH = path.join(tmp, "nope.json");
    resetPipelineData();
    expect(getPipelineSignal("E15 2AB").available).toBe(false);
  });
});
