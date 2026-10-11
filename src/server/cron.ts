// Shared guard for the cron routes and /api/status: `Authorization: Bearer ${CRON_SECRET}`.
import { timingSafeEqual } from "node:crypto";

/** True when the request carries the cron secret. Always false while CRON_SECRET is unset. Compared in constant time. */
export function isCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
