import { describe, expect, it } from "vitest";
import { CloudMoon, CloudSun, Moon, Sun } from "lucide-react";
import { UNKNOWN_CONDITION, WMO_CONDITIONS, weatherCondition } from "./weather-codes";
import { compassName, formatForecastDate, formatTemperature, formatWindSpeed } from "./units";

// All codes Open-Meteo documents for weather_code (https://open-meteo.com/en/docs, "WMO Weather interpretation codes").
const DOCUMENTED_WMO_CODES = [
  0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99,
];

describe("WMO → icon mapping", () => {
  it("covers every documented code with a label and day/night icons", () => {
    for (const code of DOCUMENTED_WMO_CODES) {
      const condition = WMO_CONDITIONS[code];
      expect(condition, `code ${code}`).toBeDefined();
      expect(condition.label.length).toBeGreaterThan(0);
      expect(condition.day).toBeTruthy();
      expect(condition.night).toBeTruthy();
    }
    expect(Object.keys(WMO_CONDITIONS).map(Number).sort((a, b) => a - b)).toEqual(DOCUMENTED_WMO_CODES);
  });

  it("uses day and night variants where the sky shows", () => {
    expect(weatherCondition(0, true).Icon).toBe(Sun);
    expect(weatherCondition(0, false).Icon).toBe(Moon);
    expect(weatherCondition(2, true).Icon).toBe(CloudSun);
    expect(weatherCondition(2, false).Icon).toBe(CloudMoon);
    expect(weatherCondition(63, true).label).toBe("Rain");
  });

  it("falls back for unknown codes", () => {
    expect(weatherCondition(42, true)).toEqual({ label: UNKNOWN_CONDITION.label, Icon: UNKNOWN_CONDITION.day });
  });
});

describe("units", () => {
  it("formats temperature", () => {
    expect(formatTemperature(14.4, "c")).toBe("14°C");
    expect(formatTemperature(14.4, "f")).toBe("58°F");
    expect(formatTemperature(-0.4, "c")).toBe("0°C");
  });

  it("formats wind speed", () => {
    expect(formatWindSpeed(26.6, "kmh")).toBe("27 km/h");
    expect(formatWindSpeed(26.6, "mph")).toBe("17 mph");
  });

  it("names wind directions", () => {
    expect(compassName(0)).toBe("north");
    expect(compassName(222)).toBe("south-west");
    expect(compassName(359)).toBe("north");
    expect(compassName(-45)).toBe("north-west");
  });

  it("formats the not-yet date in the viewer's time zone", () => {
    expect(formatForecastDate("2026-10-11T23:30:00Z", "Europe/London")).toBe("12 Oct");
    expect(formatForecastDate("2026-10-11T23:30:00Z", "America/New_York")).toBe("11 Oct");
    expect(formatForecastDate("2026-10-11T23:30:00Z", "Not/AZone")).toBe("11 Oct");
  });
});
