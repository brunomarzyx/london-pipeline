import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getGreenspaceSignal, resetGreenspaceDb } from "./greenspace.js";

let dir: string;
let fixture: string;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "greenspace-ctx-"));
  fixture = path.join(dir, "greenspace.db");
  const d = new Database(fixture);
  d.exec(
    "CREATE TABLE sites(id TEXT PRIMARY KEY, name TEXT, function TEXT, area_m2 REAL, clat REAL, clon REAL);" +
      "CREATE TABLE postcode_metrics(postcode TEXT PRIMARY KEY, ap_m INTEGER, area_800m INTEGER, score REAL);" +
      "CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT);",
  );
  d.exec(
    "INSERT INTO postcode_metrics VALUES('SE15 4AN',180,95000,22.5)," +
      "('E14 9AF',1200,5000,78.0);",
  );
  d.exec("INSERT INTO meta VALUES('asof','2026-11-01');");
  d.close();
  process.env.GREENSPACE_CONTEXT_PATH = fixture;
  resetGreenspaceDb();
});

afterAll(() => {
  delete process.env.GREENSPACE_CONTEXT_PATH;
  resetGreenspaceDb();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("getGreenspaceSignal", () => {
  it("returns a scored amenity signal for a covered postcode", () => {
    const s = getGreenspaceSignal("SE15 4AN");
    expect(s.available).toBe(true);
    expect(s.key).toBe("greenspace");
    expect(s.direction).toBe("amenity");
    expect(s.score).toBe(22.5);
    expect(s.facts.nearest_access_point_m).toBe(180);
    expect(s.facts.green_area_within_800m_m2).toBe(95000);
    expect(s.headline).toContain("180 m");
    expect(s.headline).toContain("9.5 ha");
  });

  it("scores poorer access higher", () => {
    expect(getGreenspaceSignal("E14 9AF").score).toBe(78.0);
  });

  it("marks invalid and uncovered postcodes unavailable without throwing", () => {
    expect(getGreenspaceSignal("nope!!").available).toBe(false);
    expect(getGreenspaceSignal("nope!!").score).toBeNull();
    expect(getGreenspaceSignal("AB1 2CD").available).toBe(false);
  });

  it("returns unavailable (never throws) when the data file is missing", () => {
    process.env.GREENSPACE_CONTEXT_PATH = path.join(dir, "missing.db");
    resetGreenspaceDb();
    const s = getGreenspaceSignal("SE15 4AN");
    expect(s.available).toBe(false);
    expect(s.score).toBeNull();
    process.env.GREENSPACE_CONTEXT_PATH = fixture;
    resetGreenspaceDb();
  });
});
