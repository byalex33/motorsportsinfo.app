"use client";

import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { useEffect } from "react";
import { BrandMark } from "@/components/brand-mark";
import { RedFlag } from "@/components/red-flag";
import { SiteFooter } from "@/components/site-footer";
import "./globals.css";

const sans = Geist({ variable: "--font-geist-sans", subsets: ["latin"], display: "swap" });
const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], display: "swap" });

/** The viewer's theme choice (stored by next-themes in the root layout), or the device's scheme. */
function prefersDark(): boolean {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem("msi.theme");
  } catch {}
  if (stored === "dark" || stored === "light") return stored === "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

// Replaces the root layout when the layout itself fails, so it brings its own document, styles and a
// minimal header. Rare; the page-level error.tsx handles everything else.
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    document.documentElement.classList.toggle("dark", prefersDark());
  }, []);

  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <title>Red flag · motorsportsinfo.app</title>
        <meta name="robots" content="noindex" />
        <header className="border-b border-border bg-background">
          <div className="mx-auto flex h-14 w-full max-w-5xl items-center px-3 sm:px-6">
            <Link
              href="/"
              className="flex items-center gap-2.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <span className="grid size-7 place-items-center rounded-md bg-primary text-primary-foreground">
                <BrandMark className="size-[18px]" />
              </span>
              <span className="text-[0.95rem] font-semibold tracking-tight text-foreground">
                motorsportsinfo<span className="text-muted-foreground">.app</span>
              </span>
            </Link>
          </div>
        </header>
        <div className="flex flex-1 flex-col">
          <RedFlag error={error} retry={retry} />
        </div>
        <SiteFooter />
      </body>
    </html>
  );
}
