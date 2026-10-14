// ── TIPOS DEL PAYLOAD DEL DASHBOARD ─────────────────────────
// Forma idéntica a la que producía server.js (buildPayload)
// y que consume el frontend. Compartida entre API y cliente.
// ────────────────────────────────────────────────────────────

/** Conteo en vivo por canal (oWaiting / oInteracting / oOnQueueUsers) */
export interface ConteoCanal {
    oWaiting: number;
    oInteracting: number;
    oOnQueueUsers: number;
}

/** Estado "ahora" — claves renombradas para el frontend */
export interface TiempoRealCanal {
    enEspera: number;
    enAtencion: number;
    enCola: number;
}

/** Totales de conversaciones ofrecidas/perdidas por cola */
export interface Totales {
    voz: { ofrecidas: number; perdidas: number };
    msg: { ofrecidas: number };
}

/** Agente ya formateado (ms convertidos a "Xm Ys") */
export interface Agente {
    nombre: string;
    total: number;
    vozManejadas: number;
    msgManejadas: number;
    vozPerdidas: number;
    tManejoVoz: string;
    tManejoMsg: string;
}

/** Rankings por periodo (hoy / semana) */
export interface RankingAgents {
    todos: Agente[];
    top5Voz: Agente[];
    top5Msg: Agente[];
    destacadoVoz: Agente | null;
    destacadoMsg: Agente | null;
}

/** Totales + rankings de un periodo (hoy / semana) — trozo con refresco propio
 *  (refresco escalonado: hoy cada 60s, semana cada 5min) */
export interface PartePeriodo {
    totales: Totales;
    ranking: RankingAgents;
}

/** Retorno de getAllMetrics() — datos "en bruto" procesados */
export interface MetricasBrutas {
    tiempoReal: { voz: ConteoCanal; msg: ConteoCanal };
    totalesHoy: Totales;
    totalesSemana: Totales;
    hoy: RankingAgents;
    semana: RankingAgents;
}

/** Payload final que sirve /api/metrics a la UI (por sondeo)
 *  (tiempoReal renombrado a enEspera/enAtencion/enCola en buildPayload) */
export interface DashboardPayload {
    ok: boolean;
    timestamp: string;
    tiempoReal: {
        voz: TiempoRealCanal;
        msg: TiempoRealCanal;
    };
    totalesHoy: Totales;
    totalesSemana: Totales;
    hoy: RankingAgents;
    semana: RankingAgents;
}

// ── FRONTERA CON LA API DE GENESYS ──────────────────────────
// Tipos flojos: solo modelan los campos que consumimos, con
// accesos defensivos (?. y || 0) igual que la versión original.
// ────────────────────────────────────────────────────────────

export interface GenesysStats {
    count?: number;
    sum?: number;
}

export interface GenesysMetric {
    metric: string;
    stats?: GenesysStats;
}

export interface GenesysDataPoint {
    metric?: string; // observaciones de tiempo real: result.data[].metric
    metrics?: GenesysMetric[]; // agregados: result.data[].metrics[]
    stats?: GenesysStats; // observaciones de tiempo real: result.data[].stats.count
}

export interface GenesysGroup {
    queueId?: string;
    userId?: string;
    mediaType?: string;
}

export interface GenesysResult {
    group?: GenesysGroup;
    data?: GenesysDataPoint[];
}

export interface GenesysResponse {
    results?: GenesysResult[];
}
