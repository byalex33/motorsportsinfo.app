import { describe, expect, it } from "vitest";
import { CIRCUITS, getCircuit, matchCircuit } from "@/data/circuits";

describe("circuits", () => {
  it("derives time zones from lat/lon", () => {
    expect(getCircuit("baku")?.timeZone).toBe("Asia/Baku");
    expect(getCircuit("las-vegas")?.timeZone).toBe("America/Los_Angeles");
    expect(getCircuit("sepang")?.timeZone).toBe("Asia/Kuala_Lumpur");
    expect(getCircuit("spa-francorchamps")?.timeZone).toBe("Europe/Brussels");
    expect(getCircuit("interlagos")?.timeZone).toBe("America/Sao_Paulo");
    for (const c of CIRCUITS) expect(c.timeZone, c.id).toMatch(/^[A-Za-z_]+\/[A-Za-z_]+/);
  });

  it("has radar coverage everywhere except Baku", () => {
    expect(CIRCUITS.filter((c) => !c.hasRadarCoverage).map((c) => c.id)).toEqual(["baku"]);
  });

  it("has unique ids and 'City, Country' locations", () => {
    expect(new Set(CIRCUITS.map((c) => c.id)).size).toBe(CIRCUITS.length);
    for (const c of CIRCUITS) expect(c.location, c.id).toMatch(/^[^,]+, [^,]+$/);
  });

  it("matches each source's naming", () => {
    expect(matchCircuit(["Kuala Lumpur", "Kuala Lumpur"])?.id).toBe("sepang"); // OpenF1, 2026 "Bahrain Grand Prix"
    expect(matchCircuit(["Sakhir", "Bahrain"])?.id).toBe("sakhir");
    expect(matchCircuit(["Montréal"])?.id).toBe("montreal");
    expect(matchCircuit(["yas_marina"])?.id).toBe("yas-marina"); // Jolpica circuitId
    expect(matchCircuit(["miami-gardens"])?.id).toBe("miami"); // F2 page slug
    expect(matchCircuit(["Doha"])?.id).toBe("lusail"); // sportstimes
    expect(matchCircuit(["Lone Star Le Mans"])?.id).toBe("cota"); // longest alias beats "Le Mans"
    expect(matchCircuit(["24 Hours of Le Mans"])?.id).toBe("le-mans");
    expect(matchCircuit(["ROLEX 6 Hours of São Paulo"])?.id).toBe("interlagos");
    expect(matchCircuit(["Bapco Energies 8 Hours of Bahrain"])?.id).toBe("sakhir");
    expect(matchCircuit(["6 Hours of Barcelona"])?.id).toBe("catalunya");
  });

  it("never guesses: unknown names return null", () => {
    expect(matchCircuit(["Bahrain Grand Prix"])).toBeNull();
    expect(matchCircuit(["Spanish Grand Prix"])).toBeNull();
    expect(matchCircuit(["Nowhere Street Circuit", null, ""])).toBeNull();
  });
});
