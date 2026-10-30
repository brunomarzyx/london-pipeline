import { afterEach, beforeAll, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  getAreaComps,
  getStreetsInBorough,
  normalisePostcode,
  pricePercentile,
  resetStreetDb,
} from "./street";

const REAL = path.join(process.cwd(), "data", "street.db");
let fixturePath = "";

function buildFixture(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "street-"));
  const p = path.join(dir, "street.db");
  const d = new Database(p);
  d.exec(`CREATE TABLE meta(key TEXT, value TEXT);
    CREATE TABLE postcodes(postcode TEXT, sector TEXT, lsoa TEXT, msoa TEXT, lad TEXT, lat REAL, lon REAL, street_key TEXT);
    CREATE INDEX ix_pc ON postcodes(postcode);
    CREATE TABLE area_stats(level TEXT, code TEXT, name TEXT, lad TEXT, lad_nm TEXT, n_36m INTEGER, med_36m REAL, p25_36m REAL, p75_36m REAL, n_flat INTEGER, med_flat REAL, n_house INTEGER, med_house REAL, n_12m INTEGER, n_prev12 INTEGER, lat REAL, lon REAL, reliable INTEGER, rs_pairs REAL, rs_chg_1y REAL, rs_chg_5y REAL);
    CREATE INDEX ix_area ON area_stats(level, code);
    CREATE TABLE sales(txn_id TEXT, date TEXT, price INTEGER, postcode TEXT, type TEXT, new_build INTEGER, tenure TEXT, address TEXT, street_key TEXT, sector TEXT, lsoa TEXT, msoa TEXT, lad TEXT, lat REAL, lon REAL);
    CREATE INDEX ix_sales_sector ON sales(sector, date);
    CREATE INDEX ix_sales_street ON sales(street_key);
    CREATE INDEX ix_sales_pc ON sales(postcode);`);
  d.exec(`INSERT INTO meta VALUES ('asof','2026-09-30'),('level_months','36'),('min_n','10'),('min_pairs','60'),('source','test fixture');`);
  // Thin street (n_flat=2 < 10) → falls back to sector (n_flat=50).
  d.exec(`INSERT INTO postcodes VALUES ('AB1 2CD','AB1 2','E01000001','E02000001','E09000001',51.5,-0.1,'AB1|THIN STREET');`);
  d.exec(`INSERT INTO area_stats VALUES
    ('street','AB1|THIN STREET','Thin Street, AB1','E09000001','City',5,500000,400000,600000,2,450000,3,550000,1,1,51.5,-0.1,0,NULL,NULL,NULL),
    ('sector','AB1 2','AB1 2','E09000001','City',60,520000,420000,620000,50,480000,10,600000,20,18,51.5,-0.1,1,NULL,NULL,NULL),
    ('lsoa','E01000001','LSOA 1','E09000001','City',30,510000,410000,610000,20,470000,10,590000,9,8,51.5,-0.1,1,NULL,NULL,NULL),
    ('msoa','E02000001','MSOA 1','E09000001','City',90,530000,430000,630000,60,490000,30,610000,30,28,51.5,-0.1,1,70,0.05,0.12),
    ('borough','E09000001','City of London','E09000001','City',200,540000,440000,640000,120,500000,80,620000,70,65,51.5,-0.1,1,500,-0.01,0.03);`);
  const ins = d.prepare(
    "INSERT INTO sales VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
  );
  for (let i = 0; i < 50; i++) {
    ins.run(
      `txn-${i}`, `2026-09-${String((i % 28) + 1).padStart(2, "0")}`,
      400000 + i * 5000, "AB1 2CD", "F", 0, "L", `Flat ${i}, Thin Street`,
      "AB1|THIN STREET", "AB1 2", "E01000001", "E02000001", "E09000001", 51.5, -0.1,
    );
  }
  d.close();
  return p;
}

beforeAll(() => {
  fixturePath = buildFixture();
  process.env.STREET_DB_PATH = fixturePath;
  resetStreetDb();
});

afterEach(() => {
  process.env.STREET_DB_PATH = fixturePath;
  resetStreetDb();
});

