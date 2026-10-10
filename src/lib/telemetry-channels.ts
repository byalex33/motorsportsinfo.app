/** The car data a Telemetry page can show, one at a time, chosen with ?ch= (speed when absent). */
export const TELEMETRY_CHANNELS = ["speed", "throttle", "brake", "gear"] as const;
export type TelemetryChannel = (typeof TELEMETRY_CHANNELS)[number];

export const CHANNEL_LABELS: Record<TelemetryChannel, string> = {
  speed: "Speed",
  throttle: "Throttle",
  brake: "Brake",
  gear: "Gear",
};

export function channelParam(value: unknown): TelemetryChannel {
  return TELEMETRY_CHANNELS.find((c) => c === value) ?? "speed";
}
