import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { getAirSignal, resetAirDbForTest } from "./air";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "air-test-"));
const dbPath = path.join(tmp, "air.db");

function makeDb(): void {
  const d = new Database(dbPath);
  d.exec("CREATE TABLE air(postcode TEXT PRIMARY KEY, no2 REAL, pm25 REAL, score INTEGER)");
  d.exec("INSERT INTO air VALUES ('E14 9AF', 24.4, 9.5, 72), ('KT1 2TE', 19.6, 8.6, 25)");
  d.close();
}

makeDb();
process.env.AIR_DB_PATH = dbPath;

afterAll(() => {
  resetAirDbForTest();
  delete process.env.AIR_DB_PATH;
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("getAirSignal", () => {
  it("returns NO2, PM2.5 and percentile facts for a known postcode", () => {
    const s = getAirSignal("E14 9AF");
    expect(s.available).toBe(true);
    expect(s.score).toBe(72);
    expect(s.key).toBe("air");
    expect(s.direction).toBe("risk");
    expect(s.facts.no2).toBe(24.4);
    expect(s.facts.pm25).toBe(9.5);
    expect(s.facts.whoNo2Guideline).toBe(10);
    expect(s.facts.whoPm25Guideline).toBe(5);
    expect(s.facts.exceedsWhoNo2).toBe(true);
    expect(s.headline).toContain("E14 9AF");
  });

  it("marks invalid postcodes unavailable without throwing", () => {
    const s = getAirSignal("zzz");
    expect(s.available).toBe(false);
    expect(s.score).toBeNull();
  });

  it("marks postcodes outside the db unavailable without throwing", () => {
    const s = getAirSignal("AB12 3CD");
    expect(s.available).toBe(false);
    expect(s.score).toBeNull();
  });

  it("returns unavailable when the data file is missing", () => {
    process.env.AIR_DB_PATH = path.join(tmp, "missing.db");
    resetAirDbForTest();
    const s = getAirSignal("E14 9AF");
    expect(s.available).toBe(false);
    expect(s.score).toBeNull();
    process.env.AIR_DB_PATH = dbPath;
    resetAirDbForTest();
  });
});
