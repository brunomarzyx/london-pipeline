import { describe, expect, it, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resetStreetDb } from "../street";
import { getShortletsSignal, resetShortletsData } from "./shortlets";

const FIXTURE = {
  asof: "2026-09-17",
  source: "fixture",
  lsoa: {
    E01000001: { n: 25, gt90: 10, pct: 90 },
    E01000002: { n: 0, gt90: 0, pct: 5 },
  },
  totals: { listings: 100, entire_home: 25, entire_gt90: 10 },
};

let tmp: string;
let oldStreet: string | undefined;
let oldData: string | undefined;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "shortlets-test-"));
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
  const jp = path.join(tmp, "shortlets.json");
  fs.writeFileSync(jp, JSON.stringify(FIXTURE));
  oldStreet = process.env.STREET_DB_PATH;
  oldData = process.env.SHORTLETS_DATA_PATH;
  process.env.STREET_DB_PATH = sdb;
  process.env.SHORTLETS_DATA_PATH = jp;
  resetStreetDb();
  resetShortletsData();
});

afterEach(() => {
  process.env.STREET_DB_PATH = oldStreet;
  process.env.SHORTLETS_DATA_PATH = oldData;
  resetStreetDb();
  resetShortletsData();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("getShortletsSignal", () => {
  it("returns the LSOA signal with 90-night facts", () => {
    const s = getShortletsSignal("E15 2AB");
    expect(s.available).toBe(true);
    expect(s.score).toBe(90);
    expect(s.direction).toBe("risk");
    expect(s.facts).toMatchObject({ n_entire_home: 25, n_avail_gt90: 10, rule_nights: 90 });
    expect(s.headline).toContain("25 entire-home");
  });

  it("handles a zero-listing LSOA", () => {
    const s = getShortletsSignal("E15 2AC");
    expect(s.available).toBe(true);
    expect(s.score).toBe(5);
    expect(s.headline).toContain("No entire-home");
  });

  it("is unavailable for invalid/unknown postcodes and missing data, never throws", () => {
    expect(getShortletsSignal("zzz").available).toBe(false);
    expect(getShortletsSignal("W1A 1AA").available).toBe(false);
    process.env.SHORTLETS_DATA_PATH = path.join(tmp, "nope.json");
    resetShortletsData();
    expect(getShortletsSignal("E15 2AB").available).toBe(false);
  });
});
