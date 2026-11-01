import { describe, expect, it, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resetStreetDb } from "../street";
import { getEpcSignal, resetEpcData } from "./epc";

// Tiny fixture: 12 EPC-rated homes on one street/sector/LSOA/MSOA.
const FIXTURE = {
  asof: "2024-12-31",
  source: "fixture",
  min_n: 10,
  levels: {
    street: { "E15|VICTORIA ROAD": { n: 12, dg: 0.5, eg: 0.25, fg: 0.0833, med: "D", pct: 62.5 } },
    sector: { "E15 2": { n: 40, dg: 0.4, eg: 0.2, fg: 0.05, med: "C", pct: 50 } },
    lsoa: {},
    msoa: {},
  },
};

let tmp: string;
let oldStreet: string | undefined;
let oldEpc: string | undefined;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "epc-test-"));
  const sdb = path.join(tmp, "street.db");
  const d = new Database(sdb);
  d.exec("CREATE TABLE postcodes(postcode TEXT, sector TEXT, lsoa TEXT, msoa TEXT, lad TEXT, lat REAL, lon REAL, street_key TEXT)");
  d.exec("CREATE INDEX ix_pc ON postcodes(postcode)");
  d.prepare("INSERT INTO postcodes VALUES(?,?,?,?,?,?,?,?)").run(
    "E15 2AB", "E15 2", "E01000001", "E02000001", "E09000001", 51.5, 0.0, "E15|VICTORIA ROAD",
  );
  d.prepare("INSERT INTO postcodes VALUES(?,?,?,?,?,?,?,?)").run(
    "E15 2AC", "E15 2", "E01000001", "E02000001", "E09000001", 51.5, 0.01, "E15|VICTORIA ROAD",
  );
  d.close();
  const epc = path.join(tmp, "epc.json");
  fs.writeFileSync(epc, JSON.stringify(FIXTURE));
  oldStreet = process.env.STREET_DB_PATH;
  oldEpc = process.env.EPC_DATA_PATH;
  process.env.STREET_DB_PATH = sdb;
  process.env.EPC_DATA_PATH = epc;
  resetStreetDb();
  resetEpcData();
});

afterEach(() => {
  process.env.STREET_DB_PATH = oldStreet;
  process.env.EPC_DATA_PATH = oldEpc;
  resetStreetDb();
  resetEpcData();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("getEpcSignal", () => {
  it("returns the street-level signal when n >= min_n", () => {
    const s = getEpcSignal("e15 2ab");
    expect(s.available).toBe(true);
    expect(s.score).toBe(62.5);
    expect(s.direction).toBe("risk");
    expect(s.facts).toMatchObject({ level: "street", n: 12, median_rating: "D" });
    expect(s.headline).toContain("50%");
  });

  it("is unavailable for invalid and unknown postcodes, never throws", () => {
    expect(getEpcSignal("not a postcode").available).toBe(false);
    expect(getEpcSignal("W1A 1AA").available).toBe(false);
  });

  it("is unavailable when the data file is missing", () => {
    process.env.EPC_DATA_PATH = path.join(tmp, "nope.json");
    resetEpcData();
    const s = getEpcSignal("E15 2AB");
    expect(s.available).toBe(false);
    expect(s.score).toBeNull();
  });
});
