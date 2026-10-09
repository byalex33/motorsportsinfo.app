// WMO weather interpretation codes (as used by Open-Meteo) → condition label and lucide icon.
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudHail,
  CloudLightning,
  CloudMoon,
  CloudMoonRain,
  CloudRain,
  CloudRainWind,
  CloudSnow,
  CloudSun,
  CloudSunRain,
  Cloudy,
  Moon,
  Snowflake,
  Sun,
  type LucideIcon,
} from "lucide-react";

export interface WeatherCondition {
  label: string;
  day: LucideIcon;
  night: LucideIcon;
}

const same = (label: string, icon: LucideIcon): WeatherCondition => ({ label, day: icon, night: icon });

/** Every code Open-Meteo documents for `weather_code`. */
export const WMO_CONDITIONS: Readonly<Record<number, WeatherCondition>> = {
  0: { label: "Clear sky", day: Sun, night: Moon },
  1: { label: "Mainly clear", day: Sun, night: Moon },
  2: { label: "Partly cloudy", day: CloudSun, night: CloudMoon },
  3: same("Overcast", Cloudy),
  45: same("Fog", CloudFog),
  48: same("Freezing fog", CloudFog),
  51: same("Light drizzle", CloudDrizzle),
  53: same("Drizzle", CloudDrizzle),
  55: same("Heavy drizzle", CloudDrizzle),
  56: same("Light freezing drizzle", CloudDrizzle),
  57: same("Freezing drizzle", CloudDrizzle),
  61: same("Light rain", CloudRain),
  63: same("Rain", CloudRain),
  65: same("Heavy rain", CloudRainWind),
  66: same("Light freezing rain", CloudHail),
  67: same("Freezing rain", CloudHail),
  71: same("Light snow", CloudSnow),
  73: same("Snow", CloudSnow),
  75: same("Heavy snow", CloudSnow),
  77: same("Snow grains", Snowflake),
  80: { label: "Light rain showers", day: CloudSunRain, night: CloudMoonRain },
  81: { label: "Rain showers", day: CloudSunRain, night: CloudMoonRain },
  82: same("Violent rain showers", CloudRainWind),
  85: same("Light snow showers", CloudSnow),
  86: same("Heavy snow showers", CloudSnow),
  95: same("Thunderstorm", CloudLightning),
  96: same("Thunderstorm with hail", CloudLightning),
  99: same("Thunderstorm with heavy hail", CloudLightning),
};

export const UNKNOWN_CONDITION: WeatherCondition = same("Unknown conditions", Cloud);

export function weatherCondition(code: number, isDay: boolean): { label: string; Icon: LucideIcon } {
  const condition = WMO_CONDITIONS[code] ?? UNKNOWN_CONDITION;
  return { label: condition.label, Icon: isDay ? condition.day : condition.night };
}
