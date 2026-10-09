"use client";

import { useMemo, useState } from "react";
import type { ReminderLeadMinutes } from "@/domain/series";
import type { DocumentAlertLevel, FiaDocumentSeries, SeriesId, SessionType } from "@/domain/types";
import { ENTER, staggerDelay } from "@/lib/motion";
import { setDocumentAlert, type DocumentAlerts } from "@/server/alerts/document-alerts";
import { defaultFollows, toggleFollow, type Follows } from "@/server/alerts/selection";
import { AlertsSection } from "./alerts-section";
import { CalendarFeedCard } from "./calendar-feed-card";
import { DocumentAlertsSection } from "./document-alerts-section";
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

/** The Alerts page body: one shared selection driving Session Reminders and the calendar feed, plus Document Alerts. */
export function AlertsPanel() {
  const storedAlertsRaw = useStoredString(ALERTS_STORAGE_KEY);
  const storedAlerts = useMemo(() => parseSavedAlerts(storedAlertsRaw), [storedAlertsRaw]);
  const rememberedSeries = parseRememberedSeries(useStoredString(SERIES_STORAGE_KEY));
  // Choices made on this visit; until then, what this device saved before, else the defaults.
  const [followsOverride, setFollowsOverride] = useState<Follows | null>(null);
  const [leadOverride, setLeadOverride] = useState<ReminderLeadMinutes | null>(null);
  const [documentAlertsOverride, setDocumentAlertsOverride] = useState<DocumentAlerts | null>(null);

  const follows = followsOverride ?? storedAlerts?.follows ?? defaultFollows(rememberedSeries);
  const leadMinutes = leadOverride ?? storedAlerts?.leadMinutes ?? 15;
  const documentAlerts = documentAlertsOverride ?? storedAlerts?.documentAlerts ?? {};

  function toggle(series: SeriesId, type: SessionType, on: boolean) {
    const next = toggleFollow(follows, series, type, on);
    setFollowsOverride(next);
    writeSavedAlerts({ follows: next, leadMinutes, documentAlerts });
  }

  function changeLead(lead: ReminderLeadMinutes) {
    setLeadOverride(lead);
    writeSavedAlerts({ follows, leadMinutes: lead, documentAlerts });
  }

  function changeDocumentAlert(series: FiaDocumentSeries, level: DocumentAlertLevel | null) {
    const next = setDocumentAlert(documentAlerts, series, level);
    setDocumentAlertsOverride(next);
    writeSavedAlerts({ follows, leadMinutes, documentAlerts: next });
  }

  return (
    <div className="grid gap-14">
      <AlertsSection
        id="choose-sessions-heading"
        index="01"
        title="Choose Sessions"
        description="Tick the Session Types you care about in each Series. Reminders and the calendar feed both use these ticks."
        className="enter-rise"
        style={staggerDelay(0, ENTER.body, 60)}
      >
        <SelectionGrid follows={follows} onToggle={toggle} />
      </AlertsSection>
      <div className="enter-rise min-w-0" style={staggerDelay(1, ENTER.body, 60)}>
        <DocumentAlertsSection documentAlerts={documentAlerts} onChange={changeDocumentAlert} />
      </div>
      <div className="grid gap-14 md:grid-cols-2 md:gap-10">
        <div className="enter-rise min-w-0" style={staggerDelay(2, ENTER.body, 60)}>
          <RemindersCard follows={follows} leadMinutes={leadMinutes} documentAlerts={documentAlerts} onLeadChange={changeLead} />
        </div>
        <div className="enter-rise min-w-0" style={staggerDelay(3, ENTER.body, 60)}>
          <CalendarFeedCard follows={follows} />
        </div>
      </div>
    </div>
  );
}
