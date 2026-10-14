// lib/cache.ts — caché central + emisor SSE
// Port de la lógica de server.js: el servidor consulta Genesys cada 30s
// por su cuenta y empuja el JSON a todos los clientes SSE conectados
// (10 televisores = 1 sola consulta a Genesys en un proceso único).
//
// El estado vive en globalThis para sobrevivir al HMR de `next dev`
// y para que cada instancia serverless mantenga su propia caché.
import { getAllMetrics } from './metrics';
import type { DashboardPayload, MetricasBrutas } from '@/types/metrics';

export const INTERVALO_REFRESCO_MS = 30000;

// ── ESTADO EN globalThis ────────────────────────────────────
export interface ClienteSSE {
    controller: ReadableStreamDefaultController<Uint8Array>;
    encoder: TextEncoder;
}

interface EstadoCache {
    cache: MetricasBrutas | null;
    cacheTime: Date | null;
    clientes: Set<ClienteSSE>;
    timer: ReturnType<typeof setInterval> | null;
    refrescoEnCurso: Promise<void> | null;
}

const estado = globalThis as unknown as Partial<EstadoCache> & {
    __dashboardGenesys?: EstadoCache;
};

if (!estado.__dashboardGenesys) {
    estado.__dashboardGenesys = {
        cache: null,
        cacheTime: null,
        clientes: new Set(),
        timer: null,
        refrescoEnCurso: null
    };
}

const est: EstadoCache = estado.__dashboardGenesys;

// ── PAYLOAD — idéntico a buildPayload() de server.js ────────
export function construirPayload(data: MetricasBrutas, cacheTime: Date | null): DashboardPayload {
    return {
        ok: true,
        timestamp: cacheTime?.toISOString() || new Date().toISOString(),
        tiempoReal: {
            voz: {
                enEspera: data.tiempoReal.voz.oWaiting || 0,
                enAtencion: data.tiempoReal.voz.oInteracting || 0,
                enCola: data.tiempoReal.voz.oOnQueueUsers || 0
            },
            msg: {
                enEspera: data.tiempoReal.msg.oWaiting || 0,
                enAtencion: data.tiempoReal.msg.oInteracting || 0,
                enCola: data.tiempoReal.msg.oOnQueueUsers || 0
            }
        },
        totalesHoy: data.totalesHoy,
        totalesSemana: data.totalesSemana,
        hoy: data.hoy,
        semana: data.semana
    };
}

export function obtenerCache(): { data: MetricasBrutas | null; time: Date | null } {
    return { data: est.cache, time: est.cacheTime };
}

export function payloadInicial(): string | null {
    if (!est.cache) return null;
    return JSON.stringify(construirPayload(est.cache, est.cacheTime));
}

// ── EMISIÓN A TODOS LOS CLIENTES SSE ────────────────────────
function emitir(payload: string): void {
    const muertos: ClienteSSE[] = [];
    est.clientes.forEach(c => {
        try {
            c.controller.enqueue(c.encoder.encode(`data: ${payload}\n\n`));
        } catch {
            // Cliente desconectado sin aviso: se marca para purga
            muertos.push(c);
        }
    });
    muertos.forEach(c => est.clientes.delete(c));
    console.log(`✅ Emitido a ${est.clientes.size} cliente(s) — ${(est.cacheTime || new Date()).toLocaleTimeString()}`);
}

// ── CONSULTA A GENESYS + PUSH ───────────────────────────────
// Reutiliza el refresh en curso si ya hay uno (evita dobles
// consultas cuando varios clientes conectan a la vez).
export function refrescarYEmitir(): Promise<void> {
    if (est.refrescoEnCurso) return est.refrescoEnCurso;

    est.refrescoEnCurso = (async () => {
        try {
            console.log('🔄 Consultando Genesys...');
            const data = await getAllMetrics();
            est.cache = data;
            est.cacheTime = new Date();
            emitir(JSON.stringify(construirPayload(data, est.cacheTime)));
        } catch (e) {
            console.error('❌ Error consultando Genesys:', (e as Error).message);
        } finally {
            est.refrescoEnCurso = null;
        }
    })();

    return est.refrescoEnCurso;
}

// Refresco solo si la caché está vacía o vencida (>30s).
// En serverless (Vercel) el timer de fondo puede no correr entre
// invocaciones; éste es el refresco garantizado al conectar.
export function refrescarSiVencida(): Promise<void> | null {
    const edad = est.cacheTime ? Date.now() - est.cacheTime.getTime() : Infinity;
    if (edad < INTERVALO_REFRESCO_MS) return null;
    return refrescarYEmitir();
}

// ── BUCLE DE REFRESCO (arranque del proceso) ────────────────
// Equivale a: refrescarYEmitir(); setInterval(refrescarYEmitir, 30000)
export function asegurarBucleRefresco(): void {
    if (est.timer) return;
    void refrescarYEmitir();
    est.timer = setInterval(() => void refrescarYEmitir(), INTERVALO_REFRESCO_MS);
}

// ── REGISTRO DE CLIENTES SSE ────────────────────────────────
export function registrarCliente(cliente: ClienteSSE): () => void {
    est.clientes.add(cliente);
    console.log(`📺 Cliente conectado. Total: ${est.clientes.size}`);

    return () => {
        if (est.clientes.delete(cliente)) {
            console.log(`📺 Cliente desconectado. Total: ${est.clientes.size}`);
        }
    };
}
