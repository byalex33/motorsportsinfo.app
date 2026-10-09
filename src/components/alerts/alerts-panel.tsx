"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ReminderLeadMinutes } from "@/domain/series";
import type { SeriesId, SessionType } from "@/domain/types";
import { defaultFollows, toggleFollow, type Follows } from "@/server/alerts/selection";
import { CalendarFeedCard } from "./calendar-feed-card";
import { RemindersCard } from "./reminders-card";
import { SelectionGrid } from "./selection-grid";
import {
  ALERTS_STORAGE_KEY,
  SERIES_STORAGE_KEY,
  parseRememberedSeries,
  parseSavedAlerts,
  useStoredString,
  writeSavedAlerts,
} from "./storage";

/** The Alerts page body: one shared selection driving Session Reminders and the calendar feed. */
export function AlertsPanel() {
  const storedAlertsRaw = useStoredString(ALERTS_STORAGE_KEY);
  const storedAlerts = useMemo(() => parseSavedAlerts(storedAlertsRaw), [storedAlertsRaw]);
  const rememberedSeries = parseRememberedSeries(useStoredString(SERIES_STORAGE_KEY));
  // Choices made on this visit; until then, what this device saved before, else the defaults.
  const [followsOverride, setFollowsOverride] = useState<Follows | null>(null);
  const [leadOverride, setLeadOverride] = useState<ReminderLeadMinutes | null>(null);

  const follows = followsOverride ?? storedAlerts?.follows ?? defaultFollows(rememberedSeries);
  const leadMinutes = leadOverride ?? storedAlerts?.leadMinutes ?? 15;

  function toggle(series: SeriesId, type: SessionType, on: boolean) {
    const next = toggleFollow(follows, series, type, on);
    setFollowsOverride(next);
    writeSavedAlerts({ follows: next, leadMinutes });
  }

  function changeLead(lead: ReminderLeadMinutes) {
    setLeadOverride(lead);
    writeSavedAlerts({ follows, leadMinutes: lead });
  }

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>
            <h2 className="text-lg font-semibold">Choose Sessions</h2>
          </CardTitle>
          <CardDescription>
            Tick the Session Types you care about in each Series. Reminders and the calendar feed both use these ticks.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SelectionGrid follows={follows} onToggle={toggle} />
        </CardContent>
      </Card>
      <div className="grid gap-6 md:grid-cols-2">
        <RemindersCard follows={follows} leadMinutes={leadMinutes} onLeadChange={changeLead} />
        <CalendarFeedCard follows={follows} />
      </div>
    </div>
  );
}
