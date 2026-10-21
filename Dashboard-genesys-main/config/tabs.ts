import type { LucideIcon } from 'lucide-react';
import { LayersIcon, MessageSquareIcon, PhoneIcon, PhoneOffIcon, TimerIcon } from 'lucide-react';
import type { Agente, DashboardPayload } from '@/types/metrics';

// ── Vistas del ranking ───────────────────────────────────────
// Una sola fuente de verdad: la vista define canal (color) y periodo;
// la lista de filas y las columnas de la tabla se derivan de ahí.

export type Tab =
    | 'todosHoy' | 'top5VozHoy' | 'top5MsgHoy'
    | 'todosSem' | 'top5VozSem' | 'top5MsgSem'
    | 'perdidasHoy' | 'perdidasSem' | 'perdidasMes'
    | 'tManejoVozHoy' | 'tManejoVozSem' | 'tManejoVozMes'
    | 'tManejoChatHoy' | 'tManejoChatSem' | 'tManejoChatMes';

export type Canal = 'total' | 'voz' | 'msg';
export type Periodo = 'hoy' | 'semana' | 'mes';

/** Tono visual asociado a un canal (tokens de globals.css) */
export type Tono = 'voz' | 'msg' | 'cielo' | 'oro' | 'peligro' | 'neutro';

export const TONO_CLASES: Record<Tono, string> = {
    voz: 'text-voz',
    msg: 'text-msg',
    cielo: 'text-cielo',
    oro: 'text-oro',
    peligro: 'text-peligro',
    neutro: 'text-foreground'
};

export const TONO_FONDO: Record<Tono, string> = {
    voz: 'bg-voz',
    msg: 'bg-msg',
    cielo: 'bg-cielo',
    oro: 'bg-oro',
    peligro: 'bg-peligro',
    neutro: 'bg-foreground'
};

// Tipo de ordenamiento especial para tabs de métricas derivadas
export type TipoOrden = 'manejadas' | 'perdidas' | 'tManejoVoz' | 'tManejoChat';

export interface TabDef {
    id: Tab;
    canal: Canal;
    periodo: Periodo;
    tono: 'voz' | 'msg' | 'cielo' | 'peligro';
    icono: LucideIcon;
    etiqueta: string;
    // Grupo de tabs relacionados (para agrupar visualmente con submenú)
    grupo?: string;
    // Ordenamiento especial (si difiere del canal por defecto)
    orden?: TipoOrden;
}

export const TABS: readonly TabDef[] = [
    // ── Todos / Top 5 Hoy ─────────────────────────────────────
    { id: 'todosHoy', canal: 'total', periodo: 'hoy', tono: 'cielo', icono: LayersIcon, etiqueta: 'Todos — Hoy' },
    { id: 'top5VozHoy', canal: 'voz', periodo: 'hoy', tono: 'voz', icono: PhoneIcon, etiqueta: 'Top 5 Llamadas — Hoy' },
    { id: 'top5MsgHoy', canal: 'msg', periodo: 'hoy', tono: 'msg', icono: MessageSquareIcon, etiqueta: 'Top 5 Mensajes — Hoy' },
    // ── Todos / Top 5 Semana ──────────────────────────────────
    { id: 'todosSem', canal: 'total', periodo: 'semana', tono: 'cielo', icono: LayersIcon, etiqueta: 'Todos — Semana' },
    { id: 'top5VozSem', canal: 'voz', periodo: 'semana', tono: 'voz', icono: PhoneIcon, etiqueta: 'Top 5 Llamadas — Semana' },
    { id: 'top5MsgSem', canal: 'msg', periodo: 'semana', tono: 'msg', icono: MessageSquareIcon, etiqueta: 'Top 5 Mensajes — Semana' },
    // ── Llamadas Perdidas (día / semana / mes) ────────────────
    { id: 'perdidasHoy', canal: 'voz', periodo: 'hoy', tono: 'peligro', icono: PhoneOffIcon, etiqueta: 'Perdidas — Hoy', grupo: 'perdidas', orden: 'perdidas' },
    { id: 'perdidasSem', canal: 'voz', periodo: 'semana', tono: 'peligro', icono: PhoneOffIcon, etiqueta: 'Perdidas — Semana', grupo: 'perdidas', orden: 'perdidas' },
    { id: 'perdidasMes', canal: 'voz', periodo: 'mes', tono: 'peligro', icono: PhoneOffIcon, etiqueta: 'Perdidas — Mes', grupo: 'perdidas', orden: 'perdidas' },
    // ── Mayor T. Manejo Voz (día / semana / mes) ──────────────
    { id: 'tManejoVozHoy', canal: 'voz', periodo: 'hoy', tono: 'voz', icono: TimerIcon, etiqueta: 'T. Manejo Voz — Hoy', grupo: 'tManejoVoz', orden: 'tManejoVoz' },
    { id: 'tManejoVozSem', canal: 'voz', periodo: 'semana', tono: 'voz', icono: TimerIcon, etiqueta: 'T. Manejo Voz — Semana', grupo: 'tManejoVoz', orden: 'tManejoVoz' },
    { id: 'tManejoVozMes', canal: 'voz', periodo: 'mes', tono: 'voz', icono: TimerIcon, etiqueta: 'T. Manejo Voz — Mes', grupo: 'tManejoVoz', orden: 'tManejoVoz' },
    // ── Mayor T. Manejo Chat (día / semana / mes) ─────────────
    { id: 'tManejoChatHoy', canal: 'msg', periodo: 'hoy', tono: 'msg', icono: TimerIcon, etiqueta: 'T. Manejo Chat — Hoy', grupo: 'tManejoChat', orden: 'tManejoChat' },
    { id: 'tManejoChatSem', canal: 'msg', periodo: 'semana', tono: 'msg', icono: TimerIcon, etiqueta: 'T. Manejo Chat — Semana', grupo: 'tManejoChat', orden: 'tManejoChat' },
    { id: 'tManejoChatMes', canal: 'msg', periodo: 'mes', tono: 'msg', icono: TimerIcon, etiqueta: 'T. Manejo Chat — Mes', grupo: 'tManejoChat', orden: 'tManejoChat' },
];

