import { PHASE_PRODUCTION_BUILD } from "next/constants";

/**
 * Whether this render is `next build` prerendering. A build has no last good page to fall back on, so
 * pages that would throw to keep one show their unavailable state instead of failing the deploy.
 */
export function isProductionBuild(): boolean {
  return process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD;
}
