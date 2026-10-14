// app/api/metrics/route.ts — Endpoint legacy (por si acaso)
// Mismo contrato que en server.js: 503 mientras no haya caché.
import { asegurarBucleRefresco, construirPayload, obtenerCache } from '@/lib/cache';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
    // Garantiza que el bucle de refresco esté corriendo (arranque en
    // frío de serverless o si instrumentation no llegó a ejecutarse)
    asegurarBucleRefresco();

    const { data, time } = obtenerCache();
    if (!data) {
        return Response.json({ ok: false, error: 'Cargando...' }, { status: 503 });
    }
    return Response.json(construirPayload(data, time));
}
