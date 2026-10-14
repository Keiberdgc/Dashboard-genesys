// lib/cache.ts — caché central + emisor SSE
// Port de la lógica de server.js, con tres mejoras de consumo:
//   • refresco escalonado: tiempo real cada 30s, hoy cada 60s, semana
//     cada 5min (antes TODO cada 30s → ~8 consultas+ a Genesys por tic);
//   • emisión SSE solo cuando el payload cambió (si no cambia: 0 bytes);
//   • apagado del bucle a los 5min sin espectadores (antes consultaba
//     24/7 aunque nadie mirara).
// En un proceso único, N televisores = 1 sola consulta a Genesys.
//
// El estado vive en globalThis para sobrevivir al HMR de `next dev`
// y para que cada instancia serverless mantenga su propia caché.
import { getPartePeriodo, getParteTiempoReal } from './metrics';
import type {
    DashboardPayload,
    MetricasBrutas,
    PartePeriodo,
    RankingAgents,
    Totales
} from '@/types/metrics';

export const INTERVALO_REFRESCO_MS = 30000;          // tic del bucle + tiempo real
export const INTERVALO_HOY_MS = 60000;               // totales/rankings de hoy
export const INTERVALO_SEMANA_MS = 5 * 60000;        // totales/rankings de semana
export const INACTIVIDAD_APAGADO_MS = 5 * 60000;     // sin clientes → se detiene el bucle

// ── ESTADO EN globalThis ────────────────────────────────────
export interface ClienteSSE {
    controller: ReadableStreamDefaultController<Uint8Array>;
    encoder: TextEncoder;
}

interface Trozo<T> {
    data: T;
    time: Date;
}

interface EstadoCache {
    tiempoReal: Trozo<MetricasBrutas['tiempoReal']> | null;
    hoy: Trozo<PartePeriodo> | null;
    semana: Trozo<PartePeriodo> | null;
    clientes: Set<ClienteSSE>;
    timer: ReturnType<typeof setInterval> | null;
    timerInactividad: ReturnType<typeof setTimeout> | null;
    refrescoEnCurso: Promise<void> | null;
    hashEmitido: string | null; // última emisión: solo se emite si cambia
}

const estado = globalThis as unknown as Partial<EstadoCache> & {
    __dashboardGenesys?: EstadoCache;
};

if (!estado.__dashboardGenesys) {
    estado.__dashboardGenesys = {
        tiempoReal: null,
        hoy: null,
        semana: null,
        clientes: new Set(),
        timer: null,
        timerInactividad: null,
        refrescoEnCurso: null,
        hashEmitido: null
    };
}

const est: EstadoCache = estado.__dashboardGenesys;

// Respaldo cuando una parte todavía no se ha consultado (arranque en frío)
const TOTALES_VACIOS: Totales = { voz: { ofrecidas: 0, perdidas: 0 }, msg: { ofrecidas: 0 } };
const RANKING_VACIO: RankingAgents = {
    todos: [], top5Voz: [], top5Msg: [], destacadoVoz: null, destacadoMsg: null
};

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

// Compone MetricasBrutas a partir de los trozos disponibles
// (timestamp = la actualización más reciente entre ellos)
function componerMetricas(): { data: MetricasBrutas; time: Date } | null {
    const { tiempoReal, hoy, semana } = est;
    if (!tiempoReal && !hoy && !semana) return null;

    const times = [tiempoReal?.time, hoy?.time, semana?.time]
        .filter((t): t is Date => t instanceof Date);
    const time = new Date(Math.max(...times.map(t => t.getTime())));

    return {
        data: {
            tiempoReal: tiempoReal?.data ?? {
                voz: { oWaiting: 0, oInteracting: 0, oOnQueueUsers: 0 },
                msg: { oWaiting: 0, oInteracting: 0, oOnQueueUsers: 0 }
            },
            totalesHoy: hoy?.data.totales ?? TOTALES_VACIOS,
            hoy: hoy?.data.ranking ?? RANKING_VACIO,
            totalesSemana: semana?.data.totales ?? TOTALES_VACIOS,
            semana: semana?.data.ranking ?? RANKING_VACIO
        },
        time
    };
}

export function obtenerCache(): { data: MetricasBrutas | null; time: Date | null } {
    const compuesto = componerMetricas();
    return { data: compuesto?.data ?? null, time: compuesto?.time ?? null };
}

export function payloadInicial(): string | null {
    const compuesto = componerMetricas();
    if (!compuesto) return null;
    return JSON.stringify(construirPayload(compuesto.data, compuesto.time));
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
    console.log(`✅ Emitido a ${est.clientes.size} cliente(s) — ${new Date().toLocaleTimeString()}`);
}

// Emite SOLO si los datos cambiaron desde la última emisión
// (el ping de 20s mantiene viva la conexión; si no cambió: 0 bytes)
function emitirSiCambia(): void {
    const compuesto = componerMetricas();
    if (!compuesto) return;

    const hash = JSON.stringify(compuesto.data);
    if (hash === est.hashEmitido) {
        console.log('⏳ Sin cambios — no se emite nada');
        return;
    }
    est.hashEmitido = hash;
    emitir(JSON.stringify(construirPayload(compuesto.data, compuesto.time)));
}

