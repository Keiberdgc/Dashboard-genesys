// app/api/cron/refresh/route.ts — Precalentador de la caché compartida
// Vercel lo llama cada minuto (vercel.json). Solo hace trabajo cuando los
// datos tienen más de 5 min sin publicarse en la KV, es decir:
//   • CON gente mirando: los sondeos de /api/metrics mantienen la KV al
//     día y el cron se limita a leerla y no hace nada;
//   • SIN gente mirando: refresca como mucho una vez cada 5min (la KV se
//     actualiza y el siguiente minuto vuelve a saltar), así de madrugada
//     no se dispara una consulta a Genesys por minuto;
//   • el primer sondeo de la mañana encuentra la KV ya calentada.
// Autenticación: Vercel envía `Authorization: Bearer ${CRON_SECRET}` si
// existe la variable; sin ella se exige la cabecera x-vercel-cron-schedule
// que solo envía el propio Vercel.
import { refrescar, payloadYMarca } from '@/lib/cache';
import {
    estaConfigurado,
    guardarPayloadCompartido,
    leerPayloadCompartido
} from '@/lib/store';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// La KV deja de estar "caliente" a los 5min: los sondeos activos la
// reescriben cada ≤60s, así que 5min sin escribir = nadie está mirando.
const UMBRAL_CALIENTE_MS = 5 * 60000;

export async function GET(request: Request): Promise<Response> {
    const secreto = process.env.CRON_SECRET;
    const autorizacion = request.headers.get('authorization');
    const esCronDeVercel = request.headers.get('x-vercel-cron-schedule') !== null;
    if (secreto ? autorizacion !== `Bearer ${secreto}` : !esCronDeVercel) {
        return new Response('No autorizado', { status: 401 });
    }

    if (!estaConfigurado()) {
        return Response.json({ ok: false, motivo: 'Sin KV configurada (UPSTASH_REDIS_REST_URL/TOKEN)' });
    }

    const compartida = await leerPayloadCompartido();
    if (compartida && Date.now() - compartida.guardadoEn < UMBRAL_CALIENTE_MS) {
        // Datos recientes: los sondeos se bastan solos, no tocamos Genesys.
        return Response.json({ ok: true, motivo: 'KV al día' });
    }

    await refrescar();
    const local = payloadYMarca();
    if (!local) {
        return Response.json({ ok: false, error: 'Sin datos de Genesys' }, { status: 503 });
    }
    await guardarPayloadCompartido(local);
    console.log(`⏰ Cron: KV precalentada (${new Date(local.guardadoEn).toLocaleTimeString('es-VE')})`);
    return Response.json({ ok: true, guardadoEn: local.guardadoEn });
}
