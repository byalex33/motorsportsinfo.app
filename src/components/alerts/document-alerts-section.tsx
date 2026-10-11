"use client";

import { Radio as RadioPrimitive } from "@base-ui/react/radio";
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group";
import { SegmentPill } from "@/components/motion/segment-pill";
import { SERIES } from "@/domain/series";
import { FIA_DOCUMENT_SERIES, type DocumentAlertLevel, type FiaDocumentSeries } from "@/domain/types";
import type { DocumentAlerts } from "@/server/alerts/document-alerts";
import { AlertsSection } from "./alerts-section";

type Choice = "off" | DocumentAlertLevel;

const CHOICES: { value: Choice; label: string; description: string }[] = [
  { value: "off", label: "Off", description: "No document alerts" },
  { value: "stewards", label: "Stewards", description: "Stewards' decisions, summons and infringements" },
  { value: "all", label: "All", description: "Every document, including classifications, grids and notes" },
];

export interface DocumentAlertsSectionProps {
  documentAlerts: DocumentAlerts;
  onChange: (series: FiaDocumentSeries, level: DocumentAlertLevel | null) => void;
}

/** Per Series with FIA Documents: which new documents get a Document Alert. Delivered by the reminders' push. */
export function DocumentAlertsSection({ documentAlerts, onChange }: DocumentAlertsSectionProps) {
  return (
    <AlertsSection
      id="document-alerts-heading"
      index="02"
      title="FIA documents"
      description={
        <>
          A notification when the FIA publishes a new document for the Round in progress, opening it right here.
          Stewards covers decisions, summons and infringements; All adds classifications, grids and notes. Titles can
          give away what happened on track. Turn notifications on below.
        </>
      }
    >
      <ul className="divide-y divide-border border-y border-border">
        {FIA_DOCUMENT_SERIES.map((series) => {
          const info = SERIES[series];
          const value: Choice = documentAlerts[series] ?? "off";
          return (
            <li key={series} data-series={series} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-1 py-3 sm:px-3">
              <span id={`document-alerts-${series}`} className="eyebrow flex items-center gap-2 text-foreground">
                <span aria-hidden className="size-1.5 rounded-full bg-series-gradient" />
                {info.shortName}
                <span className="sr-only">
                  {info.name !== info.shortName && ` (${info.name})`} document alerts
                </span>
              </span>
              <RadioGroupPrimitive
                aria-labelledby={`document-alerts-${series}`}
                value={value}
                onValueChange={(next) => onChange(series, next === "off" ? null : (next as DocumentAlertLevel))}
                className="group/seg relative inline-flex w-fit max-w-full items-center rounded-full bg-muted p-0.5"
              >
                <SegmentPill />
                {CHOICES.map((choice) => (
                  <RadioPrimitive.Root
                    key={choice.value}
                    value={choice.value}
                    aria-label={`${choice.label}: ${choice.description}`}
                    className="relative flex h-7 cursor-pointer items-center rounded-full px-3 text-[0.8125rem] font-medium whitespace-nowrap text-muted-foreground transition-colors duration-300 ease-expo outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-checked:bg-foreground data-checked:text-background group-data-[pill=ready]/seg:data-checked:bg-transparent!"
                  >
                    {choice.label}
                  </RadioPrimitive.Root>
                ))}
              </RadioGroupPrimitive>
            </li>
          );
        })}
      </ul>
    </AlertsSection>
  );
}
