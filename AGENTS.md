# AGENTS.md

Next.js 16 (App Router + TypeScript) dashboard for Genesys Cloud metrics. Migrated from the original Express + SSE app — endpoints, payload shape, port, behavior, and visuals are unchanged.

## Commands

- `npm install` — only setup step.
- `npm run dev` — dev server on port **3010** (Turbopack; `-p 3010` is in the script).
- `npm run build` / `npm run start` — production build / server (also port 3010).
- `npm run typecheck` — `tsc --noEmit`. There is no lint or formatter.
- `npm run test:auth` — the only reliable check: verifies Genesys credentials by fetching an OAuth token. Requires env vars (below). Runs with `tsx` and loads `.env` itself (`scripts/env.ts`).
- `npm run test:metrics` / `npm run check:data` — readable summary / raw JSON dump of `getAllMetrics()`. Both need real credentials (the scripts were adapted to the current data shape during the migration).
- `npm test` is the npm placeholder (`exit 1`) — do not use it.

## Required env (`.env` at the repo root, never committed)

- `GENESYS_CLIENT_ID`, `GENESYS_CLIENT_SECRET`, `GENESYS_REGION` — read in `lib/auth.ts` (token endpoint is `https://login.<REGION>/oauth/token`).
- Next.js loads `.env` natively for the app (no `dotenv`); only the `scripts/*.ts` CLI scripts load it manually via `process.loadEnvFile`.
- A `.gitignore` now exists — `.env*`, `.next/`, `node_modules/` are ignored. Never commit `.env`.
- Metrics API base URL is hardcoded to `https://api.mypurecloud.com/api/v2` in `lib/metrics.ts`, independent of `GENESYS_REGION`.

## Architecture

- `app/api/stream/route.ts` — SSE endpoint (Web `ReadableStream`): sends the cached payload immediately to new clients, registers them, pings every 20s, cleans up on abort. Segment config: `dynamic = 'force-dynamic'`, `runtime = 'nodejs'`, `maxDuration = 300`.
- `lib/cache.ts` — in-process cache + SSE client registry on `globalThis` (survives dev HMR; one cache per instance on serverless). Refresh loop every 30s that pushes JSON to all connected clients (so many viewers = one Genesys query per Node process). `construirPayload()` produces the exact payload shape the UI consumes.
- `instrumentation.ts` — starts the refresh loop once when the server boots (the equivalent of the old module-scope `setInterval` in `server.js`); `app/api/metrics/route.ts` also ensures the loop as a serverless safety net.
- `lib/metrics.ts` — all Genesys analytics queries + aggregation into the payload shape. Queue UUIDs and `TZ_OFFSET_HOURS = -4` are hardcoded here; day/week interval math depends on that offset. **Note:** the original `metrics.js` defined `getAgentAggregates` twice (second silently won); the port keeps only that second definition.
- `lib/auth.ts` — OAuth client-credentials token. A fresh token is fetched on every refresh cycle (no caching).
- `app/page.tsx` — the whole dashboard as one client component (EventSource with the original manual 5s reconnect, clock, tabs, table). `app/globals.css` holds the original CSS verbatim; `types/metrics.ts` is shared by API and frontend.
- `app/api/metrics/route.ts` — legacy JSON endpoint (returns 503 until the first fetch succeeds, same contract as before).
- `public/` — only `cabecera_dashboard.png` (the old `public/index.html` was replaced by the React app).

## Deployment

Vercel auto-detects the Next.js project — there is deliberately **no `vercel.json`** (it used to route everything to `server.js`); `maxDuration: 300` lives in the stream route's segment config. The SSE handler sets `X-Accel-Buffering: no` and pings every 20s to survive Vercel/nginx buffering — keep those if you touch SSE. Note: on Vercel each serverless instance keeps its own cache; only a single self-hosted process (`next start`) guarantees the shared "1 Genesys query for all TVs" behavior. Comments and domain naming are in Spanish (`voz`/`msg`, `tiempoReal`); match that style.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
