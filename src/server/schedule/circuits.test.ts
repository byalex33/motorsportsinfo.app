import { describe, expect, it } from "vitest";
import { CIRCUITS, circuitCountry, getCircuit, matchCircuit, nearestCircuit } from "@/data/circuits";

describe("circuits", () => {
  it("derives time zones from lat/lon", () => {
    expect(getCircuit("baku")?.timeZone).toBe("Asia/Baku");
    expect(getCircuit("las-vegas")?.timeZone).toBe("America/Los_Angeles");
    expect(getCircuit("sepang")?.timeZone).toBe("Asia/Kuala_Lumpur");
    expect(getCircuit("spa-francorchamps")?.timeZone).toBe("Europe/Brussels");
    expect(getCircuit("interlagos")?.timeZone).toBe("America/Sao_Paulo");
    for (const c of CIRCUITS) expect(c.timeZone, c.id).toMatch(/^[A-Za-z_]+\/[A-Za-z_]+/);
  });

  it("derives time zones for the FE, IndyCar and MotoGP Circuits", () => {
    expect(getCircuit("indianapolis")?.timeZone).toBe("America/Indiana/Indianapolis");
    expect(getCircuit("phoenix")?.timeZone).toBe("America/Phoenix");
    expect(getCircuit("markham")?.timeZone).toBe("America/Toronto");
    expect(getCircuit("arlington")?.timeZone).toBe("America/Chicago");
    expect(getCircuit("mandalika")?.timeZone).toBe("Asia/Makassar");
    expect(getCircuit("sanya")?.timeZone).toBe("Asia/Shanghai");
    expect(getCircuit("excel-london")?.timeZone).toBe("Europe/London");
  });

  it("has radar coverage everywhere except Baku and Mandalika", () => {
    // Checked against RainViewer's coverage tiles (tilecache.rainviewer.com/v2/coverage) in October 2026.
    expect(CIRCUITS.filter((c) => !c.hasRadarCoverage).map((c) => c.id)).toEqual(["baku", "mandalika"]);
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
    expect(matchCircuit(["Sao Paulo", "sao-paulo-eprix"])?.id).toBe("sao-paulo-street"); // FE sportstimes
    expect(matchCircuit(["Sao Paulo"])?.id).toBe("interlagos");
    expect(matchCircuit(["Jarama", "madrid-eprix"])?.id).toBe("jarama");
    expect(matchCircuit(["Miami IA"])?.id).toBe("miami");
    expect(matchCircuit(["Honda Indy 200 at Mid-Ohio"])?.id).toBe("mid-ohio");
    expect(matchCircuit(["Children's of Alabama Indy Grand Prix"])?.id).toBe("barber"); // not "Indy" → Indianapolis
    expect(matchCircuit(["Le Mans"])?.id).toBe("le-mans"); // MotoGP `track`
  });

  it("finds the nearest Circuit by coordinates", () => {
    expect(nearestCircuit(52.0692786, -1.0213986)).toMatchObject({ circuit: { id: "silverstone" } });
    expect(nearestCircuit(52.0692786, -1.0213986)!.km).toBeLessThan(2);
    expect(circuitCountry(getCircuit("brno")!)).toBe("Czechia");
  });

  it("never guesses: unknown names return null", () => {
    expect(matchCircuit(["Bahrain Grand Prix"])).toBeNull();
    expect(matchCircuit(["Spanish Grand Prix"])).toBeNull();
    expect(matchCircuit(["Nowhere Street Circuit", null, ""])).toBeNull();
  });
});
