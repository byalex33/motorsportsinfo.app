import { ViewTransition, type ReactNode } from "react";

/**
 * Wraps a page's <main> so route changes cross-fade: the old page fades out quickly while the
 * new page's own staggered entrance plays. Only enter/exit animate (default "none"), so updates
 * inside the page never trigger a view transition. Unsupported browsers just swap instantly.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <ViewTransition enter="page-enter" exit="page-exit" default="none">
      {children}
    </ViewTransition>
  );
}