describe("normalisePostcode", () => {
  it("adds the space and uppercases", () => {
    expect(normalisePostcode("se155ab")).toBe("SE15 5AB");
    expect(normalisePostcode("SE15 5AB")).toBe("SE15 5AB");
    expect(normalisePostcode(" e14 9af ")).toBe("E14 9AF");
  });
  it("rejects invalid formats", () => {
    expect(normalisePostcode("hello")).toBeNull();
    expect(normalisePostcode("SE15")).toBeNull();
    expect(normalisePostcode("")).toBeNull();
    expect(normalisePostcode("12345")).toBeNull();
  });
});

describe("getAreaComps (fixture)", () => {
  it("walks past a thin street to the sector", () => {
    const r = getAreaComps("AB1 2CD", "flat");
    expect("error" in r).toBe(false);
    if ("error" in r) return;
    expect(r.chosenLevel).toBe("sector");
    expect(r.chosenN).toBe(50);
    expect(r.chosenMedian).toBe(480000);
    expect(r.ladder.map((l) => l.level)).toEqual([
      "street",
      "sector",
      "lsoa",
      "msoa",
      "borough",
    ]);
    expect(r.ladder[0].n).toBe(2);
    expect(r.comps.length).toBeGreaterThan(0);
    expect(r.comps.length).toBeLessThanOrEqual(12);
    expect(r.asof).toBe("2026-09-30");
  });
  it("uses n_flat/n_house when a type is given", () => {
    const flat = getAreaComps("AB1 2CD", "flat");
    const house = getAreaComps("AB1 2CD", "house");
    if ("error" in flat || "error" in house) throw new Error("unexpected error");
    // House: street n_house=3 < 10, sector n_house=10 ≥ 10 → sector with house median.
    expect(house.chosenLevel).toBe("sector");
    expect(house.chosenN).toBe(10);
    expect(house.chosenMedian).toBe(600000);
    // No type: street n_36m=5 < 10 → sector n_36m=60, median med_36m.
    const all = getAreaComps("AB1 2CD");
    if ("error" in all) throw new Error("unexpected error");
    expect(all.chosenLevel).toBe("sector");
    expect(all.chosenN).toBe(60);
    expect(all.chosenMedian).toBe(520000);
  });
  it("takes momentum from the msoa repeat-sales index", () => {
    const r = getAreaComps("AB1 2CD", "flat");
    if ("error" in r) throw new Error("unexpected error");
    expect(r.momentum).toEqual({ chg1y: 0.05, chg5y: 0.12, from: "MSOA" });
  });
  it("returns invalid / not_found errors", () => {
    expect(getAreaComps("hello")).toEqual({ error: "invalid" });
    expect(getAreaComps("XX1 1XX")).toEqual({ error: "not_found" });
  });
});

describe("pricePercentile", () => {
  it("is the share of comps strictly below the price", () => {
    expect(pricePercentile(650000, [500000, 600000, 700000, 800000])).toBe(50);
    expect(pricePercentile(900000, [500000, 600000])).toBe(100);
    expect(pricePercentile(100000, [500000, 600000])).toBe(0);
    expect(pricePercentile(600000, [600000, 600000])).toBe(0);
  });
  it("is null when there are no comps", () => {
    expect(pricePercentile(650000, [])).toBeNull();
  });
});

describe("missing street.db", () => {
  it("hides gracefully", () => {
    process.env.STREET_DB_PATH = path.join(os.tmpdir(), "no-such-street.db");
    resetStreetDb();
    expect(getAreaComps("E14 9AF")).toEqual({ error: "not_found" });
    expect(getStreetsInBorough("E09000030")).toEqual([]);
  });
});

describe("real street.db (when present)", () => {
  it("finds E14 9AF at street level for flats", () => {
    if (!fs.existsSync(REAL)) return;
    process.env.STREET_DB_PATH = REAL;
    resetStreetDb();
    const r = getAreaComps("E14 9AF", "flat");
    if ("error" in r) throw new Error("E14 9AF should exist");
    expect(r.chosenLevel).toBe("street");
    expect(r.chosenN).toBeGreaterThanOrEqual(10);
    expect(r.chosenMedian).not.toBeNull();
  });
});
