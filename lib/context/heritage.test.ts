import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getHeritageSignal, resetHeritageDb } from "./heritage.js";

let dir: string;
let fixture: string;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "heritage-ctx-"));
  fixture = path.join(dir, "heritage.db");
  const d = new Database(fixture);
  d.exec(
    "CREATE TABLE postcode_metrics(postcode TEXT PRIMARY KEY, in_ca INTEGER, ca_name TEXT, listed_100m INTEGER, nearest_listed_m INTEGER, nearest_listed_name TEXT, nearest_listed_grade TEXT, in_a4 INTEGER, a4_ref TEXT, score REAL);" +
      "CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT);",
  );
  d.exec(
    "INSERT INTO postcode_metrics VALUES" +
      "('NW3 1QE',1,'Hampstead',26,13,'2 AND 4, FLASK WALK','II',1,'A4EC3b1',100)," +
      "('HA8 7QT',1,'Canons Park Estate',0,NULL,NULL,NULL,0,NULL,70)," +
      "('SE15 4AN',0,NULL,1,80,'Some Hall','II',0,NULL,40)," +
      "('E14 9AF',0,NULL,0,NULL,NULL,NULL,0,NULL,0);",
  );
  d.exec("INSERT INTO meta VALUES('asof','2026-11-01');");
  d.close();
  process.env.HERITAGE_CONTEXT_PATH = fixture;
  resetHeritageDb();
});

afterAll(() => {
  delete process.env.HERITAGE_CONTEXT_PATH;
  resetHeritageDb();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("getHeritageSignal", () => {
  it("reports compounding constraints with score 100 and risk direction", () => {
    const s = getHeritageSignal("nw3 1qe");
    expect(s.available).toBe(true);
    expect(s.key).toBe("heritage");
    expect(s.direction).toBe("risk");
    expect(s.score).toBe(100);
    expect(s.facts.in_conservation_area).toBe(true);
    expect(s.facts.conservation_area_name).toBe("Hampstead");
    expect(s.facts.listed_buildings_within_100m).toBe(26);
    expect(s.facts.in_article_4_area).toBe(true);
    expect(s.headline).toContain("Hampstead");
    expect(s.headline).toContain("Article 4");
  });

  it("bands single constraints and the clear case correctly", () => {
    expect(getHeritageSignal("HA8 7QT").score).toBe(70);
    expect(getHeritageSignal("SE15 4AN").score).toBe(40);
    const clear = getHeritageSignal("E14 9AF");
    expect(clear.score).toBe(0);
    expect(clear.headline).toContain("No conservation area");
  });

  it("marks invalid and uncovered postcodes unavailable without throwing", () => {
    expect(getHeritageSignal("junk!!").available).toBe(false);
    expect(getHeritageSignal("junk!!").score).toBeNull();
    expect(getHeritageSignal("AB1 2CD").available).toBe(false);
  });

  it("returns unavailable (never throws) when the data file is missing", () => {
    process.env.HERITAGE_CONTEXT_PATH = path.join(dir, "missing.db");
    resetHeritageDb();
    const s = getHeritageSignal("NW3 1QE");
    expect(s.available).toBe(false);
    expect(s.score).toBeNull();
    process.env.HERITAGE_CONTEXT_PATH = fixture;
    resetHeritageDb();
  });
});
