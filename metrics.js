require('dotenv').config();
const axios = require('axios');
const { getAccessToken } = require('./auth');

const BASE_URL = 'https://api.mypurecloud.com/api/v2';
const QUEUES = {
    voz: 'eb8858d2-0bad-4834-b550-b9f583a68f37',
    msg: 'ea4452d3-dc89-4cb8-b19d-f2dae5e6d8e5'
};
const TZ_OFFSET_HOURS = -4;

function getIntervalHoy() {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setUTCHours(-TZ_OFFSET_HOURS, 0, 0, 0);
    if (midnight > now) midnight.setUTCDate(midnight.getUTCDate() - 1);
    return `${midnight.toISOString()}/${now.toISOString()}`;
}

function getIntervalSemana() {
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

// TIEMPO REAL — FIX: result.data es array directo de métricas
async function getRealtimeObservations(token) {
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
    const r = await axios.post(`${BASE_URL}/analytics/queues/observations/query`, body,
        { headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } });
    return r.data;
}
// Función para obtener totales de la cola (ofrecidas y abandonadas)
async function getQueueTotals(token, interval) {
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
    const r = await axios.post(`${BASE_URL}/analytics/conversations/aggregates/query`, body,
        { headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } });
    return r.data;
}
// AGREGADOS POR AGENTE
async function getAgentAggregates(token, interval) {
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
        // Pide tHandle y tTalk por si acaso, para asegurar que siempre haya datos
        metrics: ['tAnswered', 'tHandle']
    };
    const r = await axios.post(`${BASE_URL}/analytics/conversations/aggregates/query`, body,
        { headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } });
    return r.data;
}
// AGREGADOS POR AGENTE — tTalk en lugar de tHandle para tiempo de conversación real
async function getAgentAggregates(token, interval) {
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
        metrics: ['tAnswered', 'tHandle', 'tTalk', 'tAcw']
    };
    const r = await axios.post(`${BASE_URL}/analytics/conversations/aggregates/query`, body,
        { headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } });
    return r.data;
}

// PERDIDAS POR AGENTE en voz
async function getAgentAbandons(token, interval) {
    const body = {
        interval,
        groupBy: ['userId', 'queueId'],
        filter: {
            type: 'and',
            clauses: [
                { type: 'or', predicates: [{ dimension: 'queueId', value: QUEUES.voz }] },
                { type: 'or', predicates: [{ dimension: 'originatingDirection', value: 'inbound' }] }
            ]
        },
        metrics: ['tAbandon']
    };
    const r = await axios.post(`${BASE_URL}/analytics/conversations/aggregates/query`, body,
        { headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } });
    return r.data;
}

// NOMBRES DE AGENTES
async function getAgentNames(token, userIds) {
    const ids = [...new Set(userIds)].filter(Boolean);
    if (!ids.length) return {};
    const map = {};
    await Promise.all(ids.map(async id => {
        try {
            const r = await axios.get(`${BASE_URL}/users/${id}?fields=id,name`,
                { headers: { 'Authorization': `Bearer ${token}` } });
            map[id] = r.data.name;
        } catch { map[id] = `Agente (${id.substring(0, 8)}...)`; }
    }));
    return map;
}

