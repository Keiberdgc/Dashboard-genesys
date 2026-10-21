// lib/historico.ts — consultas históricas para el selector de rango
// Reutiliza la misma infraestructura de metrics.ts (auth, endpoints, colas).
// No tiene caché: es una consulta bajo demanda iniciada por el usuario.
import { getAccessToken } from './auth';
import type { GenesysResponse, RankingAgents, Totales } from '@/types/metrics';

const BASE_URL = 'https://api.mypurecloud.com/api/v2';
const QUEUES = {
    voz: 'eb8858d2-0bad-4834-b550-b9f583a68f37',
    msg: 'ea4452d3-dc89-4cb8-b19d-f2dae5e6d8e5'
};

const FILTRO_COLAS = {
    type: 'or' as const,
    predicates: [
        { dimension: 'queueId', value: QUEUES.voz },
        { dimension: 'queueId', value: QUEUES.msg }
    ]
};

const FILTRO_VOZ = {
    type: 'or' as const,
    predicates: [{ dimension: 'queueId', value: QUEUES.voz }]
};

const FILTRO_MSG = {
    type: 'or' as const,
    predicates: [{ dimension: 'queueId', value: QUEUES.msg }]
};

function canalDe(queueId: string | undefined): 'voz' | 'msg' {
    return queueId === QUEUES.voz ? 'voz' : 'msg';
}

async function genesysPost<T>(path: string, token: string, body: unknown): Promise<T> {
    const { default: axios } = await import('axios');
    const r = await axios.post<T>(`${BASE_URL}${path}`, body, {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
    });
    return r.data;
}

async function genesysGet<T>(path: string, token: string, params?: Record<string, string | number>): Promise<T> {
    const { default: axios } = await import('axios');
    const r = await axios.get<T>(`${BASE_URL}${path}`, {
        params,
        headers: { 'Authorization': `Bearer ${token}` }
    });
    return r.data;
}

// ── NOMBRES (sin caché: consulta puntual) ─────────────────
async function getNombres(token: string, ids: string[]): Promise<Record<string, string>> {
    const unicos = [...new Set(ids)].filter(Boolean);
    if (!unicos.length) return {};
    const map: Record<string, string> = {};
    const TAM = 50;
    const lotes: string[][] = [];
    for (let i = 0; i < unicos.length; i += TAM) lotes.push(unicos.slice(i, i + TAM));

    await Promise.all(lotes.map(async lote => {
        try {
            const r = await genesysGet<{ entities?: { id?: string; name?: string }[] }>(
                '/users', token, { ids: lote.join(','), fields: 'id,name', pageSize: lote.length }
            );
            for (const u of r.entities || []) {
                if (u.id && u.name) map[u.id] = u.name;
            }
        } catch { /* fallback individual abajo */ }
    }));

    const sinResolver = unicos.filter(id => !map[id]);
    await Promise.all(sinResolver.map(async id => {
        try {
            const r = await genesysGet<{ name: string }>(`/users/${id}`, token, { fields: 'id,name' });
            map[id] = r.name;
        } catch { map[id] = `Agente (${id.substring(0, 8)}...)`; }
    }));

    return map;
}

// ── PROCESAMIENTO ─────────────────────────────────────────
function procesarTotales(data: GenesysResponse): Totales {
    const result: Totales = {
        voz: { ofrecidas: 0, perdidas: 0 },
        msg: { ofrecidas: 0 }
    };
    data.results?.forEach(r => {
        const canal = canalDe(r.group?.queueId);
        r.data?.forEach(d => {
            d.metrics?.forEach(m => {
                const val = m.stats?.count || 0;
                if (m.metric === 'nOffered') {
                    if (canal === 'voz') result.voz.ofrecidas += val;
                    else result.msg.ofrecidas += val;
                }
                if (m.metric === 'tAbandon' && canal === 'voz') result.voz.perdidas += val;
            });
        });
    });
    return result;
}

interface AgenteInterno {
    nombre: string;
    voz: { manejadas: number; tHandle_sum: number; tHandle_count: number; perdidas: number };
    msg: { manejadas: number; tHandle_sum: number; tHandle_count: number };
    total: number;
}

