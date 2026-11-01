import { describe, expect, it } from "vitest";
import {
  checkListing,
  extractListing,
  normaliseExtraction,
  sqftToSqm,
  type ListingFields,
} from "./listing";

const TEXT_SQM =
  "Two bedroom flat, Copleston Road, SE15 4AN. Guide price £650,000. Internal area 70 sq m. Chain free.";
const TEXT_SQFT =
  "Two bedroom flat, Copleston Road, SE15 4AN. Guide price £650,000. Internal area 753 sq ft.";
const TEXT_NOAREA = "Two bedroom flat, Copleston Road, SE15 4AN. Guide price £650,000. Chain free.";

describe("listing extraction (mock)", () => {
  it("extracts all five fields", async () => {
    const e = await extractListing(TEXT_SQM);
    expect(e.failed).toBe(false);
    expect(e.fields).toEqual({ price: 650000, sqm: 70, postcode: "SE15 4AN", type: "flat", bedrooms: 2 });
  });

  it("converts sq ft to sq m in code", async () => {
    const e = await extractListing(TEXT_SQFT, { fixture: "listing-sqft" });
    expect(e.fields.sqm).toBe(70); // 753 x 0.09290304 = 69.96
    expect(e.areaAsPrinted).toEqual({ value: 753, unit: "sqft" });
    expect(sqftToSqm(1000)).toBe(92.9);
  });

  it("leaves floor area null when the listing has none", async () => {
    const e = await extractListing(TEXT_NOAREA, { fixture: "listing-nosqm" });
    expect(e.fields.sqm).toBeNull();
    expect(e.warnings.join(" ")).toMatch(/No floor area/);
  });

  it("drops a floor area the text does not contain", async () => {
    const e = await extractListing(TEXT_NOAREA, { fixture: "listing-guess" });
    expect(e.fields.sqm).toBeNull();
    expect(e.warnings.join(" ")).toMatch(/dropped rather than guessed/);
  });

  it("nulls an invalid postcode", async () => {
    const e = await extractListing("Flat, SE15 4A. £650,000. 70 sq m.", { fixture: "listing-badpc" });
    expect(e.fields.postcode).toBeNull();
    expect(e.warnings.join(" ")).toMatch(/not a valid full UK postcode/);
  });

  it("falls back to empty fields when the fixture is unusable", async () => {
    const e = await extractListing("x", { fixture: "chat" });
    expect(e.failed).toBe(true);
    expect(e.fields.price).toBeNull();
  });
});

describe("normaliseExtraction", () => {
  it("skips the text check when an image is attached", () => {
    const e = normaliseExtraction(
      { price: 650000, floor_area: 70, floor_area_unit: "sqm", postcode: "SE15 4AN", property_type: "flat", bedrooms: 2 },
      "no figures here",
      true,
    );
    expect(e.fields.sqm).toBe(70);
  });

  it("rejects implausible areas and prices", () => {
    const e = normaliseExtraction(
      { price: 650, floor_area: 5, floor_area_unit: "sqm", postcode: null, property_type: null, bedrooms: null },
      "5 sq m £650",
    );
    expect(e.fields.price).toBeNull();
    expect(e.fields.sqm).toBeNull();
  });
});

describe("checkListing", () => {
  const base: ListingFields = { price: 650000, sqm: 70, postcode: "SE15 4AN", type: "flat", bedrooms: 2 };

  it("gives a size-adjusted verdict for SE15 4AN, 70 sq m, £650,000", () => {
    const v = checkListing(base);
    expect(v.status).toBe("ok");
    expect(v.mode).toBe("size_adjusted");
    expect(v.fair?.sqm).toBe(70);
    expect(v.fair!.low).toBeLessThan(v.fair!.high);
    expect(v.position).toBe("within");
    expect(v.askingPpsm).toBe(9286);
    expect(v.link).toContain("/area/SE15%204AN?type=flat&sqm=70&price=650000");
  });

  it("falls back to unadjusted comps when sq m is missing, and says so", () => {
    const v = checkListing({ ...base, sqm: null });
    expect(v.mode).toBe("unadjusted");
    expect(v.fair).toBeNull();
    expect(v.reasons.join(" ")).toMatch(/not size-adjusted/);
    expect(v.area?.median).not.toBeNull();
  });

  it("handles missing and invalid postcodes", () => {
    expect(checkListing({ ...base, postcode: null }).status).toBe("no_postcode");
    expect(checkListing({ ...base, postcode: "SE15 4A" }).status).toBe("invalid_postcode");
  });
});
