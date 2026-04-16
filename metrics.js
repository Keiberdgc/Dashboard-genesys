require('dotenv').config();
const axios = require('axios');
const { getAccessToken } = require('./auth');

const BASE_URL = 'https://api.mypurecloud.com/api/v2';

const QUEUES = {
    voz: 'eb8858d2-0bad-4834-b550-b9f583a68f37',
    msg: 'ea4452d3-dc89-4cb8-b19d-f2dae5e6d8e5'
};

// Venezuela = UTC-4 siempre
const TZ_OFFSET_HOURS = -4;

function getIntervalHoy() {
    const now = new Date();
    // Medianoche en hora Venezuela
    const localMidnight = new Date(now);
    localMidnight.setUTCHours(-TZ_OFFSET_HOURS, 0, 0, 0);
    // Si ya pasamos esa medianoche hoy, bien. Si no, retrocedemos un día
    if (localMidnight > now) {
        localMidnight.setUTCDate(localMidnight.getUTCDate() - 1);
    }
    return `${localMidnight.toISOString()}/${now.toISOString()}`;
}

function getIntervalSemana() {
    const now = new Date();
    const localNow = new Date(now.getTime() + TZ_OFFSET_HOURS * 3600000);
    const dayOfWeek = localNow.getUTCDay(); // 0=dom,1=lun...
    const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const monday = new Date(localNow);
    monday.setUTCDate(localNow.getUTCDate() - diffToMonday);
    monday.setUTCHours(0, 0, 0, 0);
    // Convertir lunes local a UTC
    const mondayUTC = new Date(monday.getTime() - TZ_OFFSET_HOURS * 3600000);
    return `${mondayUTC.toISOString()}/${now.toISOString()}`;
}

// ─────────────────────────────────────────────
// TIEMPO REAL — separado por cola y mediaType
// ─────────────────────────────────────────────
async function getRealtimeObservations(token) {
    const body = {
        filter: {
            type: 'and',
            clauses: [
                {
                    type: 'or',
                    predicates: [
                        { dimension: 'queueId', value: QUEUES.voz },
                        { dimension: 'queueId', value: QUEUES.msg }
                    ]
                }
            ]
        },
        metrics: ['oWaiting', 'oInteracting', 'oOnQueueUsers']
    };

    const response = await axios.post(
        `${BASE_URL}/analytics/queues/observations/query`,
        body,
        { headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } }
    );
    return response.data;
}

// ─────────────────────────────────────────────
// TOTALES DE COLA — inbound únicamente
// ─────────────────────────────────────────────
async function getQueueTotals(token, interval) {
    const body = {
        interval,
        groupBy: ['queueId', 'mediaType'],
        filter: {
            type: 'and',
            clauses: [
                {
                    type: 'or',
                    predicates: [
                        { dimension: 'queueId', value: QUEUES.voz },
                        { dimension: 'queueId', value: QUEUES.msg }
                    ]
                },
                {
                    type: 'or',
                    predicates: [
                        { dimension: 'originatingDirection', value: 'inbound' }
                    ]
                }
            ]
        },
        metrics: ['nOffered', 'nConnected', 'tAbandon']
    };

    const response = await axios.post(
        `${BASE_URL}/analytics/conversations/aggregates/query`,
        body,
        { headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } }
    );
    return response.data;
}

// ─────────────────────────────────────────────
// AGREGADOS POR AGENTE — inbound únicamente
// ─────────────────────────────────────────────
async function getAgentAggregates(token, interval) {
    const body = {
        interval,
        groupBy: ['userId', 'queueId', 'mediaType'],
        filter: {
            type: 'and',
            clauses: [
                {
                    type: 'or',
                    predicates: [
                        { dimension: 'queueId', value: QUEUES.voz },
                        { dimension: 'queueId', value: QUEUES.msg }
                    ]
                },
                {
                    type: 'or',
                    predicates: [
                        { dimension: 'originatingDirection', value: 'inbound' }
                    ]
                }
            ]
        },
        metrics: ['nConnected', 'tHandle', 'tAcw']
    };

    const response = await axios.post(
        `${BASE_URL}/analytics/conversations/aggregates/query`,
        body,
        { headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } }
    );
    return response.data;
}

