"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { RotateCcwIcon } from "lucide-react";
import { canonicalTelemetryQuery, DATA_QUERY_KEYS } from "@/app/[series]/telemetry/[session]/card";
import { Button } from "@/components/ui/button";
import type { LapComparison, TelemetryDriver, TelemetryLap } from "@/domain/types";
import { formatLapTime } from "@/lib/lap-time";
import { colorParam } from "@/lib/team-colors";
import { channelParam } from "@/lib/telemetry-channels";
import { ComparisonColors } from "./comparison-colors";
import { DriverPicker } from "./driver-picker";
import { LapTimesChart } from "./lap-times-chart";
import { LapTraces } from "./lap-traces";
import { SectorTable } from "./sector-table";
import { ShareComparison } from "./share-comparison";

type PickerDriver = TelemetryDriver & { hasLap: boolean };

/** What GET /f1/telemetry/{session}/data?a=…&b=… answers: the comparison, or why there is none. */
export type TelemetryComparisonData =
  | {
      kind: "ready";
      drivers: PickerDriver[];
      a: PickerDriver;
      b: PickerDriver;
      lapsA: TelemetryLap[];
      lapsB: TelemetryLap[];
      lapA: TelemetryLap;
      lapB: TelemetryLap;
      /** null when OpenF1 has no car data for one of the laps yet. */
      comparison: LapComparison | null;
      /** Compared laps well off the Session's best (a red flag, a crash): not like for like. */
      offPace: { driver: PickerDriver; lap: TelemetryLap }[];
    }
  | { kind: "not-finished" }
  | { kind: "unavailable" }
  | { kind: "too-few" };

interface TelemetryComparisonProps {
  /** The page's path, e.g. "/f1/telemetry/qualifying". */
  path: string;
  /** For the share text and file name. */
  roundName: string;
  roundSlug: string;
  sessionName: string;
}

/**
 * Two drivers' fastest laps compared. It is a spoiler, so the page renders only the warning and this is mounted
 * once the viewer reveals it: the comparison is fetched then (cached on the server and the CDN), never sent with
 * the page. The drivers come from the URL (?a=VER&b=RUS); colours (?ca, ?cb) and the channel (?ch) are applied
 * here without a fetch.
 */
