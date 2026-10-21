# Dashboard-genesys

Dashboard de métricas de Genesys Cloud (Voz_Soporte / MSG_Soporte) en tiempo real. Construido con **Next.js 16** (App Router + TypeScript), migrado desde el servidor Express + SSE original sin perder funcionalidad: mismo payload, mismo aspecto y mismo puerto. El tiempo real ahora llega por **sondeo a `/api/metrics` cada 30s** en lugar de una conexión SSE abierta — misma frescura (los datos cambian como máximo cada 30s), pero sin mantener una petición en vuelo que en Vercel facturaba *Fluid Provisioned Memory* 2GB × horas de pantalla.

## Comandos

| Comando | Descripción |
|---|---|
| `npm install` | Único paso de setup |
| `npm run dev` | Servidor de desarrollo en el puerto **3010** |
| `npm run build` | Build de producción |
| `npm run start` | Servidor de producción en el puerto **3010** |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test:auth` | Verifica las credenciales de Genesys (obtiene un token OAuth) |
| `npm run test:metrics` | Resumen legible de todas las métricas |
| `npm run check:data` | Volcado JSON de todas las métricas |

`npm test` es el placeholder de npm (`exit 1`) — no se usa. No hay lint ni formatter.

## Variables de entorno

Crea un `.env` en la raíz (nunca se commitea; `.gitignore` lo excluye):

```
GENESYS_CLIENT_ID=...
GENESYS_CLIENT_SECRET=...
GENESYS_REGION=usw2.pure.cloud

# Opcional — caché compartida entre instancias (integración Upstash Redis en Vercel)
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...

# Opcional — protege /api/cron/refresh (Vercel la envía automáticamente si existe)
CRON_SECRET=...
```

Next.js las carga automáticamente (no hace falta `dotenv`). Los scripts CLI (`npm run test:*`) cargan el `.env` por su cuenta. Sin variables de Upstash todo funciona igual, pero solo con la caché local de cada instancia.

## Arquitectura

- `app/page.tsx` — orquestador delgudo (componente cliente): `useMetricas()` (`hooks/use-metricas.ts`: sondeo de `/api/metrics` cada 30s, en pausa con la pestaña oculta), reloj (`hooks/use-reloj.ts`) y ensamblado de las piezas. El render vive en `components/dashboard/*` y el sistema de diseño (shadcn/ui + Tailwind v4, tokens en `app/globals.css`) en `components/ui/*`.
- `app/api/metrics/route.ts` — endpoint de sondeo. Orden para minimizar coste Fluid: 1) caché local si está al día (0 llamadas), 2) KV compartida de <30s (sin tocar Genesys), 3) refresco escalonado + publicación en la KV. Mantiene el contrato legacy (503 con `{ok:false}` hasta el primer dato).
- `app/api/cron/refresh/route.ts` — cron de 1 min (definido en `vercel.json`). Solo refresca cuando la KV tiene >5min sin publicarse: con gente mirando los sondeos la mantienen al día y el cron no hace nada; sin nadie, como mucho un refresco cada 5min (nada de madrugada a cada minuto).
- `lib/cache.ts` — caché en memoria en `globalThis`; refresco **escalonado por demanda** (tiempo real cada 30s, hoy cada 60s, semana cada 5min). No hay `setInterval` de fondo: nada se ejecuta entre peticiones, así que ninguna respuesta mantiene una instancia facturando. Varias peticiones simultáneas comparten un único refresh (`refrescoEnCurso`) → 10 televisores = 1 sola consulta a Genesys en un proceso único.
- `lib/store.ts` — caché **compartida entre instancias** (Redis REST de Upstash, opcional). Publica el payload con TTL de 10min para que las instancias frías respondan al instante y para que el cron pueda precalentarla.
- `lib/metrics.ts` / `lib/auth.ts` — consultas de analítica y OAuth de Genesys. Token OAuth **cacheado** hasta ~60s antes de expirar y nombres de agente **cacheados 24h** (resueltos en lote con `GET /users?ids=...`); las pérdidas por agente se piden fusionadas en `getAgentAggregates` (`tAbandon`). `getAllMetrics()` sigue existiendo para los scripts CLI.
- `types/metrics.ts` — tipos del payload compartidos entre API y frontend.

## Despliegue

- **Vercel**: detección automática de Next.js. `vercel.json` solo define el cron de precalentamiento. Cada instancia serverless mantiene su propia caché local y la KV la comparte. Consejo: tras desplegar, **recarga las pestañas de los televisores** (si alguna quedó con el bundle viejo seguirá intentando `/api/stream`, que ya no existe).
- **Servidor propio / LAN**: `npm run build && npm run start` → proceso único con caché compartida (misma semantics que el Express original; el cron no hace falta).
