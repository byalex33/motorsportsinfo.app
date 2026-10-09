import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
import { AnalyticsProvider } from "@/components/analytics-provider";
import { OfflineBanner } from "@/components/offline-banner";
import { ServiceWorkerRegistration } from "@/components/service-worker";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

const sans = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  display: "swap",
});

const mono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  display: "swap",
});

const description = "Session times and weather for F1, F2, F3 and WEC — in your time zone or Track Time, with live countdowns and rain radar.";

export const metadata: Metadata = {
  metadataBase: new URL("https://motorsportsinfo.app"),
  title: {
    default: "motorsportsinfo.app — session times & weather for F1, F2, F3 and WEC",
    template: "%s · motorsportsinfo.app",
  },
  description,
  applicationName: "motorsportsinfo.app",
  appleWebApp: { capable: true, title: "MSI", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  openGraph: {
    type: "website",
    siteName: "motorsportsinfo.app",
    title: "motorsportsinfo.app",
    description,
    url: "/",
    locale: "en_GB",
  },
  twitter: { card: "summary", title: "motorsportsinfo.app", description },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#050406" },
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
          <div id="main" className="flex flex-1 flex-col">
            {children}
          </div>
          <SiteFooter />
        </ThemeProvider>
        <AnalyticsProvider />
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