export function TelemetryComparison({ path, roundName, roundSlug, sessionName }: TelemetryComparisonProps) {
  const query = useSearchParams();
  // The data route's canonical query, which it serves without a redirect.
  const pair = canonicalTelemetryQuery(Object.fromEntries(query), DATA_QUERY_KEYS);
  const { data, pending, failed, retry } = useComparisonData(`${path}/data${pair.size ? `?${pair}` : ""}`);

  if (!data) {
    if (failed) return <Retry onRetry={retry}>Couldn&apos;t load the telemetry. Try again in a moment.</Retry>;
    return <ComparisonSkeleton />;
  }
  if (data.kind === "not-finished") return <Notice>Telemetry appears here once {sessionName} has finished.</Notice>;
  if (data.kind === "unavailable") {
    return (
      <Notice>
        Telemetry for {sessionName} isn&apos;t available right now. OpenF1 publishes the laps within about half an hour of the
        chequered flag; if it&apos;s been longer, try again in a few minutes.
      </Notice>
    );
  }
  if (data.kind === "too-few") return <Notice>Fewer than two drivers set a timed lap in {sessionName}, so there is nothing to compare.</Notice>;

  const { drivers, a, b, lapsA, lapsB, lapA, lapB, comparison, offPace } = data;
  return (
    // Keyed on the pair, so new drivers start from their team colours (or the colours the URL picks for them).
    <ComparisonColors
      key={`${a.code}-${b.code}`}
      teamA={a.color}
      teamB={b.color}
      initialPicks={{ a: colorParam(query.get("ca")), b: colorParam(query.get("cb")) }}
      className="space-y-12"
    >
      <div className="space-y-3">
        <DriverPicker path={path} drivers={drivers} a={a.code} b={b.code} pending={pending} />
        {failed && (
          <p role="alert" className="text-sm text-muted-foreground">
            Couldn&apos;t load those laps.{" "}
            <button type="button" className="text-foreground underline underline-offset-4" onClick={retry}>
              Try again
            </button>
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          Fastest laps: <span className="text-foreground">{a.code}</span> lap {lapA.lap} ({formatLapTime(lapA.time!)}) against{" "}
          <span className="text-foreground">{b.code}</span> lap {lapB.lap} ({formatLapTime(lapB.time!)}).
        </p>
        {offPace.map(({ driver, lap }) => (
          <p key={driver.number} className="border-l-2 border-series-accent pl-3 text-sm text-muted-foreground">
            {driver.code}&apos;s quickest timed lap ({formatLapTime(lap.time!)}) is well off the pace, so it wasn&apos;t a clean flying
            lap: expect big gaps.
          </p>
        ))}
        {comparison && (
          <ShareComparison
            imagePath={`${path}/image`}
            a={a.code}
            b={b.code}
            text={`${a.code} vs ${b.code} · F1 ${roundName} ${sessionName} telemetry`}
            fileName={`${roundSlug}-${path.split("/").pop()}-${a.code}-${b.code}`.toLowerCase()}
          />
        )}
      </div>

      {comparison ? (
        <LapTraces comparison={comparison} a={a} b={b} initialChannel={channelParam(query.get("ch"))} />
      ) : (
        <Notice>OpenF1 doesn&apos;t have the car data for these laps yet, so only the timing is shown.</Notice>
      )}

      <section aria-labelledby="sectors-heading" className="space-y-3">
        <h2 id="sectors-heading" className="eyebrow text-muted-foreground">
          Sectors and speed traps
        </h2>
        <SectorTable a={a} b={b} lapA={lapA} lapB={lapB} />
      </section>

      <LapTimesChart a={a} b={b} lapsA={lapsA} lapsB={lapsB} comparedA={lapA.lap} comparedB={lapB.lap} />
    </ComparisonColors>
  );
}

/**
 * The comparison at `url`. While a new pair loads, the last one stays up (`pending`), as the charts did while
 * the server rendered a new pair. `failed` is about the latest request only.
 */
function useComparisonData(url: string) {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<{ url: string; attempt: number; data: TelemetryComparisonData | null; failed: boolean } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(url, { signal: controller.signal })
      .then((res) => (res.ok ? (res.json() as Promise<TelemetryComparisonData>) : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then(
        (data) => setLoaded({ url, attempt, data, failed: false }),
        () => {
          if (!controller.signal.aborted) setLoaded((last) => ({ url, attempt, data: last?.data ?? null, failed: true }));
        },
      );
    return () => controller.abort();
  }, [url, attempt]);

  const settled = loaded?.url === url && loaded.attempt === attempt;
  return {
    data: loaded?.data ?? null,
    pending: !settled,
    failed: settled && loaded.failed,
    retry: () => setAttempt((n) => n + 1),
  };
}

function Notice({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-border px-5 py-10 text-center text-sm text-muted-foreground">{children}</p>;
}

function Retry({ children, onRetry }: { children: ReactNode; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-lg border border-border px-5 py-10 text-center">
      <p className="text-sm text-muted-foreground">{children}</p>
      <Button type="button" variant="outline" size="sm" onClick={onRetry}>
        <RotateCcwIcon aria-hidden />
        Try again
      </Button>
    </div>
  );
}

/** The picker and the charts' footprint while the comparison loads. */
function ComparisonSkeleton() {
  return (
    <div aria-busy="true" className="space-y-12">
      <p role="status" className="sr-only">
        Loading telemetry
      </p>
      <div className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="h-14 w-full animate-pulse rounded-md bg-muted sm:w-80" />
          <div className="h-14 w-full animate-pulse rounded-md bg-muted sm:w-80" />
        </div>
        <div className="h-4 w-72 max-w-full animate-pulse rounded-md bg-muted" />
      </div>
      <div className="h-96 w-full animate-pulse rounded-lg bg-muted" />
    </div>
  );
}
