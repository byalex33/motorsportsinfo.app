"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";

// The inline theme script runs during HTML parsing on the server-rendered page. On the client it is
// rendered as an inert text/plain script so React does not warn about script tags in components.
const scriptProps = {
  type: typeof window === "undefined" ? "text/javascript" : "text/plain",
  suppressHydrationWarning: true,
} as const;

export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      storageKey="msi.theme"
      scriptProps={scriptProps}
    >
      {children}
    </NextThemesProvider>
  );
}
