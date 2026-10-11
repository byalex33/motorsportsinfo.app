"use client";

import { PageTransition } from "@/components/motion/page-transition";
import { RedFlag } from "@/components/red-flag";

// Any page that throws while rendering (e.g. a failed schedule read on a cold cache) lands here,
// inside the root layout: header and footer stay. `retry` re-fetches and re-renders the page.
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <PageTransition>
      <RedFlag error={error} retry={retry} />
    </PageTransition>
  );
}
