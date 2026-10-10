"use client";

import { createContext, useContext, useState, type CSSProperties, type ReactNode } from "react";
import { chosenPalette, type TeamPalette } from "@/lib/team-colors";

interface ComparisonColorsValue {
  palette: TeamPalette;
  /** The team colour as the source gives it, for a picker's starting value. */
  team: { a: string | null; b: string | null };
  picks: { a: string | null; b: string | null };
  /** Pick a colour for driver A or B, or null to go back to the team colour. */
  pick: (which: "a" | "b", color: string | null) => void;
}

const Context = createContext<ComparisonColorsValue | null>(null);

export function useComparisonColors(): ComparisonColorsValue {
  const value = useContext(Context);
  if (!value) throw new Error("useComparisonColors needs a <ComparisonColors> above it");
  return value;
}

/**
 * Sets the two drivers' colours for everything inside (as the --driver-a/--driver-b tokens, see globals.css).
 * Picks apply at once and are written to the URL (?ca=…&cb=…) without a reload, so a shared link and the
 * share image keep them. Key it on the driver pair: new drivers start from their team colours.
 */
export function ComparisonColors({
  teamA,
  teamB,
  initialPicks,
  className,
  children,
}: {
  teamA: string | null;
  teamB: string | null;
  initialPicks: { a: string | null; b: string | null };
  className?: string;
  children: ReactNode;
}) {
  const [picks, setPicks] = useState(initialPicks);
  const palette = chosenPalette(teamA, teamB, picks.a, picks.b);

  function pick(which: "a" | "b", color: string | null) {
    setPicks((p) => ({ ...p, [which]: color }));
    const url = new URL(window.location.href);
    const key = which === "a" ? "ca" : "cb";
    if (color) url.searchParams.set(key, color.slice(1));
    else url.searchParams.delete(key);
    window.history.replaceState(window.history.state, "", url);
  }

  const style = {
    "--team-a-light": palette.a.light,
    "--team-a-dark": palette.a.dark,
    "--team-b-light": palette.b.light,
    "--team-b-dark": palette.b.dark,
  } as CSSProperties;

  return (
    <Context.Provider value={{ palette, team: { a: teamA, b: teamB }, picks, pick }}>
      <div className={className} data-team-colors="" data-dashed-b={palette.dashedB ? "" : undefined} style={style}>
        {children}
      </div>
    </Context.Provider>
  );
}
