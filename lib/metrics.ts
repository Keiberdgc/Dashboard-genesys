// lib/metrics.ts — todas las consultas de analítica a Genesys + agregación
// Port de metrics.js (sin dotenv: Next.js carga .env/.env.local solo),
// optimizado en consumo: caché de token OAuth, caché de nombres de agente
// (lote), consultas fusionadas y partes con cadencia propia.
// Mismas colas UUID, mismo TZ_OFFSET_HOURS, mismo shape de salida.
import axios from 'axios';
import { getAccessToken } from './auth';
import type {
    GenesysResponse,
    MetricasBrutas,
    PartePeriodo,
    RankingAgents,
    Totales
} from '@/types/metrics';

const BASE_URL = 'https://api.mypurecloud.com/api/v2';
const QUEUES = {
    voz: 'eb8858d2-0bad-4834-b550-b9f583a68f37',
    msg: 'ea4452d3-dc89-4cb8-b19d-f2dae5e6d8e5'
};
const TZ_OFFSET_HOURS = -4;

// Filtro compartido por todas las consultas: las dos colas (voz + msg).
// Antes estaba copiado (predicates idénticos) en cada función de consulta.
const FILTRO_COLAS = {
    type: 'or' as const,
    predicates: [
        { dimension: 'queueId', value: QUEUES.voz },
        { dimension: 'queueId', value: QUEUES.msg }
    ]
};

// 'voz' si el grupo pertenece a la cola de voz, 'msg' en cualquier otro caso
function canalDe(queueId: string | undefined): 'voz' | 'msg' {
    return queueId === QUEUES.voz ? 'voz' : 'msg';
}

// ── HELPERS HTTP — Authorization/Content-Type en un solo lugar ──
async function genesysPost<T>(path: string, token: string, body: unknown): Promise<T> {
    const r = await axios.post<T>(`${BASE_URL}${path}`, body, {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
    });
    return r.data;
}

async function genesysGet<T>(path: string, token: string, params?: Record<string, string | number>): Promise<T> {
    const r = await axios.get<T>(`${BASE_URL}${path}`, {
        params,
        headers: { 'Authorization': `Bearer ${token}` }
    });
    return r.data;
}

function getIntervalHoy(): string {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setUTCHours(-TZ_OFFSET_HOURS, 0, 0, 0);
    if (midnight > now) midnight.setUTCDate(midnight.getUTCDate() - 1);
    return `${midnight.toISOString()}/${now.toISOString()}`;
}

function getIntervalSemana(): string {
    const now = new Date();
    const localNow = new Date(now.getTime() + TZ_OFFSET_HOURS * 3600000);
    const dow = localNow.getUTCDay();
    const diff = dow === 0 ? 6 : dow - 1;
    const monday = new Date(localNow);
    monday.setUTCDate(localNow.getUTCDate() - diff);
    monday.setUTCHours(0, 0, 0, 0);
    const mondayUTC = new Date(monday.getTime() - TZ_OFFSET_HOURS * 3600000);
    return `${mondayUTC.toISOString()}/${now.toISOString()}`;
}

// TIEMPO REAL — result.data es array directo de métricas
async function getRealtimeObservations(token: string): Promise<GenesysResponse> {
    const body = {
        filter: {
            type: 'and',
            clauses: [{ type: 'or', predicates: FILTRO_COLAS.predicates }]
        },
        metrics: ['oWaiting', 'oInteracting', 'oOnQueueUsers']
    };
    return genesysPost<GenesysResponse>('/analytics/queues/observations/query', token, body);
}

// Función para obtener totales de la cola (ofrecidas y abandonadas)
async function getQueueTotals(token: string, interval: string): Promise<GenesysResponse> {
    const body = {
        interval,
        groupBy: ['queueId', 'mediaType'],
        filter: FILTRO_COLAS,
        metrics: ['nOffered', 'tAbandon']
    };
    return genesysPost<GenesysResponse>('/analytics/conversations/aggregates/query', token, body);
}