export const TAB_POR_ID: Record<Tab, TabDef> = Object.fromEntries(
    TABS.map(t => [t.id, t])
) as Record<Tab, TabDef>;

// ── Grupos con submenú ───────────────────────────────────────
export interface GrupoTab {
    id: string;
    etiqueta: string;
    icono: LucideIcon;
    tono: TabDef['tono'];
    tabs: TabDef[];
}

// Tabs que NO pertenecen a ningún grupo (se muestran directamente)
export const TABS_DIRECTOS: readonly TabDef[] = TABS.filter(t => !t.grupo);

// Grupos de tabs con submenú
export const GRUPOS_TABS: readonly GrupoTab[] = [
    {
        id: 'perdidas',
        etiqueta: 'Llamadas Perdidas',
        icono: PhoneOffIcon,
        tono: 'peligro',
        tabs: TABS.filter(t => t.grupo === 'perdidas')
    },
    {
        id: 'tManejoVoz',
        etiqueta: 'T. Manejo Voz',
        icono: TimerIcon,
        tono: 'voz',
        tabs: TABS.filter(t => t.grupo === 'tManejoVoz')
    },
    {
        id: 'tManejoChat',
        etiqueta: 'T. Manejo Chat',
        icono: TimerIcon,
        tono: 'msg',
        tabs: TABS.filter(t => t.grupo === 'tManejoChat')
    },
];

// Agentes de Nivel 2 excluidos del ranking T. Manejo Chat
// (sus tiempos son estructuralmente más altos y distorsionan el top)
export const EXCLUIR_TMANEJO_CHAT: readonly string[] = [
    'Fabiola Bordones',
    'Daniel Medina',
    'Giovanny Altuve',
];

// Convierte tiempo "Xm Ys" a segundos para comparar
function tiempoASegundos(t: string): number {
    if (!t || t === '0m 0s') return 0;
    const m = t.match(/(\d+)m\s*(\d+)s/);
    if (!m) return 0;
    return parseInt(m[1]) * 60 + parseInt(m[2]);
}

/** Filas de la tabla para una vista dada */
export function listaTab(tab: TabDef, d: DashboardPayload): Agente[] {
    const periodoKey = tab.periodo === 'mes' ? 'mes' : tab.periodo;
    const periodo = d[periodoKey as 'hoy' | 'semana' | 'mes'];
    if (!periodo) return [];

    const todos = periodo.todos;

    switch (tab.orden) {
        case 'perdidas':
            return [...todos]
                .sort((a, b) => (b.vozPerdidas ?? 0) - (a.vozPerdidas ?? 0))
                .slice(0, 5);
        case 'tManejoVoz':
            return [...todos]
                .filter(a => a.vozManejadas > 0)
                .sort((a, b) => tiempoASegundos(b.tManejoVoz) - tiempoASegundos(a.tManejoVoz))
                .slice(0, 5);
        case 'tManejoChat':
            return [...todos]
                .filter(a => a.msgManejadas > 0 && !EXCLUIR_TMANEJO_CHAT.includes(a.nombre))
                .sort((a, b) => tiempoASegundos(b.tManejoMsg) - tiempoASegundos(a.tManejoMsg))
                .slice(0, 5);
        default:
            return tab.canal === 'voz' ? periodo.top5Voz
                : tab.canal === 'msg' ? periodo.top5Msg
                : periodo.todos;
    }
}
