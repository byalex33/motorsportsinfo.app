import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AnalyticsProvider } from "@/components/analytics-provider";
import { AnnouncementBanner } from "@/components/announcement-banner";
import { OfflineBanner } from "@/components/offline-banner";
import { OpenSourceNote } from "@/components/open-source-note";
import { ServiceWorkerRegistration } from "@/components/service-worker";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { ThemeProvider } from "@/components/theme-provider";
import { SITE_DESCRIPTION, SITE_LOCALE, SITE_NAME, SITE_URL } from "@/lib/site";
import { listSpecialEventAnnouncements } from "@/server/schedule";
import "./globals.css";

const sans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const mono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "motorsportsinfo.app — session times & weather for F1, F2, F3, WEC, Formula E, IndyCar, MotoGP and more",
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  appleWebApp: { capable: true, title: "MSI", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    locale: SITE_LOCALE,
  },
  twitter: { card: "summary_large_image", title: SITE_NAME, description: SITE_DESCRIPTION },
};

export const viewport: Viewport = {
  // The page background in each scheme, so the browser bar (and the installed app's title bar) runs
  // straight into the site header. The manifest's theme_color is the light value.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
  colorScheme: "light dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning className={`${sans.variable} ${mono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <ThemeProvider>
          <a
            href="#main"
            className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
          >
            Skip to content
          </a>
          <SiteHeader />
          <OfflineBanner />
          <AnnouncementBanner announcements={listSpecialEventAnnouncements()} />
          <div id="main" className="flex flex-1 flex-col">
            {children}
          </div>
          <SiteFooter />
          <OpenSourceNote />
        </ThemeProvider>
        <AnalyticsProvider />
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
