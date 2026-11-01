import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { chatJSON, DailyCapError } from "./meta";
import {
  getAreaComps,
  normalisePostcode,
  pricePercentile,
  type CompType,
} from "./street";

export const SQFT_TO_SQM = 0.09290304;
export const MIN_SQM = 15; // matches fairRange(): below this no fair range is produced
export const MAX_SQM = 1000;

/** What the model returns: area is as printed, with its unit. Code does the conversion. */
export const RawExtractionSchema = z.object({
  price: z.number().nullable(),
  floor_area: z.number().nullable(),
  floor_area_unit: z.enum(["sqm", "sqft"]).nullable(),
  postcode: z.string().nullable(),
  property_type: z.enum(["flat", "house"]).nullable(),
  bedrooms: z.number().nullable(),
});
export type RawExtraction = z.infer<typeof RawExtractionSchema>;

export interface ListingFields {
  price: number | null;
  sqm: number | null;
  postcode: string | null;
  type: CompType | null;
  bedrooms: number | null;
}

export interface Extraction {
  fields: ListingFields;
  /** Floor area as printed in the listing, kept so the UI can show the conversion. */
  areaAsPrinted: { value: number; unit: "sqm" | "sqft" } | null;
  warnings: string[];
  /** True when the model call failed or returned unusable JSON twice. */
  failed: boolean;
}

export const EMPTY_FIELDS: ListingFields = {
  price: null,
  sqm: null,
  postcode: null,
  type: null,
  bedrooms: null,
};

/** Pure: sq ft to sq m, one decimal. */
export function sqftToSqm(sqft: number): number {
  return Math.round(sqft * SQFT_TO_SQM * 10) / 10;
}

function numbersIn(text: string): number[] {
  return (text.match(/\d[\d,]*(?:\.\d+)?/g) ?? [])
    .map((t) => parseFloat(t.replace(/,/g, "")))
    .filter((n) => Number.isFinite(n));
}

/**
 * Pure: turn the model's raw output into checked fields.
 * For text-only input, a floor area or postcode that does not literally appear in the
 * text is dropped (the model must not guess). With an image the text check is skipped.
 */
export function normaliseExtraction(
  raw: RawExtraction,
  text: string,
  hasImage = false,
): Extraction {
  const warnings: string[] = [];
  const fields: ListingFields = { ...EMPTY_FIELDS };
  let areaAsPrinted: Extraction["areaAsPrinted"] = null;

  if (raw.price != null) {
    if (Number.isFinite(raw.price) && raw.price >= 10_000 && raw.price <= 100_000_000)
      fields.price = Math.round(raw.price);
    else warnings.push("Price looked implausible for a sale, so it was left blank.");
  } else warnings.push("No sale price found in the listing.");

  if (raw.floor_area != null && raw.floor_area_unit != null) {
    const inText = numbersIn(text).some((n) => Math.abs(n - raw.floor_area!) < 0.05);
    if (!hasImage && !inText) {
      warnings.push(
        `Floor area ${raw.floor_area} is not in the pasted text, so it was dropped rather than guessed.`,
      );
    } else {
      const sqm =
        raw.floor_area_unit === "sqft" ? sqftToSqm(raw.floor_area) : Math.round(raw.floor_area * 10) / 10;
      if (sqm >= MIN_SQM && sqm <= MAX_SQM) {
        fields.sqm = sqm;
        areaAsPrinted = { value: raw.floor_area, unit: raw.floor_area_unit };
      } else warnings.push(`Floor area of ${sqm} sq m is outside ${MIN_SQM}–${MAX_SQM} sq m, so it was left blank.`);
    }
  }
  if (fields.sqm == null && !warnings.some((w) => w.startsWith("Floor area")))
    warnings.push("No floor area found, so the verdict will not be size-adjusted.");

  if (raw.postcode != null) {
    const pc = normalisePostcode(raw.postcode);
    const compactText = text.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!pc) warnings.push(`"${raw.postcode}" is not a valid full UK postcode.`);
    else if (!hasImage && !compactText.includes(pc.replace(" ", "")))
      warnings.push(`Postcode ${pc} is not in the pasted text, so it was dropped rather than guessed.`);
    else fields.postcode = pc;
  } else warnings.push("No full postcode found (a partial postcode such as SE15 is not enough).");

  fields.type = raw.property_type;
  if (!fields.type) warnings.push("Property type unclear: choose flat or house.");
  if (raw.bedrooms != null && Number.isInteger(raw.bedrooms) && raw.bedrooms >= 0 && raw.bedrooms <= 20)
    fields.bedrooms = raw.bedrooms;

  return { fields, areaAsPrinted, warnings, failed: false };
}

/**
 * Muse Spark extraction. Text only unless an image data URL is given. Never throws:
 * on model failure returns empty fields and a warning so the user can type them in.
 */
