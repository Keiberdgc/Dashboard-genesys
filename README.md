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

- `app/page.tsx` — el dashboard completo como componente cliente: `EventSource('/api/stream')` con reconexión manual a los 5s, reloj, tabs y tabla. `app/globals.css` conserva el CSS original sin cambios.
- `app/api/stream/route.ts` — SSE (ReadableStream): envía la caché inmediata, ping cada 20s, limpieza al desconectar, `maxDuration: 300`.
- `app/api/metrics/route.ts` — JSON legacy (503 hasta el primer fetch, mismo contrato que antes).
- `lib/cache.ts` — caché en memoria + clientes SSE en `globalThis`; refresco cada 30s con push a todos los conectados (10 televisores = 1 sola consulta a Genesys en un proceso único).
- `lib/metrics.ts` / `lib/auth.ts` — consultas de analítica y OAuth de Genesys (port literal del original).
- `types/metrics.ts` — tipos del payload compartidos entre API y frontend.
- `instrumentation.ts` — arranca el bucle de refresco al iniciar el servidor.

## Despliegue

- **Vercel**: detección automática de Next.js (no hay `vercel.json`; `maxDuration` va en la route). Cada instancia serverless mantiene su propia caché.
- **Servidor propio / LAN**: `npm run build && npm run start` → proceso único con caché compartida (misma semantics que el Express original).
