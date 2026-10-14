import type { LucideIcon } from 'lucide-react';
import { LayersIcon, MessageSquareIcon, PhoneIcon } from 'lucide-react';
import type { Agente, DashboardPayload } from '@/types/metrics';

// ── Vistas del ranking ───────────────────────────────────────
// Una sola fuente de verdad: la vista define canal (color) y periodo;
// la lista de filas y las columnas de la tabla se derivan de ahí.

export type Tab = 'todosHoy' | 'top5VozHoy' | 'top5MsgHoy' | 'todosSem' | 'top5VozSem' | 'top5MsgSem';
export type Canal = 'total' | 'voz' | 'msg';
export type Periodo = 'hoy' | 'semana';

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

export interface TabDef {
    id: Tab;
    canal: Canal;
    periodo: Periodo;
    tono: 'voz' | 'msg' | 'cielo';
    icono: LucideIcon;
    etiqueta: string;
}

export const TABS: readonly TabDef[] = [
    { id: 'todosHoy', canal: 'total', periodo: 'hoy', tono: 'cielo', icono: LayersIcon, etiqueta: 'Todos — Hoy' },
    { id: 'top5VozHoy', canal: 'voz', periodo: 'hoy', tono: 'voz', icono: PhoneIcon, etiqueta: 'Top 5 Llamadas — Hoy' },
    { id: 'top5MsgHoy', canal: 'msg', periodo: 'hoy', tono: 'msg', icono: MessageSquareIcon, etiqueta: 'Top 5 Mensajes — Hoy' },
    { id: 'todosSem', canal: 'total', periodo: 'semana', tono: 'cielo', icono: LayersIcon, etiqueta: 'Todos — Semana' },
    { id: 'top5VozSem', canal: 'voz', periodo: 'semana', tono: 'voz', icono: PhoneIcon, etiqueta: 'Top 5 Llamadas — Semana' },
    { id: 'top5MsgSem', canal: 'msg', periodo: 'semana', tono: 'msg', icono: MessageSquareIcon, etiqueta: 'Top 5 Mensajes — Semana' }
];

export const TAB_POR_ID: Record<Tab, TabDef> = Object.fromEntries(
    TABS.map(t => [t.id, t])
) as Record<Tab, TabDef>;

/** Filas de la tabla para una vista dada */
export function listaTab(tab: TabDef, d: DashboardPayload): Agente[] {
    const periodo = d[tab.periodo];
    return tab.canal === 'voz' ? periodo.top5Voz : tab.canal === 'msg' ? periodo.top5Msg : periodo.todos;
}
