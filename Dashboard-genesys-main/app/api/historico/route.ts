// app/api/historico/route.ts — consulta histórica bajo demanda
// Recibe ?desde=ISO&hasta=ISO (hora Venezuela → UTC ya convertido en el cliente)
// y devuelve totales + ranking para ese intervalo.
// No tiene caché: se llama solo cuando el usuario pide explícitamente un rango.
import { getHistorico } from '@/lib/historico';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request): Promise<Response> {
    const { searchParams } = new URL(req.url);
    const desde = searchParams.get('desde');
    const hasta = searchParams.get('hasta');

    if (!desde || !hasta) {
        return Response.json(
            { ok: false, error: 'Parámetros requeridos: desde, hasta (ISO 8601)' },
            { status: 400 }
        );
    }

    // Validación básica: deben ser fechas válidas
    if (isNaN(Date.parse(desde)) || isNaN(Date.parse(hasta))) {
        return Response.json(
            { ok: false, error: 'Formato de fecha inválido. Use ISO 8601.' },
            { status: 400 }
        );
    }

    if (new Date(desde) >= new Date(hasta)) {
        return Response.json(
            { ok: false, error: '"desde" debe ser anterior a "hasta".' },
            { status: 400 }
        );
    }

    try {
        const resultado = await getHistorico(desde, hasta);
        return Response.json({ ok: true, ...resultado });
    } catch (e) {
        const msg = (e as Error).message || 'Error desconocido';
        console.error('❌ Error en /api/historico:', msg);
        return Response.json({ ok: false, error: msg }, { status: 500 });
    }
}
