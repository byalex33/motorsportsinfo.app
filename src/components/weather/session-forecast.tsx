// CONTRACT — owned by the weather work. Presentational; the UI passes the viewer's unit choices.
// No server-only imports and no hooks, so it renders from server and client components alike.
import { ArrowDown, Droplet } from "lucide-react";
import type { ForecastResult } from "@/domain/types";
import { cn } from "@/lib/utils";
import { weatherCondition } from "./weather-codes";
import {
  compassName,
  formatForecastDate,
  formatTemperature,
  formatWindSpeed,
  type TempUnit,
  type WindUnit,
} from "./units";

export type { TempUnit, WindUnit } from "./units";
export { WeatherCredit } from "./weather-credit";

export interface SessionForecastViewProps {
  forecast: ForecastResult;
  tempUnit: TempUnit;
  windUnit: WindUnit;
  /** Viewer's chosen time zone, for formatting "Forecast from {date}". */
  timeZone: string;
}

const ROOT = "inline-flex items-center text-sm leading-5 whitespace-nowrap";

export function SessionForecastView({ forecast, tempUnit, windUnit, timeZone }: SessionForecastViewProps) {
  if (forecast.kind === "not-yet") {
    return (
      <span className={cn(ROOT, "text-muted-foreground")}>
        Forecast from {formatForecastDate(forecast.availableFrom, timeZone)}
      </span>
    );
  }

  if (forecast.kind === "unavailable") {
    return <span className={cn(ROOT, "text-muted-foreground/80")}>Forecast unavailable</span>;
  }

  const { label, Icon } = weatherCondition(forecast.weatherCode, forecast.isDay);
  const rain = Math.round(forecast.precipitationProbability);
  const wind = formatWindSpeed(forecast.windSpeedKmh, windUnit);
  const from = compassName(forecast.windDirectionDeg);

  return (
    <span className={cn(ROOT, "gap-3 tabular-nums")}>
      <span className="inline-flex items-center gap-1.5" title={label}>
        <Icon className="size-4 shrink-0" role="img" aria-label={label} />
        <span className="font-medium">{formatTemperature(forecast.temperatureC, tempUnit)}</span>
      </span>

      <span
        className={cn(
          "inline-flex items-center gap-1",
          rain >= 50 ? "text-sky-700 dark:text-sky-400" : "text-muted-foreground",
        )}
        title={`${rain}% chance of rain`}
      >
        <Droplet className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="sr-only">Chance of rain</span>
        {rain}%
      </span>

      <span className="inline-flex items-center gap-1 text-muted-foreground" title={`Wind ${wind} from the ${from}`}>
        {/* ArrowDown at 0° points south: the way a northerly wind blows. */}
        <ArrowDown
          className="size-3.5 shrink-0"
          style={{ transform: `rotate(${Math.round(forecast.windDirectionDeg)}deg)` }}
          aria-hidden="true"
        />
        <span className="sr-only">Wind from the {from} at</span>
        {wind}
      </span>
    </span>
  );
}
