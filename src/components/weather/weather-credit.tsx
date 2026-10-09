import { cn } from "@/lib/utils";

/** Required Open-Meteo attribution (ADR 0001). */
export function WeatherCredit({ className }: { className?: string }) {
  return (
    <a
      href="https://open-meteo.com/"
      target="_blank"
      rel="noopener noreferrer"
      className={cn("text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline", className)}
    >
      Weather data by Open-Meteo.com
    </a>
  );
}
