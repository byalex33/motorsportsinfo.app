import { describe, expect, it } from "vitest";
import { CIRCUITS, getCircuit } from "@/data/circuits";
import { circuitCountryCode } from "./country-code";

describe("circuitCountryCode", () => {
  it("resolves every Circuit's country", () => {
    const missing = CIRCUITS.filter((c) => circuitCountryCode(c) === null).map((c) => c.location);
    expect(missing).toEqual([]);
  });

  it("maps a location's country to its ISO code", () => {
    expect(circuitCountryCode(getCircuit("albert-park")!)).toBe("AU");
    expect(circuitCountryCode({ ...getCircuit("albert-park")!, location: "Somewhere, Atlantis" })).toBeNull();
  });
});