// AGREGADOS POR AGENTE — tAnswered/tHandle/tAbandon en una sola consulta.
// (En metrics.js originales había DOS definiciones de getAgentAggregates;
//  gana la segunda — ésta — que es la que corre hoy en producción.
//  Las pérdidas por agente viajan aquí mismo: antes eran una consulta
//  aparte por periodo, ahora se piden juntas — 2 llamadas menos cada ciclo.)
async function getAgentAggregates(token: string, interval: string): Promise<GenesysResponse> {
    const body = {
        interval,
        groupBy: ['userId', 'queueId', 'mediaType'],
        filter: FILTRO_COLAS,
        // Aquí pedimos TODO lo necesario en una sola consulta
        // (tTalk/tAcw se pedían y no se usaban en ningún lado → fuera)
        metrics: ['tAnswered', 'tHandle', 'tAbandon']
    };
    return genesysPost<GenesysResponse>('/analytics/conversations/aggregates/query', token, body);
}

// ── CACHÉ DE NOMBRES DE AGENTES ──────────────────────────────
// Los nombres casi nunca cambian, pero antes se hacía un GET /users/{id}
// POR AGENTE en cada ciclo de 30s (era el ~88% de las peticiones a
// Genesys). Ahora se guardan 24h en globalThis (sobrevive al HMR de dev)
// y los faltantes se resuelven con UNA consulta en lote por cada 50 ids.
const TTL_NOMBRES_MS = 24 * 60 * 60 * 1000;
const TAM_LOTE_IDS = 50;

interface CacheNombres {
    nombres: Map<string, { nombre: string; ts: number }>;
}

const globalNombres = globalThis as unknown as { __nombresAgentes?: CacheNombres };
const cacheNombres: CacheNombres = (globalNombres.__nombresAgentes ??= { nombres: new Map() });

// NOMBRES DE AGENTES — caché + batch (fallback al GET individual de siempre)
async function getAgentNames(token: string, userIds: string[]): Promise<Record<string, string>> {
    const ids = [...new Set(userIds)];
    if (!ids.length) return {};

    const ahora = Date.now();
    const map: Record<string, string> = {};
    const faltan: string[] = [];
    for (const id of ids) {
        const guardado = cacheNombres.nombres.get(id);
        if (guardado && ahora - guardado.ts < TTL_NOMBRES_MS) map[id] = guardado.nombre;
        else faltan.push(id);
    }
    if (!faltan.length) return map;

    const guardar = (id: string, nombre: string) => {
        map[id] = nombre;
        cacheNombres.nombres.set(id, { nombre, ts: Date.now() });
    };

    // 1) Lote: GET /users?ids=a,b,c&fields=id,name (un puñado de ids por
    //    llamada, TODOS los lotes en paralelo — antes eran en serie)
    const sinResolver = new Set(faltan);
    const lotes: string[][] = [];
    for (let i = 0; i < faltan.length; i += TAM_LOTE_IDS) lotes.push(faltan.slice(i, i + TAM_LOTE_IDS));
    await Promise.all(lotes.map(async lote => {
        try {
            const r = await genesysGet<{ entities?: { id?: string; name?: string }[] }>('/users', token, {
                ids: lote.join(','), fields: 'id,name', pageSize: lote.length
            });
            for (const u of r.entities || []) {
                if (u.id && u.name) {
                    guardar(u.id, u.name);
                    sinResolver.delete(u.id);
                }
            }
        } catch { /* sigue el fallback individual de abajo */ }
    }));

    // 2) Fallback: los que el lote no devolvió → GET individual (sin caché
    //    del nombre de fallback, para reintentar en el próximo ciclo)
    await Promise.all([...sinResolver].map(async id => {
        try {
            const r = await genesysGet<{ name: string }>(`/users/${id}`, token, { fields: 'id,name' });
            guardar(id, r.name);
        } catch { map[id] = `Agente (${id.substring(0, 8)}...)`; }
    }));
    return map;
}

