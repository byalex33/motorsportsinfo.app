"use client";

import type { ReactNode } from "react";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSpoilerRevealed } from "@/lib/spoilers";

/**
 * Telemetry shows who was quicker, so it is a spoiler like the Session Result. Revealing either one (here or
 * in the Results modal) reveals both for the rest of the tab's life.
 */
export function SpoilerGate({ sessionId, children }: { sessionId: string; children: ReactNode }) {
  const [revealed, reveal] = useSpoilerRevealed(sessionId);
  // Until the stored choice is read, show neither the warning nor the spoilers.
  if (revealed === null) return <div aria-busy className="min-h-80" />;
  if (revealed) return <>{children}</>;
  return (
    <div className="enter-rise flex min-h-80 flex-col items-center justify-center gap-4 rounded-lg border border-border px-6 py-12 text-center">
      <EyeOffIcon className="size-6 text-muted-foreground" aria-hidden />
      <div className="max-w-sm space-y-1.5">
        <p className="font-medium">Spoiler warning</p>
        <p className="text-sm text-muted-foreground">
          Telemetry shows who was quicker and where. Haven&apos;t watched this Session yet? Come back after.
        </p>
      </div>
      <Button onClick={reveal} className="bg-success text-background hover:bg-success/85">
        <EyeIcon aria-hidden />
        Show telemetry
      </Button>
    </div>
  );
}
