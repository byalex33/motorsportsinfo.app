import type { Metadata } from "next";
import { AlertsPanel } from "@/components/alerts/alerts-panel";

export const metadata: Metadata = {
  title: "Alerts",
  description:
    "Session Reminders on your phone or computer, and a calendar feed of F1, F2, F3 and WEC Session times that updates when the schedule changes.",
};

export default function AlertsPage() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
      <header className="mb-6 grid gap-2">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Alerts</h1>
        <p className="max-w-2xl text-muted-foreground">
          Get a Session Reminder before the Sessions you follow, or put them in your calendar. Covers F1, F2, F3 and WEC.
        </p>
      </header>
      <AlertsPanel />
    </main>
  );
}