// ── CONSULTA A GENESYS + PUSH ───────────────────────────────
async function refrescarParte(parte: 'tiempoReal' | 'hoy' | 'semana'): Promise<void> {
    try {
        console.log(`🔄 Consultando Genesys (${parte})...`);
        // La marca de tiempo es el INICIO de la consulta: si se graba al
        // terminar, el tic de los 30s "llega" siempre ~0,7s antes de vencer
        // y la cadencia efectiva de tiempo real se duplicaría (60s).
        const time = new Date();
        if (parte === 'tiempoReal') {
            est.tiempoReal = { data: await getParteTiempoReal(), time };
        } else {
            est[parte] = { data: await getPartePeriodo(parte), time };
        }
    } catch (e) {
        console.error(`❌ Error consultando Genesys (${parte}):`, (e as Error).message);
    }
}

// Los timers de Node nunca disparan antes de tiempo, pero el jitter entre
// ticks hace que la edad en el borde sea ~30,000s ± latencia previa: sin
// tolerancia, un tic puede "quedar justo por debajo" y la cadencia efectiva
// se duplica (60s en vez de 30s). 2s de margen no afecta a ninguna cadencia.
const TOLERANCIA_VENCIMIENTO_MS = 2000;

function vencida(trozo: Trozo<unknown> | null, intervaloMs: number): boolean {
    return !trozo || Date.now() - trozo.time.getTime() >= intervaloMs - TOLERANCIA_VENCIMIENTO_MS;
}

// Reutiliza el refresh en curso si ya hay uno (evita dobles
// consultas cuando varios clientes conectan a la vez) y solo
// consulta los trozos que corresponde según su cadencia.
export function refrescarYEmitir(): Promise<void> {
    if (est.refrescoEnCurso) return est.refrescoEnCurso;

    // Decidir QUÉ refrescar FUERA de la IIFE: si no hay nada vencido se
    // sale sin tocar refrescoEnCurso. (Un ciclo vacío se completaría de
    // forma síncrona: la finally correría ANTES de la asignación y la
    // promesa quedaría "trabada" para siempre, anulando todos los ticks.)
    const pendientes: Promise<void>[] = [];
    if (vencida(est.tiempoReal, INTERVALO_REFRESCO_MS)) pendientes.push(refrescarParte('tiempoReal'));
    if (vencida(est.hoy, INTERVALO_HOY_MS)) pendientes.push(refrescarParte('hoy'));
    if (vencida(est.semana, INTERVALO_SEMANA_MS)) pendientes.push(refrescarParte('semana'));

    if (!pendientes.length) return Promise.resolve();

    est.refrescoEnCurso = (async () => {
        try {
            await Promise.all(pendientes);
            emitirSiCambia();
        } catch (e) {
            console.error('❌ Error en el ciclo de refresco:', (e as Error).message);
        } finally {
            est.refrescoEnCurso = null;
        }
    })();

    return est.refrescoEnCurso;
}

// Refresco solo si algún trozo está vencido.
// En serverless (Vercel) el timer de fondo puede no correr entre
// invocaciones; éste es el refresco garantizado al conectar.
export function refrescarSiVencida(): Promise<void> | null {
    const algunaVencida =
        vencida(est.tiempoReal, INTERVALO_REFRESCO_MS) ||
        vencida(est.hoy, INTERVALO_HOY_MS) ||
        vencida(est.semana, INTERVALO_SEMANA_MS);
    if (!algunaVencida) return null;
    return refrescarYEmitir();
}

// ── BUCLE DE REFRESCO (arranque del proceso) ────────────────
// Un único setInterval cada 30s: cada tic decide qué trozo toca
// según su cadencia (30s / 60s / 5min).
export function asegurarBucleRefresco(): void {
    cancelarApagadoPorInactividad();
    if (!est.timer) {
        void refrescarYEmitir();
        est.timer = setInterval(() => void refrescarYEmitir(), INTERVALO_REFRESCO_MS);
    }
    // Si nadie está mirando (arranque en frío, poller legacy), programar
    // el apagado: sin clientes durante INACTIVIDAD_APAGADO_MS → se para.
    if (est.clientes.size === 0) programarApagadoPorInactividad();
}

// ── APAGADO POR INACTIVIDAD ─────────────────────────────────
// Sin espectadores durante INACTIVIDAD_APAGADO_MS se detiene el
// bucle: 0 peticiones a Genesys de madrugada/fines de semana.
// El próximo cliente que conecte lo reanuda (asegurarBucleRefresco).
function cancelarApagadoPorInactividad(): void {
    if (est.timerInactividad) {
        clearTimeout(est.timerInactividad);
        est.timerInactividad = null;
    }
}

function programarApagadoPorInactividad(): void {
    if (est.timerInactividad || !est.timer) return;
    est.timerInactividad = setTimeout(() => {
        est.timerInactividad = null;
        if (est.clientes.size === 0 && est.timer) {
            clearInterval(est.timer);
            est.timer = null;
            console.log('😴 Sin espectadores: bucle de refresco detenido (se reanuda al conectar alguien)');
        }
    }, INACTIVIDAD_APAGADO_MS);
}

// ── REGISTRO DE CLIENTES SSE ────────────────────────────────
export function registrarCliente(cliente: ClienteSSE): () => void {
    cancelarApagadoPorInactividad();
    est.clientes.add(cliente);
    console.log(`📺 Cliente conectado. Total: ${est.clientes.size}`);

    return () => {
        if (est.clientes.delete(cliente)) {
            console.log(`📺 Cliente desconectado. Total: ${est.clientes.size}`);
            if (est.clientes.size === 0) programarApagadoPorInactividad();
        }
    };
}
