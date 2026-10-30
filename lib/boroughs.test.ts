import { describe, expect, it } from "vitest";
import { normaliseBoroughCode } from "./boroughs";

describe("normaliseBoroughCode", () => {
  it("maps City of London", () => {
    expect(normaliseBoroughCode("City of London")).toBe("E09000001");
  });
  it("maps Kingston upon Thames", () => {
    expect(normaliseBoroughCode("Kingston upon Thames")).toBe("E09000021");
  });
  it("maps Richmond upon Thames", () => {
    expect(normaliseBoroughCode("Richmond upon Thames")).toBe("E09000027");
  });
  it("maps Hammersmith and Fulham and the & variant", () => {
    expect(normaliseBoroughCode("Hammersmith and Fulham")).toBe("E09000013");
    expect(normaliseBoroughCode("Hammersmith & Fulham")).toBe("E09000013");
  });
  it("is case/space-insensitive", () => {
    expect(normaliseBoroughCode("  BARNET ")).toBe("E09000003");
  });
  it("returns null for unknown names", () => {
    expect(normaliseBoroughCode("Manchester")).toBeNull();
    expect(normaliseBoroughCode("")).toBeNull();
  });
});
