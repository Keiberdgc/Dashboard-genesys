// app/api/stream/route.ts — Endpoint SSE
// Sustituye a app.get('/api/stream') de server.js: mismas cabeceras,
// envío inmediato de la caché al nuevo cliente, ping cada 20s y
// limpieza cuando el cliente se desconecta.
import {
    asegurarBucleRefresco,
    payloadInicial,
    refrescarSiVencida,
    registrarCliente,
    type ClienteSSE
} from '@/lib/cache';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

const INTERVALO_PING_MS = 20000;

export async function GET(request: Request): Promise<Response> {
    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
        start(controller) {
            const cliente: ClienteSSE = { controller, encoder };

            // Comentario SSE inicial: fuerza el envío inmediato de las
            // cabeceras (equivalente a res.flushHeaders() de server.js;
            // sin él, Next retendría las cabeceras hasta el primer byte).
            // EventSource los ignora.
            try {
                controller.enqueue(encoder.encode(': connected\n\n'));
            } catch { /* cliente desechado */ }

            // Si ya hay datos en caché, enviarlos de inmediato al nuevo cliente
            const inicial = payloadInicial();
            if (inicial) {
                try {
                    controller.enqueue(encoder.encode(`data: ${inicial}\n\n`));
                } catch { /* cliente desechado */ }
            }

            // Registrar este cliente
            const desregistrar = registrarCliente(cliente);

            // Asegurar el bucle de refresco (30s) y traer datos si la
            // caché está vacía o vencida (arranque en frío / serverless)
            asegurarBucleRefresco();
            void refrescarSiVencida();

            // Ping cada 20s para mantener la conexión viva (como en server.js)
            const ping = setInterval(() => {
                try {
                    controller.enqueue(encoder.encode(': ping\n\n'));
                } catch {
                    clearInterval(ping);
                    desregistrar();
                }
            }, INTERVALO_PING_MS);

            // Limpiar cuando el cliente se desconecta
            const limpiar = () => {
                clearInterval(ping);
                desregistrar();
                try { controller.close(); } catch { /* ya cerrado */ }
            };
            request.signal.addEventListener('abort', limpiar);
        },
        cancel() {
            // El cliente abortó la conexión (EventSource cerrado)
        }
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no' // importante para Vercel/nginx
        }
    });
}
