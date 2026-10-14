# AGENTS.md

Next.js 16 (App Router + TypeScript) dashboard for Genesys Cloud metrics. Migrated from the original Express + SSE app — endpoints, payload shape, port and behavior are unchanged; the UI was later re-skinned on a shadcn/ui + Tailwind design system that reproduces the original dark palette.

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
- `lib/cache.ts` — in-process cache + SSE client registry on `globalThis` (survives dev HMR; one cache per instance on serverless). **Tiered refresh loop**: a single 30s tick refreshes realtime every 30s, "hoy" totals/rankings every 60s, and "semana" every 5min (`INTERVALO_*_MS`). It pushes JSON to all connected clients **only when the payload actually changed** (`hashEmitido`; the 20s SSE ping keeps connections alive) and **stops itself after 5min with zero clients** (`INACTIVIDAD_APAGADO_MS`), resuming on the next connect. `construirPayload()` produces the exact payload shape the UI consumes; parts are composed by `componerMetricas()`.
- `instrumentation.ts` — starts the refresh loop once when the server boots (the equivalent of the old module-scope `setInterval` in `server.js`); `app/api/metrics/route.ts` also ensures the loop as a serverless safety net.
- `lib/metrics.ts` — all Genesys analytics queries + aggregation into the payload shape. Queue UUIDs and `TZ_OFFSET_HOURS = -4` are hardcoded here; day/week interval math depends on that offset. Exposes `getParteTiempoReal()` / `getPartePeriodo('hoy'|'semana')` for the tiered loop and `getAllMetrics()` (composition of the three) for the CLI scripts. **Note:** the original `metrics.js` defined `getAgentAggregates` twice (second silently won); the port keeps only that second definition. Agent **names are cached 24h** on `globalThis` and fetched in batch (`GET /users?ids=...`, 50 per call, individual GET as fallback); per-agent abandons were folded into `getAgentAggregates` (`tAbandon`, voz queue only — verified identical vs. the old separate query) and the unused `tTalk`/`tAcw` metrics were dropped.
- `lib/auth.ts` — OAuth client-credentials token, **cached on `globalThis`** until ~60s before `expires_in` (one token fetch per expiry instead of one per refresh cycle).
- `app/page.tsx` — thin client orchestrator (~80 lines): `useMetricas()` (EventSource with the original manual 5s reconnect), `useReloj()`, active tab, and assembly of the pieces below. `types/metrics.ts` is shared by API and frontend.
- Design system (shadcn/ui + Tailwind v4):
  - `app/globals.css` — `@import 'tailwindcss'` + `@theme inline` mapping tokens to utilities. Semantic tokens (`--background`, `--card`, `--border`…) hold the GitHub-dark palette in `.dark`, plus **channel colors** `--voz` (verde), `--msg` (morado), `--cielo` (azul), `--oro`, `--peligro` exposed as `text-voz` / `bg-msg/15` / `border-oro/40`. The theme is **always dark**: `<html>` carries a fixed `dark` class (no `next-themes`).
  - `components/ui/` — shadcn primitives (`card`, `tabs`, `table`, `badge`, `separator`, `skeleton`, `spinner`), Base UI based. `badge.tsx` and `tabs.tsx` gained a `tono` (channel color) variant — edit cva variants there, never hardcode colors at the call site.
  - `components/dashboard/` — domain components: `dashboard-header`, `realtime-card`, `destacados-card`, `destacado-item`, `stat-box`, `tabs-nav`, `ranking-table`, `loading-screen`.
  - `config/tabs.ts` — single source of truth for the 6 views (canal, periodo, tono, icono, etiqueta); `listaTab()` derives the rows. `TONO_CLASES`/`TONO_FONDO` translate a token into a utility class.
  - `hooks/` — `use-sse.ts` (payload + 5s reconnect), `use-reloj.ts` (clock `es-VE`).
  - Setup files: `components.json`, `postcss.config.mjs`, `lib/utils.ts` (`cn` from the `cn` package). Icons are `lucide-react`.
- `app/api/metrics/route.ts` — legacy JSON endpoint (returns 503 until the first fetch succeeds, same contract as before).
- `public/` — only `cabecera_dashboard.png` (the old `public/index.html` was replaced by the React app).
- Imports: `@/*` maps to the repo root (tsconfig `paths`); app/lib code uses `@/lib/...`, `@/types/...`, while `scripts/*.ts` use relative imports.

## Deployment

Vercel auto-detects the Next.js project — there is deliberately **no `vercel.json`** (it used to route everything to `server.js`); `maxDuration: 300` lives in the stream route's segment config. The SSE handler sets `X-Accel-Buffering: no` and pings every 20s to survive Vercel/nginx buffering — keep those if you touch SSE. Note: on Vercel each serverless instance keeps its own cache; only a single self-hosted process (`next start`) guarantees the shared "1 Genesys query for all TVs" behavior. Comments and domain naming are in Spanish (`voz`/`msg`, `tiempoReal`); match that style.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
