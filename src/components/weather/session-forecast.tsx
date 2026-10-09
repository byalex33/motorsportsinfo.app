// CONTRACT — owned by the weather work. Presentational; the UI passes the viewer's unit choices.
import type { ForecastResult } from "@/domain/types";

export type TempUnit = "c" | "f";
export type WindUnit = "kmh" | "mph";

export interface SessionForecastViewProps {
  forecast: ForecastResult;
  tempUnit: TempUnit;
  windUnit: WindUnit;
  /** Viewer's chosen time zone, for formatting "Forecast from {date}". */
  timeZone: string;
}

export function SessionForecastView({ forecast, tempUnit }: SessionForecastViewProps) {
  if (forecast.kind !== "forecast") return null;
  const t = tempUnit === "f" ? forecast.temperatureC * 1.8 + 32 : forecast.temperatureC;
  return (
    <span>
      {Math.round(t)}°{tempUnit.toUpperCase()} · {forecast.precipitationProbability}% rain
    </span>
  );
}