export async function extractListing(
  text: string,
  opts: { image?: string | null; fixture?: string } = {},
): Promise<Extraction> {
  const system = await fs.readFile(path.join(process.cwd(), "prompts", "listing.md"), "utf8");
  const hasImage = !!opts.image;
  try {
    const raw = await chatJSON(
      `Listing text:\n"""\n${text}\n"""${hasImage ? "\nA floorplan image is attached." : ""}`,
      RawExtractionSchema,
      {
        system,
        effort: "low",
        fixture: opts.fixture ?? "listing",
        ...(hasImage ? { images: [opts.image!] } : {}),
      },
    );
    return normaliseExtraction(raw, text, hasImage);
  } catch (e) {
    if (e instanceof DailyCapError) throw e;
    return {
      fields: { ...EMPTY_FIELDS },
      areaAsPrinted: null,
      warnings: ["The model did not return usable fields. Enter them below."],
      failed: true,
    };
  }
}

export interface ListingVerdict {
  status: "ok" | "no_postcode" | "invalid_postcode" | "not_found";
  mode: "size_adjusted" | "unadjusted" | null;
  /** Why the verdict is not size-adjusted (empty when it is). */
  reasons: string[];
  postcode: string | null;
  type: CompType | null;
  price: number | null;
  sqm: number | null;
  askingPpsm: number | null;
  /** Size-adjusted fair range (only when mode = size_adjusted). */
  fair: {
    low: number;
    mid: number;
    high: number;
    sqm: number;
    ppsmLevel: string;
    ppsmName: string;
    ppsmN: number;
    ppsmMedian: number | null;
  } | null;
  /** Unadjusted comparables at the chosen ladder level. */
  area: {
    level: string;
    name: string;
    n: number;
    median: number | null;
    p25: number | null;
    p75: number | null;
  } | null;
  /** Where the asking price sits against the range used (adjusted if available, else unadjusted). */
  position: "below" | "within" | "above" | null;
  /** % of recent comparable sales strictly below the asking price. */
  percentile: number | null;
  compPrices: number[];
  asof: string | null;
  link: string | null;
}

function blank(
  fields: ListingFields,
  status: ListingVerdict["status"],
  reason: string,
): ListingVerdict {
  return {
    status,
    mode: null,
    reasons: [reason],
    postcode: fields.postcode,
    type: fields.type,
    price: fields.price,
    sqm: fields.sqm,
    askingPpsm: null,
    fair: null,
    area: null,
    position: null,
    percentile: null,
    compPrices: [],
    asof: null,
    link: null,
  };
}

function rangePosition(price: number, low: number, high: number): "below" | "within" | "above" {
  return price < low ? "below" : price > high ? "above" : "within";
}

/** Runs the existing comps / fair-range logic on checked fields. Pure apart from the street DB read. */
export function checkListing(fields: ListingFields): ListingVerdict {
  if (!fields.postcode) return blank(fields, "no_postcode", "No postcode, so no comparables can be found.");
  const pc = normalisePostcode(fields.postcode);
  if (!pc) return blank(fields, "invalid_postcode", `"${fields.postcode}" is not a valid full UK postcode.`);
  const r = getAreaComps(pc, fields.type, fields.sqm);
  if ("error" in r) {
    return blank(
      { ...fields, postcode: pc },
      r.error === "invalid" ? "invalid_postcode" : "not_found",
      r.error === "invalid" ? `"${pc}" is not a valid postcode.` : `${pc} is not in the London sales data.`,
    );
  }

  const compPrices = r.comps.map((c) => c.price);
  const fair = r.ppsm?.fairRange ?? null;
  const reasons: string[] = [];
  if (!fair) {
    if (fields.sqm == null) reasons.push("No floor area in the listing, so comparables are not size-adjusted.");
    else if (!fields.type) reasons.push("Property type unknown, so no size-adjusted range. Choose flat or house.");
    else if (!r.ppsm) reasons.push(`Not enough size-matched sales near ${pc} for a £/sq m range.`);
    else reasons.push("Size-adjusted range unavailable for this area and type.");
  }

  const price = fields.price;
  let position: ListingVerdict["position"] = null;
  if (price != null) {
    if (fair) position = rangePosition(price, fair.low, fair.high);
    else if (r.chosenP25 != null && r.chosenP75 != null)
      position = rangePosition(price, r.chosenP25, r.chosenP75);
  }

  const q = new URLSearchParams();
  if (fields.type) q.set("type", fields.type);
  if (fields.sqm != null) q.set("sqm", String(fields.sqm));
  if (price != null) q.set("price", String(price));

  return {
    status: "ok",
    mode: fair ? "size_adjusted" : "unadjusted",
    reasons,
    postcode: pc,
    type: fields.type,
    price,
    sqm: fields.sqm,
    askingPpsm: price != null && fields.sqm ? Math.round(price / fields.sqm) : null,
    fair: fair && r.ppsm
      ? {
          low: fair.low,
          mid: fair.mid,
          high: fair.high,
          sqm: fair.sqm,
          ppsmLevel: r.ppsm.level,
          ppsmName: r.ppsm.name,
          ppsmN: r.ppsm.n,
          ppsmMedian: r.ppsm.median != null ? Math.round(r.ppsm.median) : null,
        }
      : null,
    area: {
      level: r.chosenLevel,
      name: r.chosenName,
      n: r.chosenN,
      median: r.chosenMedian,
      p25: r.chosenP25,
      p75: r.chosenP75,
    },
    position,
    percentile: price != null ? pricePercentile(price, compPrices) : null,
    compPrices,
    asof: r.asof,
    link: `/area/${encodeURIComponent(pc)}${q.size ? `?${q}` : ""}`,
  };
}