// PROCESAR TIEMPO REAL — FIX crítico: result.data es array directo de métricas
function processRealtime(data) {
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
function processQueueTotals(data) {
    const result = {
        voz: { ofrecidas: 0, perdidas: 0 },
        msg: { ofrecidas: 0 }
    };
    data.results?.forEach(r => {
        const canal = r.group?.queueId === QUEUES.voz ? 'voz' : 'msg';
        r.data?.forEach(d => {
            d.metrics?.forEach(m => {
                if (m.metric === 'nOffered' && canal === 'voz') result.voz.ofrecidas += m.stats.count || 0;
                if (m.metric === 'nOffered' && canal === 'msg') result.msg.ofrecidas += m.stats.count || 0;
                if (m.metric === 'tAbandon' && canal === 'voz') result.voz.perdidas += m.stats.count || 0;
            });
        });
    });
    return result;
}

// PROCESAR AGENTES — tTalk.sum/count para tiempo de conversación real
function processAgentAggregates(aggregates, agentNames, abandonData) {
    const map = {};

    aggregates.results?.forEach(result => {
        const { userId, queueId } = result.group;
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
                    map[userId][canal].manejadas += m.stats.count || 0;
                }
                // Capturamos tanto la suma como el conteo de tHandle
                if (m.metric === 'tHandle') {
                    map[userId][canal].tHandle_sum += m.stats.sum || 0;
                    map[userId][canal].tHandle_count += m.stats.count || 0;
                }
            });
        });

        map[userId].total = map[userId].voz.manejadas + map[userId].msg.manejadas;
    });

    // Inyectar perdidas por agente
    abandonData?.results?.forEach(result => {
        const { userId } = result.group;
        if (!userId || !map[userId]) return;
        result.data?.forEach(d => {
            d.metrics?.forEach(m => {
                if (m.metric === 'tAbandon') map[userId].voz.perdidas += m.stats.count || 0;
            });
        });
    });

    return Object.values(map);
}

function msToMinSeg(ms) {
    if (!ms) return '0m 0s';
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function formatearAgente(a) {
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

async function getAllMetrics() {
    const token = await getAccessToken();
    const hoy = getIntervalHoy();
    const sem = getIntervalSemana();

    const [rt, totHoy, totSem, agHoy, agSem, abHoy, abSem] = await Promise.all([
        getRealtimeObservations(token),
        getQueueTotals(token, hoy),
        getQueueTotals(token, sem),
        getAgentAggregates(token, hoy),
        getAgentAggregates(token, sem),
        getAgentAbandons(token, hoy),
        getAgentAbandons(token, sem)
    ]);

    const uidsHoy = agHoy.results?.map(r => r.group?.userId).filter(Boolean) || [];
    const uidsSem = agSem.results?.map(r => r.group?.userId).filter(Boolean) || [];
    const names = await getAgentNames(token, [...new Set([...uidsHoy, ...uidsSem])]);

    const listaHoy = processAgentAggregates(agHoy, names, abHoy);
    const listaSem = processAgentAggregates(agSem, names, abSem);

    const porTotal = a => [...a].sort((x, y) => y.total - x.total);
    const porVoz = a => [...a].sort((x, y) => y.voz.manejadas - x.voz.manejadas);
    const porMsg = a => [...a].sort((x, y) => y.msg.manejadas - x.msg.manejadas);

    const hoyT = porTotal(listaHoy), hoyV = porVoz(listaHoy), hoyM = porMsg(listaHoy);
    const semT = porTotal(listaSem), semV = porVoz(listaSem), semM = porMsg(listaSem);

    return {
        tiempoReal: processRealtime(rt),
        totalesHoy: processQueueTotals(totHoy),
        totalesSemana: processQueueTotals(totSem),
        hoy: {
            todos: hoyT.map(formatearAgente),
            top5Voz: hoyV.slice(0, 5).map(formatearAgente),
            top5Msg: hoyM.slice(0, 5).map(formatearAgente),
            destacadoVoz: hoyV[0] ? formatearAgente(hoyV[0]) : null,
            destacadoMsg: hoyM[0] ? formatearAgente(hoyM[0]) : null
        },
        semana: {
            todos: semT.map(formatearAgente),
            top5Voz: semV.slice(0, 5).map(formatearAgente),
            top5Msg: semM.slice(0, 5).map(formatearAgente),
            destacadoVoz: semV[0] ? formatearAgente(semV[0]) : null,
            destacadoMsg: semM[0] ? formatearAgente(semM[0]) : null
        }
    };
}

module.exports = { getAllMetrics, msToMinSeg };