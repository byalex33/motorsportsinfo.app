"use client";

import { BellIcon, BellOffIcon } from "lucide-react";
import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Radio as RadioPrimitive } from "@base-ui/react/radio";
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group";
import { SegmentPill } from "@/components/motion/segment-pill";
import { Button } from "@/components/ui/button";
import { REMINDER_LEAD_MINUTES, type ReminderLeadMinutes } from "@/domain/series";
import { track } from "@/lib/analytics";
import { followedSeries, type Follows } from "@/server/alerts/selection";
import { AlertsSection } from "./alerts-section";
import {
  detectPushSupport,
  getExistingSubscription,
  removeSubscription,
  saveSubscription,
  subscribeDevice,
  type PushSupport,
} from "./push-client";

const LEAD_LABELS: Record<ReminderLeadMinutes, string> = {
  15: "15 minutes before",
  60: "1 hour before",
  1440: "1 day before",
};

/** Visible segment labels; the full LEAD_LABELS are the accessible names. */
const LEAD_SHORT_LABELS: Record<ReminderLeadMinutes, string> = {
  15: "15 min",
  60: "1 hour",
  1440: "1 day",
};

const SAVE_DELAY_MS = 600;

const noopSubscribe = () => () => {};

function usePushSupport(): PushSupport {
  return useSyncExternalStore(noopSubscribe, detectPushSupport, () => "checking" as const);
}

export interface RemindersCardProps {
  follows: Follows;
  leadMinutes: ReminderLeadMinutes;
  onLeadChange: (lead: ReminderLeadMinutes) => void;
}