function msToMinSeg(ms: number): string {
    if (!ms) return '0m 0s';
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function procesarAgentes(data: GenesysResponse, nombres: Record<string, string>): AgenteInterno[] {
    const map: Record<string, AgenteInterno> = {};
    data.results?.forEach(result => {
        const userId = result.group?.userId;
        const queueId = result.group?.queueId;
        if (!userId) return;
        if (!map[userId]) {
            map[userId] = {
                nombre: nombres[userId] || `Agente (${userId.substring(0, 8)}...)`,
                voz: { manejadas: 0, tHandle_sum: 0, tHandle_count: 0, perdidas: 0 },
                msg: { manejadas: 0, tHandle_sum: 0, tHandle_count: 0 },
                total: 0
            };
        }
        const canal = canalDe(queueId);
        result.data?.forEach(d => {
            d.metrics?.forEach(m => {
                switch (m.metric) {
                    case 'tAnswered': map[userId][canal].manejadas += m.stats?.count || 0; break;
                    case 'tHandle':
                        map[userId][canal].tHandle_sum += m.stats?.sum || 0;
                        map[userId][canal].tHandle_count += m.stats?.count || 0;
                        break;
                    case 'tNotResponding':
                        if (canal === 'voz') map[userId].voz.perdidas += m.stats?.count || 0;
                        break;
                }
            });
        });
        map[userId].total = map[userId].voz.manejadas + map[userId].msg.manejadas;
    });
    return Object.values(map);
}

function formatear(a: AgenteInterno) {
    return {
        nombre: a.nombre,
        total: a.total,
        vozManejadas: a.voz.manejadas,
        msgManejadas: a.msg.manejadas,
        vozPerdidas: a.voz.perdidas || 0,
        tManejoVoz: msToMinSeg(a.voz.tHandle_sum / (a.voz.tHandle_count || 1)),
        tManejoMsg: msToMinSeg(a.msg.tHandle_sum / (a.msg.tHandle_count || 1))
    };
}

// ── EXPORT PRINCIPAL ──────────────────────────────────────

export interface ResultadoHistorico {
    intervalo: { desde: string; hasta: string };
    totales: Totales;
    ranking: RankingAgents;
}

/**
 * Consulta totales + ranking de agentes para un intervalo arbitrario.
 * @param desde  ISO 8601 (medianoche Venezuela del día inicio)
 * @param hasta  ISO 8601 (fin del rango, normalmente medianoche del día siguiente)
 */
export async function getHistorico(desde: string, hasta: string): Promise<ResultadoHistorico> {
    const token = await getAccessToken();
    const interval = `${desde}/${hasta}`;

    // Agentes: dos queries separadas por cola sin mediaType en groupBy.
    // Así Genesys agrupa por conversación completa y no duplica segmentos.
    const [totData, agVozData, agMsgData] = await Promise.all([
        genesysPost<GenesysResponse>('/analytics/conversations/aggregates/query', token, {
            interval,
            groupBy: ['queueId', 'mediaType'],
            filter: FILTRO_COLAS,
            metrics: ['nOffered', 'tAbandon']
        }),
        genesysPost<GenesysResponse>('/analytics/conversations/aggregates/query', token, {
            interval,
            groupBy: ['userId', 'queueId'],
            filter: FILTRO_VOZ,
            metrics: ['tAnswered', 'tHandle', 'tNotResponding']
        }),
        genesysPost<GenesysResponse>('/analytics/conversations/aggregates/query', token, {
            interval,
            groupBy: ['userId', 'queueId'],
            filter: FILTRO_MSG,
            metrics: ['tAnswered', 'tHandle']
        })
    ]);

    // Combinar resultados de voz y msg en un único GenesysResponse
    const agData: GenesysResponse = {
        results: [...(agVozData.results ?? []), ...(agMsgData.results ?? [])]
    };

    const uids = (agData.results ?? [])
        .map(r => r.group?.userId)
        .filter((id): id is string => Boolean(id));
    const nombres = await getNombres(token, uids);
    const lista = procesarAgentes(agData, nombres);

    const porTotal = (a: AgenteInterno[]) => [...a].sort((x, y) => y.total - x.total);
    const porVoz = (a: AgenteInterno[]) => [...a].sort((x, y) => y.voz.manejadas - x.voz.manejadas);
    const porMsg = (a: AgenteInterno[]) => [...a].sort((x, y) => y.msg.manejadas - x.msg.manejadas);

    const listaT = porTotal(lista), listaV = porVoz(lista), listaM = porMsg(lista);

    return {
        intervalo: { desde, hasta },
        totales: procesarTotales(totData),
        ranking: {
            todos: listaT.map(formatear),
            top5Voz: listaV.slice(0, 5).map(formatear),
            top5Msg: listaM.slice(0, 5).map(formatear),
            destacadoVoz: listaV[0] ? formatear(listaV[0]) : null,
            destacadoMsg: listaM[0] ? formatear(listaM[0]) : null
        }
    };
}
