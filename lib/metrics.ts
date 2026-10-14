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
            clauses: [{
                type: 'or',
                predicates: [
                    { dimension: 'queueId', value: QUEUES.voz },
                    { dimension: 'queueId', value: QUEUES.msg }
                ]
            }]
        },
        metrics: ['oWaiting', 'oInteracting', 'oOnQueueUsers']
    };
    const r = await axios.post<GenesysResponse>(`${BASE_URL}/analytics/queues/observations/query`, body,
        { headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } });
    return r.data;
}

// Función para obtener totales de la cola (ofrecidas y abandonadas)
async function getQueueTotals(token: string, interval: string): Promise<GenesysResponse> {
    const body = {
        interval,
        groupBy: ['queueId', 'mediaType'],
        filter: {
            type: 'or',
            predicates: [
                { dimension: 'queueId', value: QUEUES.voz },
                { dimension: 'queueId', value: QUEUES.msg }
            ]
        },
        metrics: ['nOffered', 'tAbandon']
    };
    const r = await axios.post<GenesysResponse>(`${BASE_URL}/analytics/conversations/aggregates/query`, body,
        { headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } });
    return r.data;
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
        filter: {
            type: 'or',
            predicates: [
                { dimension: 'queueId', value: QUEUES.voz },
                { dimension: 'queueId', value: QUEUES.msg }
            ]
        },
        // Aquí pedimos TODO lo necesario en una sola consulta
        // (tTalk/tAcw se pedían y no se usaban en ningún lado → fuera)
        metrics: ['tAnswered', 'tHandle', 'tAbandon']
    };
    const r = await axios.post<GenesysResponse>(`${BASE_URL}/analytics/conversations/aggregates/query`, body,
        { headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } });
    return r.data;
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
async function getAgentNames(token: string, userIds: (string | undefined)[]): Promise<Record<string, string>> {
    const ids = [...new Set(userIds)].filter(Boolean) as string[];
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

    // 1) Lote: GET /users?ids=a,b,c&fields=id,name (un puñado de ids por llamada)
    const sinResolver = new Set(faltan);
    for (let i = 0; i < faltan.length; i += TAM_LOTE_IDS) {
        const lote = faltan.slice(i, i + TAM_LOTE_IDS);
        try {
            const r = await axios.get<{ entities?: { id?: string; name?: string }[] }>(`${BASE_URL}/users`, {
                params: { ids: lote.join(','), fields: 'id,name', pageSize: lote.length },
                headers: { 'Authorization': `Bearer ${token}` }
            });
            for (const u of r.data.entities || []) {
                if (u.id && u.name) {
                    guardar(u.id, u.name);
                    sinResolver.delete(u.id);
                }
            }
        } catch { /* sigue el fallback individual de abajo */ }
    }

    // 2) Fallback: los que el lote no devolvió → GET individual (sin caché
    //    del nombre de fallback, para reintentar en el próximo ciclo)
    await Promise.all([...sinResolver].map(async id => {
        try {
            const r = await axios.get<{ name: string }>(`${BASE_URL}/users/${id}?fields=id,name`,
                { headers: { 'Authorization': `Bearer ${token}` } });
            guardar(id, r.data.name);
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
        const canal = result.group?.queueId === QUEUES.voz ? 'voz' : 'msg';
        result.data?.forEach(m => {
            const val = m.stats?.count || 0;
            if (m.metric === 'oWaiting') info[canal].oWaiting += val;
            if (m.metric === 'oInteracting') info[canal].oInteracting += val;
            if (m.metric === 'oOnQueueUsers') info[canal].oOnQueueUsers += val;
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
        const canal = r.group?.queueId === QUEUES.voz ? 'voz' : 'msg';
        r.data?.forEach(d => {
            d.metrics?.forEach(m => {
                if (m.metric === 'nOffered' && canal === 'voz') result.voz.ofrecidas += m.stats?.count || 0;
                if (m.metric === 'nOffered' && canal === 'msg') result.msg.ofrecidas += m.stats?.count || 0;
                if (m.metric === 'tAbandon' && canal === 'voz') result.voz.perdidas += m.stats?.count || 0;
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

        const canal = queueId === QUEUES.voz ? 'voz' : 'msg';

        result.data?.forEach(d => {
            d.metrics?.forEach(m => {
                if (m.metric === 'tAnswered') {
                    map[userId][canal].manejadas += m.stats?.count || 0;
                }
                // Capturamos tanto la suma como el conteo de tHandle
                if (m.metric === 'tHandle') {
                    map[userId][canal].tHandle_sum += m.stats?.sum || 0;
                    map[userId][canal].tHandle_count += m.stats?.count || 0;
                }
                // Pérdidas fusionadas: solo la cola de voz (antes: consulta
                // aparte filtrada por voz + inbound)
                if (m.metric === 'tAbandon' && canal === 'voz') {
                    map[userId].voz.perdidas += m.stats?.count || 0;
                }
            });
        });

        map[userId].total = map[userId].voz.manejadas + map[userId].msg.manejadas;
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

    const uids = ag.results?.map(r => r.group?.userId).filter(Boolean) || [];
    const names = await getAgentNames(token, uids);
    const lista = processAgentAggregates(ag, names);

    const porTotal = (a: AgenteInterno[]) => [...a].sort((x, y) => y.total - x.total);
    const porVoz = (a: AgenteInterno[]) => [...a].sort((x, y) => y.voz.manejadas - x.voz.manejadas);
    const porMsg = (a: AgenteInterno[]) => [...a].sort((x, y) => y.msg.manejadas - x.msg.manejadas);

    const listaT = porTotal(lista), listaV = porVoz(lista), listaM = porMsg(lista);

    const armarRanking = (todos: AgenteInterno[], voz: AgenteInterno[], msg: AgenteInterno[]): RankingAgents => ({
        todos: todos.map(formatearAgente),
        top5Voz: voz.slice(0, 5).map(formatearAgente),
        top5Msg: msg.slice(0, 5).map(formatearAgente),
        destacadoVoz: voz[0] ? formatearAgente(voz[0]) : null,
        destacadoMsg: msg[0] ? formatearAgente(msg[0]) : null
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
