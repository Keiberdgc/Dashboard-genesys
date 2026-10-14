# AGENTS.md

Next.js 16 (App Router + TypeScript) dashboard for Genesys Cloud metrics. Migrated from the original Express + SSE app — payload shape, port and behavior are unchanged, except the realtime feed now **polls** `/api/metrics` every 30s instead of holding an open SSE connection (long-lived requests made Vercel bill *Fluid Provisioned Memory* 2GB × screen hours; polling keeps the same 30s freshness with millisecond-long requests); the UI was later re-skinned on a shadcn/ui + Tailwind design system that reproduces the original dark palette.

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
- Optional: `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (or legacy `KV_REST_API_URL`/`KV_REST_API_TOKEN`) enable the shared cache in `lib/store.ts`; without them the app runs on per-instance local cache only (local dev needs nothing).
- Optional: `CRON_SECRET` — Vercel sends it as `Authorization: Bearer` on cron invocations and the cron route enforces it when present (without it the route falls back to requiring Vercel's `x-vercel-cron-schedule` header). Generate with `openssl rand -hex 32` and add it as a Production env var in Vercel.
- Next.js loads `.env` natively for the app (no `dotenv`); only the `scripts/*.ts` CLI scripts load it manually via `process.loadEnvFile`.
- A `.gitignore` now exists — `.env*`, `.next/`, `node_modules/` are ignored. Never commit `.env`.
- Metrics API base URL is hardcoded to `https://api.mypurecloud.com/api/v2` in `lib/metrics.ts`, independent of `GENESYS_REGION`.

## Architecture

- `app/api/metrics/route.ts` — polling endpoint the UI calls every 30s. Decision order to keep Fluid cost low: (1) local cache if `localListo()`, (2) shared KV payload fresher than `INTERVALO_REFRESCO_MS`, (3) tiered local refresh + publish to KV. Keeps the legacy contract (503 with `{ok:false}` until the first data).
- `app/api/cron/refresh/route.ts` — Vercel cron (every minute, defined in `vercel.json`). Only does work when the KV payload is >5min old: while someone is watching, the pollers keep the KV fresh and the cron just reads it; when nobody watches it refreshes at most once per 5min (never once per minute overnight). Auth: `Authorization: Bearer ${CRON_SECRET}` when that env var exists, otherwise Vercel's `x-vercel-cron-schedule` header.
- `lib/cache.ts` — in-process cache on `globalThis` (survives dev HMR; one cache per instance on serverless). **Tiered refresh on demand**: `refrescar()` refreshes realtime every 30s, "hoy" totals/rankings every 60s, and "semana" every 5min (`INTERVALO_*_MS`), deduped across concurrent callers by `refrescoEnCurso`. There is **no background `setInterval`** anymore (nothing runs between requests, so nothing keeps an instance alive and billing memory); `localListo()`/`payloadYMarca()` serve the polling route. `construirPayload()` produces the exact payload shape the UI consumes; parts are composed by `componerMetricas()`.
- `lib/store.ts` — optional shared cache across instances via Upstash Redis REST (`UPSTASH_REDIS_REST_URL/TOKEN`, legacy `KV_REST_API_*` also accepted), key `dashboard:genesys:payload` with 10min TTL. Without env vars it is a no-op and everything still works with the per-instance local cache. Never throws: KV failures fall back to local.
- `lib/metrics.ts` — all Genesys analytics queries + aggregation into the payload shape. Queue UUIDs and `TZ_OFFSET_HOURS = -4` are hardcoded here; day/week interval math depends on that offset. Exposes `getParteTiempoReal()` / `getPartePeriodo('hoy'|'semana')` for the tiered loop and `getAllMetrics()` (composition of the three) for the CLI scripts. **Note:** the original `metrics.js` defined `getAgentAggregates` twice (second silently won); the port keeps only that second definition. Agent **names are cached 24h** on `globalThis` and fetched in batch (`GET /users?ids=...`, 50 per call, individual GET as fallback); per-agent abandons were folded into `getAgentAggregates` (`tAbandon`, voz queue only — verified identical vs. the old separate query) and the unused `tTalk`/`tAcw` metrics were dropped.
- `lib/auth.ts` — OAuth client-credentials token, **cached on `globalThis`** until ~60s before `expires_in` (one token fetch per expiry instead of one per refresh cycle).
- `app/page.tsx` — thin client orchestrator (~80 lines): `useMetricas()` (30s polling of `/api/metrics` with Page Visibility pause), `useReloj()`, active tab, and assembly of the pieces below. `types/metrics.ts` is shared by API and frontend.
- Design system (shadcn/ui + Tailwind v4):
  - `app/globals.css` — `@import 'tailwindcss'` + `@theme inline` mapping tokens to utilities. Semantic tokens (`--background`, `--card`, `--border`…) hold the GitHub-dark palette in `.dark`, plus **channel colors** `--voz` (verde), `--msg` (morado), `--cielo` (azul), `--oro`, `--peligro` exposed as `text-voz` / `bg-msg/15` / `border-oro/40`. The theme is **always dark**: `<html>` carries a fixed `dark` class (no `next-themes`).
  - `components/ui/` — shadcn primitives (`card`, `tabs`, `table`, `badge`, `separator`, `skeleton`, `spinner`), Base UI based. `badge.tsx` and `tabs.tsx` gained a `tono` (channel color) variant — edit cva variants there, never hardcode colors at the call site.
  - `components/dashboard/` — domain components: `dashboard-header`, `realtime-card`, `destacados-card`, `destacado-item`, `stat-box`, `tabs-nav`, `ranking-table`, `loading-screen`.
  - `config/tabs.ts` — single source of truth for the 6 views (canal, periodo, tono, icono, etiqueta); `listaTab()` derives the rows. `TONO_CLASES`/`TONO_FONDO` translate a token into a utility class.
  - `hooks/` — `use-metricas.ts` (30s polling of `/api/metrics`, pauses while the tab is hidden, immediate fetch on return, 5s retry on error), `use-reloj.ts` (clock `es-VE`).
  - Setup files: `components.json`, `postcss.config.mjs`, `lib/utils.ts` (`cn` from the `cn` package). Icons are `lucide-react`.
- `public/` — only `cabecera_dashboard.png` (the old `public/index.html` was replaced by the React app).
- Imports: `@/*` maps to the repo root (tsconfig `paths`); app/lib code uses `@/lib/...`, `@/types/...`, while `scripts/*.ts` use relative imports.

## Deployment

Vercel auto-detects the Next.js project. `vercel.json` exists **only** for the cron job (`/api/cron/refresh`, every minute); there is no routing config in it. The polling route sets `maxDuration = 60` in its segment config. Note: on Vercel each serverless instance keeps its own local cache and `lib/store.ts` (KV) bridges them; only a single self-hosted process (`next start`) guarantees the shared "1 Genesys query for all TVs" behavior by itself — on self-hosted the cron is unnecessary. After deploying, reload the TVs' tabs: a tab still running the old bundle keeps requesting `/api/stream`, which no longer exists. Comments and domain naming are in Spanish (`voz`/`msg`, `tiempoReal`); match that style.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
