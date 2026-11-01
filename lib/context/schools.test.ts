import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getSchoolsSignal, resetSchoolsDb } from "./schools.js";

let dir: string;
let fixture: string;

beforeAll(() => {
  // Tiny fixture db: 3 schools, 2 postcode rows. No real data needed.
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "schools-ctx-"));
  fixture = path.join(dir, "schools.db");
  const d = new Database(fixture);
  d.exec(
    "CREATE TABLE schools(urn TEXT PRIMARY KEY, name TEXT, phase TEXT, lat REAL, lon REAL, rating INTEGER, inspection_date TEXT);" +
      "CREATE TABLE postcode_metrics(postcode TEXT PRIMARY KEY, pri_urn TEXT, pri_m INTEGER, sec_urn TEXT, sec_m INTEGER, pri_good_1km INTEGER, sec_good_1km INTEGER, score REAL);" +
      "CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT);",
  );
  d.exec(
    "INSERT INTO schools VALUES('100001','Test Primary','primary',51.47,-0.06,2,'2024-05-01')," +
      "('100002','Test Secondary','secondary',51.48,-0.05,1,'2023-11-12')," +
      "('100003','Unrated Primary','primary',51.47,-0.06,NULL,NULL);",
  );
  d.exec(
    "INSERT INTO postcode_metrics VALUES('SE15 4AN','100001',320,'100002',640,2,1,12.5)," +
      "('E14 9AF','100001',1500,'100002',2100,0,0,87.5);",
  );
  d.exec("INSERT INTO meta VALUES('asof_gias','2026-10-31'),('asof_ofsted','2026-09-30');");
  d.close();
  process.env.SCHOOLS_CONTEXT_PATH = fixture;
  resetSchoolsDb();
});

afterAll(() => {
  delete process.env.SCHOOLS_CONTEXT_PATH;
  resetSchoolsDb();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("getSchoolsSignal", () => {
  it("returns a scored amenity signal for a covered postcode", () => {
    const s = getSchoolsSignal("se15 4an");
    expect(s.available).toBe(true);
    expect(s.key).toBe("schools");
    expect(s.direction).toBe("amenity");
    expect(s.score).toBe(12.5);
    expect(s.facts.nearest_good_primary_m).toBe(320);
    expect(s.facts.nearest_good_secondary_m).toBe(640);
    expect(s.facts.good_primaries_within_1km).toBe(2);
    expect(s.facts.nearest_good_primary_name).toBe("Test Primary");
    expect(s.headline).toContain("320 m");
    expect(s.headline).toContain("Test Secondary");
    expect(s.asof).toBe("2026-10-31");
  });

  it("scores worse access higher", () => {
    const worse = getSchoolsSignal("E14 9AF");
    expect(worse.available).toBe(true);
    expect(worse.score).toBe(87.5);
    expect(worse.facts.good_primaries_within_1km).toBe(0);
  });

  it("marks invalid and uncovered postcodes unavailable without throwing", () => {
    expect(getSchoolsSignal("not a postcode!!!").available).toBe(false);
    expect(getSchoolsSignal("not a postcode!!!").score).toBeNull();
    expect(getSchoolsSignal("AB1 2CD").available).toBe(false);
  });

  it("returns unavailable (never throws) when the data file is missing", () => {
    process.env.SCHOOLS_CONTEXT_PATH = path.join(dir, "missing.db");
    resetSchoolsDb();
    const s = getSchoolsSignal("SE15 4AN");
    expect(s.available).toBe(false);
    expect(s.score).toBeNull();
    process.env.SCHOOLS_CONTEXT_PATH = fixture;
    resetSchoolsDb();
  });
});