// ─────────────────────────────────────────────
// NOMBRES DE AGENTES
// ─────────────────────────────────────────────
async function getAgentNames(token, userIds) {
    const ids = [...new Set(userIds)].filter(Boolean);
    if (ids.length === 0) return {};
    const map = {};
    await Promise.all(
        ids.map(async (id) => {
            try {
                const r = await axios.get(
                    `${BASE_URL}/users/${id}?fields=id,name`,
                    { headers: { 'Authorization': `Bearer ${token}` } }
                );
                map[id] = r.data.name;
            } catch {
                map[id] = `Agente (${id.substring(0, 8)}...)`;
            }
        })
    );
    return map;
}

// ─────────────────────────────────────────────
// PROCESAR AGENTES
// ─────────────────────────────────────────────
function processAgentAggregates(aggregates, agentNames) {
    const agentMap = {};

    aggregates.results?.forEach(result => {
        const { userId, queueId, mediaType } = result.group;
        if (!userId) return;

        if (!agentMap[userId]) {
            agentMap[userId] = {
                nombre: agentNames[userId] || `Agente (${userId.substring(0, 8)}...)`,
                voz: { manejadas: 0, tHandle_ms: 0 },
                msg: { manejadas: 0, tHandle_ms: 0 },
                total: 0
            };
        }

        const canal = queueId === QUEUES.voz ? 'voz' : 'msg';

        result.data?.forEach(d => {
            d.metrics?.forEach(m => {
                if (m.metric === 'tHandle') {
                    agentMap[userId][canal].manejadas += m.stats.count || 0;
                    agentMap[userId][canal].tHandle_ms += m.stats.sum || 0;
                }
            });
        });

        agentMap[userId].total =
            agentMap[userId].voz.manejadas + agentMap[userId].msg.manejadas;
    });

    return Object.values(agentMap);
}

// ─────────────────────────────────────────────
// PROCESAR TOTALES DE COLA
// ─────────────────────────────────────────────
function processQueueTotals(data) {
    const result = {
        voz: { ofrecidas: 0, atendidas: 0, abandonadas: 0 },
        msg: { ofrecidas: 0, atendidas: 0 }
    };

    data.results?.forEach(r => {
        const canal = r.group?.queueId === QUEUES.voz ? 'voz' : 'msg';
        r.data?.forEach(d => {
            d.metrics?.forEach(m => {
                if (m.metric === 'nOffered') result[canal].ofrecidas += m.stats.count || 0;
                if (m.metric === 'nConnected') result[canal].atendidas += m.stats.count || 0;
                if (m.metric === 'tAbandon' && canal === 'voz')
                    result.voz.abandonadas += m.stats.count || 0;
            });
        });
    });

    return result;
}

// ─────────────────────────────────────────────
// PROCESAR TIEMPO REAL
// ─────────────────────────────────────────────
function processRealtime(data) {
    const colaInfo = {
        voz: { oWaiting: 0, oInteracting: 0, oOnQueueUsers: 0 },
        msg: { oWaiting: 0, oInteracting: 0, oOnQueueUsers: 0 }
    };

    data.results?.forEach(result => {
        const qId = result.group?.queueId;
        if (!qId) return;
        const canal = qId === QUEUES.voz ? 'voz' : 'msg';

        result.data?.forEach(m => {
            // d.metrics?.forEach(m => {
            const val = m.stats?.count || 0;
            if (m.metric === 'oWaiting') colaInfo[canal].oWaiting += val;
            if (m.metric === 'oInteracting') colaInfo[canal].oInteracting += val;
            if (m.metric === 'oOnQueueUsers') colaInfo[canal].oOnQueueUsers += val;
            // });
        });
    });

    return colaInfo;
}

