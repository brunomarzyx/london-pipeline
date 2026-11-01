import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getTransportSignal, resetTransportDb } from "./transport.js";

let dir: string;
let fixture: string;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "transport-ctx-"));
  fixture = path.join(dir, "transport.db");
  const d = new Database(fixture);
  d.exec(
    "CREATE TABLE stations(id TEXT PRIMARY KEY, name TEXT, lat REAL, lon REAL, elizabeth_since TEXT, note TEXT);" +
      "CREATE TABLE postcode_metrics(postcode TEXT PRIMARY KEY, station_name TEXT, dist_m INTEGER, score REAL, lad TEXT);" +
      "CREATE TABLE borough_premium(lad TEXT PRIMARY KEY, near_n INTEGER, near_median INTEGER, borough_n INTEGER, borough_median INTEGER, premium_pct REAL);",
  );
  d.exec(
    "INSERT INTO stations VALUES('910GCANWHRF','Canary Wharf',51.5062,-0.0188,'2022-05-24','central section opens');",
  );
  d.exec(
    "INSERT INTO postcode_metrics VALUES('E14 9AF','Canary Wharf',420,8.5,'E09000033')," +
      "('NW3 1QE','Canary Wharf',9500,92.0,'E09000007');",
  );
  d.exec(
    "INSERT INTO borough_premium VALUES('E09000033',2039,1100000,6076,900000,22.2)," +
      "('E09000007',2,NULL,5597,775000,NULL);",
  );
  d.close();
  process.env.TRANSPORT_CONTEXT_PATH = fixture;
  resetTransportDb();
});

afterAll(() => {
  delete process.env.TRANSPORT_CONTEXT_PATH;
  resetTransportDb();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("getTransportSignal", () => {
  it("returns proximity + premium signals for a covered postcode", () => {
    const [prox, prem] = getTransportSignal("e14 9af");
    expect(prox.key).toBe("transport-proximity");
    expect(prox.available).toBe(true);
    expect(prox.score).toBe(8.5);
    expect(prox.facts.nearest_station).toBe("Canary Wharf");
    expect(prox.facts.nearest_station_m).toBe(420);
    expect(prox.headline).toContain("Canary Wharf");
    expect(prem.key).toBe("transport-premium");
    expect(prem.available).toBe(true);
    expect(prem.score).toBeNull();
    expect(prem.facts.premium_pct).toBe(22.2);
    expect(prem.headline).toContain("cross-sectional only");
  });

  it("marks premium unavailable when near-station sales are too few", () => {
    const [prox, prem] = getTransportSignal("NW3 1QE");
    expect(prox.available).toBe(true);
    expect(prem.available).toBe(false);
    expect(prem.headline).toContain("Too few");
  });

  it("marks invalid and uncovered postcodes unavailable without throwing", () => {
    for (const s of getTransportSignal("bogus!!")) expect(s.available).toBe(false);
    for (const s of getTransportSignal("AB1 2CD")) expect(s.available).toBe(false);
  });

  it("returns unavailable (never throws) when the data file is missing", () => {
    process.env.TRANSPORT_CONTEXT_PATH = path.join(dir, "missing.db");
    resetTransportDb();
    for (const s of getTransportSignal("E14 9AF")) {
      expect(s.available).toBe(false);
      expect(s.score).toBeNull();
    }
    process.env.TRANSPORT_CONTEXT_PATH = fixture;
    resetTransportDb();
  });
});
