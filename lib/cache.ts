// lib/cache.ts — caché central de métricas (solo en proceso)
// Port de la lógica de server.js + la variante SSE, ahora simplificado a un
// modelo de SONDEO pensado para Fluid compute de Vercel:
//   • refresco escalonado POR DEMANDA: tiempo real cada 30s, "hoy" cada 60s
//     y "semana" cada 5min (INTERVALO_*_MS). No hay setInterval de fondo:
//     el dato se refresca al pedirlo (/api/metrics) o desde el cron
//     (app/api/cron/refresh), de forma que ninguna respuesta mantiene una
//     petición abierta facturando memoria provisionada durante horas;
//   • en un proceso único, N televisores = 1 sola consulta a Genesys
//     (varias peticiones simultáneas comparten refrescoEnCurso);
//   • la caché compartida ENTRE instancias está en lib/store.ts (KV/Upstash).
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

export const INTERVALO_REFRESCO_MS = 30000;          // tiempo real
export const INTERVALO_HOY_MS = 60000;               // totales/rankings de hoy
export const INTERVALO_SEMANA_MS = 5 * 60000;        // totales/rankings de semana

// ── ESTADO EN globalThis ────────────────────────────────────
interface Trozo<T> {
    data: T;
    time: Date;
}

interface EstadoCache {
    tiempoReal: Trozo<MetricasBrutas['tiempoReal']> | null;
    hoy: Trozo<PartePeriodo> | null;
    semana: Trozo<PartePeriodo> | null;
    refrescoEnCurso: Promise<void> | null;
}

const estado = globalThis as unknown as Partial<EstadoCache> & {
    __dashboardGenesys?: EstadoCache;
};

if (!estado.__dashboardGenesys) {
    estado.__dashboardGenesys = {
        tiempoReal: null,
        hoy: null,
        semana: null,
        refrescoEnCurso: null
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

// JSON listo para la UI + marca de frescura en epoch ms.
// La frescura que importa es la del trozo de TIEMPO REAL (cadencia 30s);
// si esa consulta falló, se conserva la marca anterior.
export function payloadYMarca(): { json: string; guardadoEn: number } | null {
    const compuesto = componerMetricas();
    if (!compuesto) return null;
    const json = JSON.stringify(construirPayload(compuesto.data, compuesto.time));
    const marca = (est.tiempoReal?.time ?? compuesto.time).getTime();
    return { json, guardadoEn: marca };
}

// true cuando los tres trozos existen y ninguno está vencido: la instancia
// puede responder sin consultar Genesys ni leer la caché compartida.
export function localListo(): boolean {
    if (vencida(est.tiempoReal, INTERVALO_REFRESCO_MS)) return false;
    if (vencida(est.hoy, INTERVALO_HOY_MS)) return false;
    if (vencida(est.semana, INTERVALO_SEMANA_MS)) return false;
    return true;
}

// ── CONSULTA A GENESYS ──────────────────────────────────────
async function refrescarParte(parte: 'tiempoReal' | 'hoy' | 'semana'): Promise<void> {
    try {
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
// se duplicaría (60s en vez de 30s). 2s de margen no afecta a ninguna cadencia.
const TOLERANCIA_VENCIMIENTO_MS = 2000;

function vencida(trozo: Trozo<unknown> | null, intervaloMs: number): boolean {
    return !trozo || Date.now() - trozo.time.getTime() >= intervaloMs - TOLERANCIA_VENCIMIENTO_MS;
}

// Refresca SOLO los trozos vencidos según su cadencia (30s / 60s / 5min).
// Reutiliza el refresh en curso si ya hay uno (varias peticiones a la vez
// comparten una única consulta) y resuelve de inmediato si no toca nada.
export function refrescar(): Promise<void> {
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
        } catch (e) {
            console.error('❌ Error en el ciclo de refresco:', (e as Error).message);
        } finally {
            est.refrescoEnCurso = null;
        }
    })();

    return est.refrescoEnCurso;
}
