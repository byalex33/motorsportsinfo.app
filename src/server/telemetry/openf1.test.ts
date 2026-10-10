import { describe, expect, it } from "vitest";
import type { TelemetryLap } from "@/domain/types";
import { fastestLap, parseSessionTelemetry, type OpenF1Lap, type OpenF1TelemetryDriver } from "./openf1";

function lap(driver_number: number, lap_number: number, lap_duration: number | null, extra: Partial<OpenF1Lap> = {}): OpenF1Lap {
  return {
    driver_number,
    lap_number,
    date_start: `2026-10-09T13:${String(10 + lap_number).padStart(2, "0")}:00+00:00`,
    lap_duration,
    duration_sector_1: 26.8,
    duration_sector_2: 38.6,
    duration_sector_3: 25.7,
    i1_speed: 308,
    i2_speed: 285,
    st_speed: 305,
    is_pit_out_lap: false,
    ...extra,
  };
}

const driver = (driver_number: number, name_acronym: string, first_name: string, last_name: string): OpenF1TelemetryDriver => ({
  driver_number,
  name_acronym,
  first_name,
  last_name,
  full_name: `${first_name} ${last_name.toUpperCase()}`,
  team_name: "Team",
  team_colour: driver_number === 44 ? null : "4781D7",
});

describe("parseSessionTelemetry", () => {
  it("orders drivers by classification and groups each driver's laps in order", () => {
    const t = parseSessionTelemetry(
      [lap(63, 2, 91.3), lap(3, 2, 91.2), lap(63, 1, null, { is_pit_out_lap: true }), lap(3, 1, null)],
      [driver(63, "RUS", "George", "Russell"), driver(3, "VER", "Max", "Verstappen"), driver(3, "VER", "Max", "Verstappen"), driver(44, "HAM", "Lewis", "Hamilton")],
      [
        { driver_number: 3, position: 1 },
        { driver_number: 63, position: 2 },
        { driver_number: 44, position: "RT" },
      ],
    );
    expect(t.drivers.map((d) => [d.code, d.position, d.name])).toEqual([
      ["VER", 1, "Max Verstappen"],
      ["RUS", 2, "George Russell"],
      ["HAM", null, "Lewis Hamilton"],
    ]);
    expect(t.drivers.map((d) => d.color)).toEqual(["#4781D7", "#4781D7", null]);
    expect(t.laps[63].map((l) => l.lap)).toEqual([1, 2]);
    expect(t.laps[63][0]).toMatchObject({ pitOut: true, time: null });
    expect(t.laps[3][1]).toMatchObject({ lap: 2, time: 91.2, sectors: [26.8, 38.6, 25.7], trapSpeed: 305, startsAt: "2026-10-09T13:12:00.000Z" });
    expect(t.laps[44]).toBeUndefined();
  });
});

describe("fastestLap", () => {
  const laps = (list: Partial<TelemetryLap>[]): TelemetryLap[] =>
    list.map((l, i) => ({ lap: i + 1, startsAt: "2026-10-09T13:00:00.000Z", time: null, sectors: [null, null, null], trapSpeed: null, i1Speed: null, i2Speed: null, pitOut: false, ...l }));

  it("picks the quickest timed lap, never an out-lap or one without a start time", () => {
    expect(fastestLap(laps([{ time: 92.1 }, { time: 90.5, pitOut: true }, { time: 91.4 }, { time: 91.0, startsAt: null }]))?.lap).toBe(3);
  });

  it("is null for a driver with no timed lap", () => {
    expect(fastestLap(laps([{ time: null }, { time: 95, pitOut: true }]))).toBeNull();
  });
});