// ─────────────────────────────────────────────
// UTILIDADES
// ─────────────────────────────────────────────
function msToMinSeg(ms) {
    if (!ms || ms === 0) return '0m 0s';
    const totalSeg = Math.floor(ms / 1000);
    const min = Math.floor(totalSeg / 60);
    const seg = totalSeg % 60;
    return `${min}m ${seg}s`;
}

function formatearAgente(a) {
    return {
        nombre: a.nombre,
        total: a.total,
        vozManejadas: a.voz.manejadas,
        msgManejadas: a.msg.manejadas,
        tManejoVoz: msToMinSeg(a.voz.tHandle_ms / (a.voz.manejadas || 1)),
        tManejoMsg: msToMinSeg(a.msg.tHandle_ms / (a.msg.manejadas || 1))
    };
}

// ─────────────────────────────────────────────
// FUNCIÓN PRINCIPAL
// ─────────────────────────────────────────────
async function getAllMetrics() {
    const token = await getAccessToken();
    const intervalHoy = getIntervalHoy();
    const intervalSemana = getIntervalSemana();

    const [realtime, totalesHoy, totalesSemana, agentesHoy, agentesSemana] = await Promise.all([
        getRealtimeObservations(token),
        getQueueTotals(token, intervalHoy),
        getQueueTotals(token, intervalSemana),
        getAgentAggregates(token, intervalHoy),
        getAgentAggregates(token, intervalSemana)
    ]);

    const userIdsHoy = agentesHoy.results?.map(r => r.group?.userId).filter(Boolean) || [];
    const userIdsSem = agentesSemana.results?.map(r => r.group?.userId).filter(Boolean) || [];
    const todosIds = [...new Set([...userIdsHoy, ...userIdsSem])];
    const agentNames = await getAgentNames(token, todosIds);

    const listaHoy = processAgentAggregates(agentesHoy, agentNames);
    const listaSem = processAgentAggregates(agentesSemana, agentNames);

    // Ordenamientos
    const porTotal = arr => [...arr].sort((a, b) => b.total - a.total);
    const porVoz = arr => [...arr].sort((a, b) => b.voz.manejadas - a.voz.manejadas);
    const porMsg = arr => [...arr].sort((a, b) => b.msg.manejadas - a.msg.manejadas);

    const hoyTotal = porTotal(listaHoy);
    const hoyVoz = porVoz(listaHoy);
    const hoyMsg = porMsg(listaHoy);
    const semTotal = porTotal(listaSem);
    const semVoz = porVoz(listaSem);
    const semMsg = porMsg(listaSem);

    return {
        tiempoReal: processRealtime(realtime),
        totalesHoy: processQueueTotals(totalesHoy),
        totalesSemana: processQueueTotals(totalesSemana),
        hoy: {
            todos: hoyTotal.map(formatearAgente),
            top5Total: hoyTotal.slice(0, 5).map(formatearAgente),
            top5Voz: hoyVoz.slice(0, 5).map(formatearAgente),
            top5Msg: hoyMsg.slice(0, 5).map(formatearAgente),
            destacadoVoz: hoyVoz[0] ? formatearAgente(hoyVoz[0]) : null,
            destacadoMsg: hoyMsg[0] ? formatearAgente(hoyMsg[0]) : null
        },
        semana: {
            todos: semTotal.map(formatearAgente),
            top5Total: semTotal.slice(0, 5).map(formatearAgente),
            top5Voz: semVoz.slice(0, 5).map(formatearAgente),
            top5Msg: semMsg.slice(0, 5).map(formatearAgente),
            destacadoVoz: semVoz[0] ? formatearAgente(semVoz[0]) : null,
            destacadoMsg: semMsg[0] ? formatearAgente(semMsg[0]) : null
        }
    };
}

module.exports = { getAllMetrics, msToMinSeg };