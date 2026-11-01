import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { getFloodSignal, resetFloodDbForTest } from "./flood";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "flood-test-"));
const dbPath = path.join(tmp, "flood.db");

function makeDb(): void {
  const d = new Database(dbPath);
  d.exec("CREATE TABLE flood(postcode TEXT PRIMARY KEY, zone INTEGER, score INTEGER)");
  d.exec(
    "INSERT INTO flood VALUES ('SE15 4AN', 2, 55), ('E14 9AF', 3, 90), ('NW3 1QE', 1, 5), ('TW9 1EX', NULL, NULL)"
  );
  d.close();
}

makeDb();
process.env.FLOOD_DB_PATH = dbPath;

afterAll(() => {
  resetFloodDbForTest();
  delete process.env.FLOOD_DB_PATH;
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("getFloodSignal", () => {
  it("returns zone, score and facts for a known postcode", () => {
    const s = getFloodSignal("E14 9AF");
    expect(s.available).toBe(true);
    expect(s.score).toBe(90);
    expect(s.key).toBe("flood");
    expect(s.direction).toBe("risk");
    expect(s.facts.floodZone).toBe(3);
    expect(s.headline).toContain("E14 9AF");
  });

  it("normalises lowercase postcodes", () => {
    expect(getFloodSignal("se15 4an").score).toBe(55);
  });

  it("marks invalid postcodes unavailable without throwing", () => {
    const s = getFloodSignal("not-a-postcode");
    expect(s.available).toBe(false);
    expect(s.score).toBeNull();
  });

  it("marks postcodes with no coordinates unavailable without throwing", () => {
    const s = getFloodSignal("TW9 1EX");
    expect(s.available).toBe(false);
    expect(s.score).toBeNull();
  });

  it("marks postcodes outside the db unavailable without throwing", () => {
    const s = getFloodSignal("AB12 3CD");
    expect(s.available).toBe(false);
    expect(s.score).toBeNull();
  });

  it("returns unavailable when the data file is missing", () => {
    process.env.FLOOD_DB_PATH = path.join(tmp, "missing.db");
    resetFloodDbForTest();
    const s = getFloodSignal("E14 9AF");
    expect(s.available).toBe(false);
    expect(s.score).toBeNull();
    process.env.FLOOD_DB_PATH = dbPath;
    resetFloodDbForTest();
  });
});
