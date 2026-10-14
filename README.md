# Dashboard-genesys

Dashboard de métricas de Genesys Cloud (Voz_Soporte / MSG_Soporte) en tiempo real. Construido con **Next.js 16** (App Router + TypeScript), migrado desde el servidor Express + SSE original sin perder funcionalidad: mismos endpoints, mismo payload, mismo aspecto y mismo puerto.

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
```

Next.js las carga automáticamente (no hace falta `dotenv`). Los scripts CLI (`npm run test:*`) cargan el `.env` por su cuenta.

## Arquitectura

- `app/page.tsx` — orquestador delgudo (componente cliente): `EventSource('/api/stream')` con reconexión manual a los 5s (`hooks/use-sse.ts`), reloj (`hooks/use-reloj.ts`) y ensamblado de las piezas. El render vive en `components/dashboard/*` y el sistema de diseño (shadcn/ui + Tailwind v4, tokens en `app/globals.css`) en `components/ui/*`.
- `app/api/stream/route.ts` — SSE (ReadableStream): envía la caché inmediata, ping cada 20s, limpieza al desconectar, `maxDuration: 300`.
- `app/api/metrics/route.ts` — JSON legacy (503 hasta el primer fetch, mismo contrato que antes).
- `lib/cache.ts` — caché en memoria + clientes SSE en `globalThis`; refresco **escalonado** (tiempo real cada 30s, hoy cada 60s, semana cada 5min) con push a todos los conectados, **emisión solo si el payload cambió** y **apagado del bucle a los 5min sin espectadores** (se reanuda al conectar un cliente). 10 televisores = 1 sola consulta a Genesys en un proceso único.
- `lib/metrics.ts` / `lib/auth.ts` — consultas de analítica y OAuth de Genesys. Token OAuth **cacheado** hasta ~60s antes de expirar y nombres de agente **cacheados 24h** (resueltos en lote con `GET /users?ids=...`); las pérdidas por agente se piden fusionadas en `getAgentAggregates` (`tAbandon`). `getAllMetrics()` sigue existiendo para los scripts CLI.
- `types/metrics.ts` — tipos del payload compartidos entre API y frontend.
- `instrumentation.ts` — arranca el bucle de refresco al iniciar el servidor.

## Despliegue

- **Vercel**: detección automática de Next.js (no hay `vercel.json`; `maxDuration` va en la route). Cada instancia serverless mantiene su propia caché.
- **Servidor propio / LAN**: `npm run build && npm run start` → proceso único con caché compartida (misma semantics que el Express original).