// PROCESAR TIEMPO REAL — result.data es array directo de métricas
function processRealtime(data: GenesysResponse): MetricasBrutas['tiempoReal'] {
    const info = {
        voz: { oWaiting: 0, oInteracting: 0, oOnQueueUsers: 0 },
        msg: { oWaiting: 0, oInteracting: 0, oOnQueueUsers: 0 }
    };
    data.results?.forEach(result => {
        const canal = canalDe(result.group?.queueId);
        result.data?.forEach(m => {
            const val = m.stats?.count || 0;
            switch (m.metric) {
                case 'oWaiting': info[canal].oWaiting += val; break;
                case 'oInteracting': info[canal].oInteracting += val; break;
                case 'oOnQueueUsers': info[canal].oOnQueueUsers += val; break;
            }
        });
    });
    return info;
}

// PROCESAR TOTALES DE COLA
function processQueueTotals(data: GenesysResponse): Totales {
    const result: Totales = {
        voz: { ofrecidas: 0, perdidas: 0 },
        msg: { ofrecidas: 0 }
    };
    data.results?.forEach(r => {
        const canal = canalDe(r.group?.queueId);
        r.data?.forEach(d => {
            d.metrics?.forEach(m => {
                const val = m.stats?.count || 0;
                switch (m.metric) {
                    case 'nOffered':
                        if (canal === 'voz') result.voz.ofrecidas += val;
                        else result.msg.ofrecidas += val;
                        break;
                    case 'tAbandon':
                        if (canal === 'voz') result.voz.perdidas += val;
                        break;
                }
            });
        });
    });
    return result;
}

// AGENTE INTERNO — acumulador antes de formatear (ms crudos)
interface AgenteInterno {
    nombre: string;
    voz: { manejadas: number; tHandle_sum: number; tHandle_count: number; perdidas: number };
    msg: { manejadas: number; tHandle_sum: number; tHandle_count: number };
    total: number;
}

// PROCESAR AGENTES — tHandle.sum/count para tiempo de manejo promedio
// (tAbandon viene fusionado en la misma consulta: solo se cuenta el de la
//  cola de voz, igual que la consulta de pérdidas anterior — voz + inbound)
function processAgentAggregates(
    aggregates: GenesysResponse,
    agentNames: Record<string, string>
): AgenteInterno[] {
    const map: Record<string, AgenteInterno> = {};

    aggregates.results?.forEach(result => {
        const userId = result.group?.userId;
        const queueId = result.group?.queueId;
        if (!userId) return;

        if (!map[userId]) {
            map[userId] = {
                nombre: agentNames[userId] || `Agente (${userId.substring(0, 8)}...)`,
                voz: { manejadas: 0, tHandle_sum: 0, tHandle_count: 0, perdidas: 0 },
                msg: { manejadas: 0, tHandle_sum: 0, tHandle_count: 0 },
                total: 0
            };
        }

        const canal = canalDe(queueId);
        const ag = map[userId];

        result.data?.forEach(d => {
            d.metrics?.forEach(m => {
                switch (m.metric) {
                    case 'tAnswered':
                        ag[canal].manejadas += m.stats?.count || 0;
                        break;
                    // Capturamos tanto la suma como el conteo de tHandle
                    case 'tHandle':
                        ag[canal].tHandle_sum += m.stats?.sum || 0;
                        ag[canal].tHandle_count += m.stats?.count || 0;
                        break;
                    // Pérdidas fusionadas: solo la cola de voz (antes: consulta
                    // aparte filtrada por voz + inbound)
                    case 'tAbandon':
                        if (canal === 'voz') ag.voz.perdidas += m.stats?.count || 0;
                        break;
                }
            });
        });

        ag.total = ag.voz.manejadas + ag.msg.manejadas;
    });

    return Object.values(map);
}

