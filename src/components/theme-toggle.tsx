"use client";

import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { useHydrated } from "@/lib/client-stores";

const ORDER = ["system", "light", "dark"] as const;
type ThemeChoice = (typeof ORDER)[number];

const LABEL: Record<ThemeChoice, string> = {
  system: "Theme: follows your system",
  light: "Theme: light",
  dark: "Theme: dark",
};

/** Cycles system → light → dark. Defaults to following the system. */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const hydrated = useHydrated();
  const current: ThemeChoice = hydrated && (theme === "light" || theme === "dark") ? theme : "system";
  const next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length];
  const Icon = current === "light" ? SunIcon : current === "dark" ? MoonIcon : MonitorIcon;

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(next)}
      aria-label={`${LABEL[current]}. Switch to ${next}.`}
      title={LABEL[current]}
      className="text-muted-foreground hover:text-foreground"
    >
      <Icon aria-hidden />
    </Button>
  );
}
