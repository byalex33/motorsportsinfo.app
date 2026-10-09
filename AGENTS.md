<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# motorsportsinfo.app

Read `CONTEXT.md` for the domain vocabulary (Series, Round, Featured Round, Session, Session Type, Circuit, Viewer Time, Track Time, Session Reminder, Schedule Change, Schedule Override) and use those exact terms in code and copy. Decisions live in `docs/adr/`.

- Stack: Next.js 16 App Router (`src/`), Tailwind 4, shadcn (base-nova) with the tweakcn Deep Purple theme in `src/app/globals.css`, Drizzle + Neon Postgres, Vercel (Pro) with crons in `vercel.ts`.
- Domain types: `src/domain/types.ts`; per-Series rules: `src/domain/series.ts`. Database schema: `src/db/schema.ts`.
- UI imports schedule data only from `src/server/schedule`, weather only from `src/server/weather` and Session Results only from `src/server/results`.
- `getDb()` returns null without `DATABASE_URL`; local dev must still render real data.
- Cron routes under `src/app/api/cron/*` require `Authorization: Bearer ${CRON_SECRET}`.
- Data/credit obligations (ADR 0001): show "Data: OpenF1", "Weather data by Open-Meteo.com", "Radar: RainViewer" credits; site stays non-commercial.
- Tests: `npm test` (vitest, `src/**/*.test.ts`). Checks: `npm run typecheck`, `npm run lint`, `npm run build`.
