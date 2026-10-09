# motorsportsinfo.app

When each Session runs and what the weather will do, for F1, F2, F3 and WEC.

- Domain vocabulary: [CONTEXT.md](CONTEXT.md)
- Decisions: [docs/adr](docs/adr)

## Develop

```bash
npm install
npm run dev
```

Without `DATABASE_URL` the site fetches the schedule sources live (memoised for 15 minutes), so it renders real data locally. Push reminders need a database and VAPID keys. See [.env.example](.env.example).

Checks: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`.

## How it fits together

| Area | Where |
|---|---|
| Domain types and per-Series rules | `src/domain/` |
| Schedule sources, sync, Featured Round | `src/server/schedule/`, `src/app/api/cron/sync/` |
| Circuits and Schedule Overrides (edit by hand) | `src/data/circuits.ts`, `src/data/overrides.ts` |
| Weather (Open-Meteo) | `src/server/weather/`, `src/components/weather/` |
| Rain radar (RainViewer on OpenFreeMap) | `src/components/radar/` |
| Session Reminders, Schedule Change pushes, calendar feeds | `src/server/alerts/`, `src/app/alerts/`, `src/app/calendar/`, `src/app/api/cron/alerts/` |
| Analytics (Tracwell) | `src/lib/analytics.ts` |
| Database schema (Drizzle + Neon) | `src/db/schema.ts` |

Crons are in `vercel.ts`:
- `/api/cron/sync` runs every 5 minutes and decides per Series whether a source check is due.
- `/api/cron/alerts` runs every minute and sends due pushes.

Both require `Authorization: Bearer $CRON_SECRET`. To force a check by hand, call `/api/cron/sync?series=f1&force=1` with that header.

## Correcting a Session by hand

Add an entry to `src/data/overrides.ts` (Session id, new time or status, reason), then commit and deploy. It takes precedence over the source until you remove it.
