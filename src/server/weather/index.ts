// CONTRACT — owned by the weather work. UI code imports only from here.
// This stub returns a fixed sample until the real implementation lands.
import type { Circuit, ForecastResult } from "@/domain/types";

/** Open-Meteo forecast at the circuit for a Session's start time. */
export async function getSessionForecast(circuit: Circuit, startsAt: string): Promise<ForecastResult> {
  void circuit;
  return {
    kind: "forecast",
    at: startsAt,
    weatherCode: 2,
    isDay: false,
    temperatureC: 14,
    precipitationProbability: 10,
    windSpeedKmh: 12,
    windDirectionDeg: 220,
  };
}