export function msToMinSeg(ms: number): string {
    if (!ms) return '0m 0s';
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function formatearAgente(a: AgenteInterno) {
    return {
        nombre: a.nombre,
        total: a.total,
        vozManejadas: a.voz.manejadas,
        msgManejadas: a.msg.manejadas,
        vozPerdidas: a.voz.perdidas || 0,
        // Promedio real: suma de tHandle / conteo de tHandle
        tManejoVoz: msToMinSeg(a.voz.tHandle_sum / (a.voz.tHandle_count || 1)),
        tManejoMsg: msToMinSeg(a.msg.tHandle_sum / (a.msg.tHandle_count || 1))
    };
}

// ── PARTES INDEPENDIENTES (refresco escalonado) ──────────────
// Cada parte se consulta con su propia cadencia desde lib/cache.ts:
// tiempoReal 30s, hoy 60s, semana 5min. Todas comparten el token (caché).

/** Tiempo real de las colas (en espera / en atención / en cola) */
export async function getParteTiempoReal(): Promise<MetricasBrutas['tiempoReal']> {
    const token = await getAccessToken();
    const rt = await getRealtimeObservations(token);
    return processRealtime(rt);
}

/** Totales de cola + ranking de agentes de un periodo ('hoy' | 'semana') */
export async function getPartePeriodo(periodo: 'hoy' | 'semana'): Promise<PartePeriodo> {
    const token = await getAccessToken();
    const interval = periodo === 'hoy' ? getIntervalHoy() : getIntervalSemana();

    const [tot, ag] = await Promise.all([
        getQueueTotals(token, interval),
        getAgentAggregates(token, interval)
    ]);

    const uids = (ag.results ?? [])
        .map(r => r.group?.userId)
        .filter((id): id is string => Boolean(id));
    const names = await getAgentNames(token, uids);
    const lista = processAgentAggregates(ag, names);

    // Cada agente se formatea UNA sola vez y el resultado se reutiliza en
    // todos los rankings (antes: ~2N llamadas a formatearAgente por ciclo)
    const formateados = new Map<AgenteInterno, ReturnType<typeof formatearAgente>>(
        lista.map(a => [a, formatearAgente(a)])
    );
    const fmt = (a: AgenteInterno) => formateados.get(a) ?? formatearAgente(a);

    const porTotal = (a: AgenteInterno[]) => [...a].sort((x, y) => y.total - x.total);
    const porVoz = (a: AgenteInterno[]) => [...a].sort((x, y) => y.voz.manejadas - x.voz.manejadas);
    const porMsg = (a: AgenteInterno[]) => [...a].sort((x, y) => y.msg.manejadas - x.msg.manejadas);

    const listaT = porTotal(lista), listaV = porVoz(lista), listaM = porMsg(lista);

    const armarRanking = (todos: AgenteInterno[], voz: AgenteInterno[], msg: AgenteInterno[]): RankingAgents => ({
        todos: todos.map(fmt),
        top5Voz: voz.slice(0, 5).map(fmt),
        top5Msg: msg.slice(0, 5).map(fmt),
        destacadoVoz: voz[0] ? fmt(voz[0]) : null,
        destacadoMsg: msg[0] ? fmt(msg[0]) : null
    });

    return {
        totales: processQueueTotals(tot),
        ranking: armarRanking(listaT, listaV, listaM)
    };
}

// Todas las partes de una vez — la usan los scripts CLI
// (`npm run check:data` / `test:metrics`) como antes.
export async function getAllMetrics(): Promise<MetricasBrutas> {
    const [tiempoReal, hoy, semana] = await Promise.all([
        getParteTiempoReal(),
        getPartePeriodo('hoy'),
        getPartePeriodo('semana')
    ]);

    return {
        tiempoReal,
        totalesHoy: hoy.totales,
        totalesSemana: semana.totales,
        hoy: hoy.ranking,
        semana: semana.ranking
    };
}
