import { drizzle } from "drizzle-orm/pg-proxy";
import { describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import * as schema from "@/db/schema";
import { runAlerts } from "./run";

const vapid = { publicKey: "pub", privateKey: "priv", subject: "mailto:x@example.com" };
// Not on the hour, so the hourly housekeeping stays out of the way.
const NOW = new Date("2026-10-11T12:07:00Z");

type Rows = { sessions?: unknown[][]; changes?: unknown[][]; documents?: unknown[][] };

/**
 * A database that records every statement and answers the alerts cron's three "is anything due?" reads
 * with the given rows (positional, as the proxy driver expects). Everything else returns no rows.
 */
function fakeDb(rows: Rows = {}) {
  const statements: string[] = [];
  const db = drizzle(
    async (sql) => {
      statements.push(sql);
      if (/^select .* from "sessions" inner join "rounds" .*"sessions"."status" = /.test(sql)) {
        return { rows: rows.sessions ?? [] };
      }
      if (/^select .* from "schedule_changes"/.test(sql)) return { rows: rows.changes ?? [] };
      if (/^select .* from "fia_documents"/.test(sql)) return { rows: rows.documents ?? [] };
      return { rows: [] };
    },
    { schema },
  );
  const subscriptionReads = () => statements.filter((s) => /^select .* from "push_subscriptions"/.test(s)).length;
  return { db: db as unknown as Db, statements, subscriptionReads };
}

describe("runAlerts", () => {
  it("does not read any subscriptions when nothing is due", async () => {
    const { db, statements, subscriptionReads } = fakeDb();
    const result = await runAlerts(db, vapid, NOW);
    expect(subscriptionReads()).toBe(0);
    expect(statements).toHaveLength(3);
    expect(result).toEqual({
      reminders: { due: 0, sent: 0 },
      changes: { processed: 0, pushes: 0, sent: 0 },
      documents: { processed: 0, pushes: 0, sent: 0 },
      subscriptionsRemoved: 0,
    });
  });

  it("reads the subscriptions once when a Session is due for reminders", async () => {
    const startsAt = new Date(NOW.getTime() + 15 * 60_000).toISOString();
    const { db, subscriptionReads } = fakeDb({
      sessions: [["f1-2026-x-race", "f1", "race", "Race", startsAt, "scheduled", "Mexico City Grand Prix", true]],
    });
    await runAlerts(db, vapid, NOW);
    expect(subscriptionReads()).toBe(1);
  });

  it("reads the subscriptions only once when Schedule Changes and FIA Documents are both waiting", async () => {
    const { db, subscriptionReads } = fakeDb({
      changes: [[1, "f1-2026-x-race", "f1", "cancelled", "2026-10-12T20:00:00Z", null]],
      documents: [
        [
          "https://www.fia.com/sites/default/files/decision-document/doc_1.pdf",
          "f1",
          "Mexico City Grand Prix",
          1,
          "Doc 1",
          "other",
          "doc_1.pdf",
          null,
        ],
      ],
    });
    await runAlerts(db, vapid, NOW);
    expect(subscriptionReads()).toBe(1);
  });
});
