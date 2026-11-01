import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { getNoiseSignal, resetNoiseDbForTest } from "./noise";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "noise-test-"));
const dbPath = path.join(tmp, "noise.db");

function makeDb(): void {
  const d = new Database(dbPath);
  d.exec(
    "CREATE TABLE noise(postcode TEXT PRIMARY KEY, road_lden REAL, rail_lden REAL, band TEXT, score INTEGER)"
  );
  d.exec(
    "INSERT INTO noise VALUES ('E14 9AF', 63.7, 40.8, 'medium', 50), ('KT1 2TE', 47.6, 0.0, 'low', 15), ('NW3 1QE', 65.0, 0.0, 'high', 80)"
  );
  d.close();
}

makeDb();
process.env.NOISE_DB_PATH = dbPath;

afterAll(() => {
  resetNoiseDbForTest();
  delete process.env.NOISE_DB_PATH;
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("getNoiseSignal", () => {
  it("returns band, levels and score for a known postcode", () => {
    const s = getNoiseSignal("E14 9AF");
    expect(s.available).toBe(true);
    expect(s.score).toBe(50);
    expect(s.key).toBe("noise");
    expect(s.direction).toBe("risk");
    expect(s.facts.band).toBe("medium");
    expect(s.facts.roadLden).toBe(63.7);
    expect(s.headline).toContain("E14 9AF");
  });

  it("marks invalid postcodes unavailable without throwing", () => {
    const s = getNoiseSignal("zzz");
    expect(s.available).toBe(false);
    expect(s.score).toBeNull();
  });

  it("marks postcodes outside the db unavailable without throwing", () => {
    const s = getNoiseSignal("AB12 3CD");
    expect(s.available).toBe(false);
    expect(s.score).toBeNull();
  });

  it("returns unavailable when the data file is missing", () => {
    process.env.NOISE_DB_PATH = path.join(tmp, "missing.db");
    resetNoiseDbForTest();
    const s = getNoiseSignal("E14 9AF");
    expect(s.available).toBe(false);
    expect(s.score).toBeNull();
    process.env.NOISE_DB_PATH = dbPath;
    resetNoiseDbForTest();
  });
});
