// app/api/metrics/route.ts — Endpoint de sondeo (la UI lo consulta cada 30s)
// Sustituye al SSE de app/api/stream: la conexión abierta mantenía una
// petición EN VUELO continua y Vercel facturaba la memoria provisionada
// 2GB × horas de pantalla; con sondeo la petición dura milisegundos.
// Orden de decisión para minimizar coste en Fluid:
//   1. caché local de la instancia, si está al día → 0 llamadas;
//   2. caché compartida (KV) reciente (<30s) → sin tocar Genesys;
//   3. refresco local escalonado (30s/60s/5min) + publicar en la KV.
// Mantiene el contrato legacy: 503 con { ok:false } mientras no haya datos.
import {
    INTERVALO_REFRESCO_MS,
    localListo,
    payloadYMarca,
    refrescar
} from '@/lib/cache';
import { guardarPayloadCompartido, leerPayloadCompartido } from '@/lib/store';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function json(jsonTexto: string): Response {
    return new Response(jsonTexto, {
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store'
        }
    });
}

export async function GET(): Promise<Response> {
    // 1) ¿La caché local de esta instancia está al día?
    if (localListo()) {
        const local = payloadYMarca();
        if (local) return json(local.json);
    }

    // 2) ¿Alguien (el cron u otra instancia) refrescó la KV hace <30s?
    const compartida = await leerPayloadCompartido();
    if (compartida && Date.now() - compartida.guardadoEn < INTERVALO_REFRESCO_MS) {
        return json(compartida.json);
    }

    // 3) Refresco local (solo trozos vencidos) y publicación en la KV
    await refrescar();
    const local = payloadYMarca();
    if (!local) {
        return Response.json({ ok: false, error: 'Cargando...' }, { status: 503 });
    }
    await guardarPayloadCompartido(local);
    return json(local.json);
}