export function RemindersCard({ follows, leadMinutes, onLeadChange }: RemindersCardProps) {
  const leadLabelId = useId();
  const detected = usePushSupport();
  const [denied, setDenied] = useState(false);
  const support: PushSupport = denied ? "denied" : detected;
  /** null while checking whether this device already has a subscription. */
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "info" | "error"; text: string } | null>(null);
  const lastSaved = useRef<string | null>(null);

  const seriesCount = followedSeries(follows).length;
  const selectionKey = JSON.stringify({ follows, leadMinutes });

  // Does this device already have a subscription?
  useEffect(() => {
    if (support !== "supported") return;
    let cancelled = false;
    getExistingSubscription()
      .then((sub) => {
        if (!cancelled) setSubscribed(Boolean(sub));
      })
      .catch(() => {
        if (!cancelled) setSubscribed(false);
      });
    return () => {
      cancelled = true;
    };
  }, [support]);

  // While on, re-save whenever the ticks or lead time change (and once per visit, which refreshes the time zone).
  useEffect(() => {
    if (subscribed !== true || lastSaved.current === selectionKey) return;
    const timer = setTimeout(async () => {
      const sub = await getExistingSubscription().catch(() => null);
      if (!sub) {
        setSubscribed(false);
        return;
      }
      const result = await saveSubscription(sub, follows, leadMinutes);
      if (result.ok) {
        const firstSave = lastSaved.current === null;
        lastSaved.current = selectionKey;
        if (!firstSave) setMessage({ tone: "info", text: "Saved. Reminders on this device use your new choices." });
      } else {
        setMessage({ tone: "error", text: result.message });
      }
    }, SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [subscribed, selectionKey, follows, leadMinutes]);

  async function enable() {
    setBusy(true);
    setMessage(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission === "denied") {
        setDenied(true);
        return;
      }
      if (permission !== "granted") {
        setMessage({ tone: "info", text: "Reminders stay off until you allow notifications." });
        return;
      }
      const sub = await subscribeDevice();
      const result = await saveSubscription(sub, follows, leadMinutes);
      if (!result.ok) {
        await sub.unsubscribe().catch(() => false);
        setMessage({ tone: "error", text: result.message });
        return;
      }
      lastSaved.current = selectionKey;
      setSubscribed(true);
      setMessage({ tone: "info", text: "Reminders are on for this device." });
      track("push_enabled", { series_count: seriesCount });
    } catch (error) {
      console.error("[alerts] enabling push failed", error);
      setMessage({
        tone: "error",
        text: "Could not turn on reminders in this browser. Reload the page and try again, or use the calendar feed.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setMessage(null);
    try {
      const sub = await getExistingSubscription();
      if (sub) await removeSubscription(sub);
      lastSaved.current = null;
      setSubscribed(false);
      setMessage({ tone: "info", text: "Reminders are off for this device." });
      track("push_disabled", { series_count: seriesCount });
    } catch (error) {
      console.error("[alerts] disabling push failed", error);
      setMessage({ tone: "error", text: "Could not turn off reminders. Reload the page and try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertsSection
      id="session-reminders-heading"
      index="02"
      title="Session Reminders"
      description="A notification on this device shortly before each ticked Session starts, and a push if one of them is moved or cancelled."
    >
      <div className="grid gap-6">
        <div className="grid gap-2.5">
          <p id={leadLabelId} className="eyebrow text-muted-foreground">
            Remind me
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <RadioGroupPrimitive
              aria-labelledby={leadLabelId}
              value={leadMinutes}
              onValueChange={(value) => onLeadChange(value as ReminderLeadMinutes)}
              className="group/seg relative inline-flex w-fit max-w-full items-center rounded-full bg-muted p-0.5"
            >
              <SegmentPill />
              {REMINDER_LEAD_MINUTES.map((minutes) => (
                <RadioPrimitive.Root
                  key={minutes}
                  value={minutes}
                  aria-label={LEAD_LABELS[minutes]}
                  className="relative flex h-7 cursor-pointer items-center rounded-full px-3 text-[0.8125rem] font-medium whitespace-nowrap text-muted-foreground transition-colors duration-300 ease-expo outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-checked:bg-foreground data-checked:text-background group-data-[pill=ready]/seg:data-checked:bg-transparent!"
                >
                  {LEAD_SHORT_LABELS[minutes]}
                </RadioPrimitive.Root>
              ))}
            </RadioGroupPrimitive>
            <span aria-hidden className="text-sm text-muted-foreground">
              before
            </span>
          </div>
        </div>

        <PushControls
          support={support}
          subscribed={subscribed}
          busy={busy}
          nothingTicked={seriesCount === 0}
          onEnable={enable}
          onDisable={disable}
        />

        <p role="status" aria-live="polite" className={message?.tone === "error" ? "text-sm text-destructive" : "text-sm"}>
          {message && (
            <span key={message.text} className="enter-focus block">
              {message.text}
            </span>
          )}
        </p>
      </div>
    </AlertsSection>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <p className="border-l-2 border-border pl-3 text-sm leading-relaxed text-muted-foreground">{children}</p>;
}

interface PushControlsProps {
  support: PushSupport;
  subscribed: boolean | null;
  busy: boolean;
  nothingTicked: boolean;
  onEnable: () => void;
  onDisable: () => void;
}

function PushControls({ support, subscribed, busy, nothingTicked, onEnable, onDisable }: PushControlsProps) {
  switch (support) {
    case "checking":
      return <Note>Checking whether this browser can show reminders…</Note>;
    case "ios-needs-install":
      return (
        <Note>
          On iPhone and iPad, Apple only allows reminders from web apps on the Home Screen. Tap the Share button, choose{" "}
          <strong className="font-medium text-foreground">Add to Home Screen</strong>, then open motorsportsinfo.app from
          your Home Screen and turn reminders on there. The calendar feed works without installing anything.
        </Note>
      );
    case "ios-too-old":
      return (
        <Note>
          Reminders need iOS 16.4 or later. Update your iPhone or iPad, or use the calendar feed, which works on any
          version.
        </Note>
      );
    case "unsupported":
      return (
        <Note>
          This browser can&apos;t show web push reminders. Try an up-to-date Chrome, Edge, Firefox or Safari, or use the
          calendar feed instead.
        </Note>
      );
    case "denied":
      return (
        <Note>
          Notifications are blocked for this site. To get reminders, allow notifications for motorsportsinfo.app in your
          browser&apos;s site settings, then reload this page. The calendar feed works either way.
        </Note>
      );
    case "not-configured":
      return <Note>Reminders aren&apos;t available on this copy of the site yet. The calendar feed still works.</Note>;
    case "supported":
      break;
  }

  if (subscribed === null) return <Note>Checking this device…</Note>;

  if (subscribed) {
    return (
      <div className="grid gap-3">
        <p className="flex items-center gap-2 text-sm font-medium">
          <span aria-hidden className="relative flex size-1.5">
            <span className="absolute inset-0 animate-[ping_1s_cubic-bezier(0,0,0.2,1)_2_forwards] rounded-full bg-primary opacity-60" />
            <span className="relative size-1.5 rounded-full bg-primary" />
          </span>
          Reminders are on for this device.
        </p>
        {nothingTicked && (
          <Note>Nothing is ticked, so no reminders will arrive. Tick some Session Types above, or turn reminders off.</Note>
        )}
        <Button variant="outline" size="lg" onClick={onDisable} disabled={busy} className="w-full sm:w-fit">
          <BellOffIcon aria-hidden />
          Turn off
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <Button size="lg" onClick={onEnable} disabled={busy || nothingTicked} className="w-full sm:w-fit">
        <BellIcon aria-hidden />
        {busy ? "Turning on…" : "Enable reminders"}
      </Button>
      {nothingTicked && <p className="text-sm text-muted-foreground">Tick at least one Session Type above first.</p>}
    </div>
  );
}
