'use client';

// Dashboard Soporte — port del public/index.html original a React.
// Esta página solo orquesta: datos (sondeo de /api/metrics), reloj y vista
// activa; el render vive en components/dashboard/* y el tema en globals.css.
import { useMemo, useState } from 'react';
import { CalendarIcon } from 'lucide-react';
import { DashboardHeader } from '@/components/dashboard/dashboard-header';
import { DualDestacados } from '@/components/dashboard/destacados-card';
import { HistoricoModal } from '@/components/dashboard/historico-modal';
import { LoadingScreen } from '@/components/dashboard/loading-screen';
import { RankingTable } from '@/components/dashboard/ranking-table';
import { RealtimeCard } from '@/components/dashboard/realtime-card';
import { TabsNav } from '@/components/dashboard/tabs-nav';
import { listaTab, TAB_POR_ID, EXCLUIR_TMANEJO_CHAT, type Tab } from '@/config/tabs';
import { useMetricas } from '@/hooks/use-metricas';
import { useReloj } from '@/hooks/use-reloj';
import type { Agente } from '@/types/metrics';

// Convierte "Xm Ys" a segundos para comparar tiempos
function tiempoASegundos(t: string): number {
    if (!t || t === '0m 0s') return 0;
    const m = t.match(/(\d+)m\s*(\d+)s/);
    if (!m) return 0;
    return parseInt(m[1]) * 60 + parseInt(m[2]);
}

export default function Dashboard() {
    const [tab, setTab] = useState<Tab>('todosHoy');
    const [historicoAbierto, setHistoricoAbierto] = useState(false);
    const datos = useMetricas();
    const reloj = useReloj();

    // ── Derivados de render ─────────────────────────────────
    const vista = TAB_POR_ID[tab];
    const filas = datos ? listaTab(vista, datos) : [];
    const actualizacion = datos ? new Date(datos.timestamp).toLocaleTimeString('es-VE') : null;

    // ── Indicadores Bloque 2 ────────────────────────────────
    // Se calculan desde los agentes de hoy
    const indicadores = useMemo(() => {
        const agentes: Agente[] = datos?.hoy?.todos ?? [];
        if (!agentes.length) return { mayorPerdidas: null, mayorTManejoVoz: null, mayorTManejoChat: null };

        const mayorPerdidas = agentes.reduce<Agente | null>((top, a) =>
            (a.vozPerdidas ?? 0) > (top?.vozPerdidas ?? 0) ? a : top, null);

        const conVoz = agentes.filter(a => a.vozManejadas > 0);
        const mayorTManejoVoz = conVoz.reduce<Agente | null>((top, a) =>
            tiempoASegundos(a.tManejoVoz) > tiempoASegundos(top?.tManejoVoz ?? '0m 0s') ? a : top, null);

        const conChat = agentes.filter(a => a.msgManejadas > 0 && !EXCLUIR_TMANEJO_CHAT.includes(a.nombre));
        const mayorTManejoChat = conChat.reduce<Agente | null>((top, a) =>
            tiempoASegundos(a.tManejoMsg) > tiempoASegundos(top?.tManejoMsg ?? '0m 0s') ? a : top, null);

        return { mayorPerdidas, mayorTManejoVoz, mayorTManejoChat };
    }, [datos?.hoy?.todos]);

    return (
        <>
            {!datos && <LoadingScreen />}
            <HistoricoModal abierto={historicoAbierto} onCerrar={() => setHistoricoAbierto(false)} />

            <div className="px-4 py-3">
                <DashboardHeader reloj={reloj} actualizacion={actualizacion} />

                {/* Botón Histórico — flotante, no modifica el layout existente */}
                <div className="mb-2.5 flex justify-end">
                    <button
                        onClick={() => setHistoricoAbierto(true)}
                        className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
                    >
                        <CalendarIcon className="size-4" />
                        Consulta histórica
                    </button>
                </div>

                <div className="mb-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
                    <RealtimeCard
                        canal="voz"
                        titulo="Voz_Soporte — ahora"
                        conteo={datos?.tiempoReal.voz}
                        totales={datos?.totalesHoy}
                    />
                    <RealtimeCard
                        canal="msg"
                        titulo="MSG_Soporte — ahora"
                        conteo={datos?.tiempoReal.msg}
                        totales={datos?.totalesHoy}
                    />
                    {/* Bloques 1 y 2 sincronizados — cada 10s */}
                    <DualDestacados
                        periodos={[
                            {
                                titulo: 'Destacados del día',
                                voz: datos?.hoy.destacadoVoz,
                                msg: datos?.hoy.destacadoMsg
                            },
                            {
                                titulo: 'Destacados semana',
                                voz: datos?.semana.destacadoVoz,
                                msg: datos?.semana.destacadoMsg
                            },
                            {
                                titulo: 'Destacados mes',
                                voz: datos?.mes?.destacadoVoz,
                                msg: datos?.mes?.destacadoMsg
                            }
                        ]}
                        indicadores={indicadores}
                        intervaloMs={10000}
                    />
                </div>

                <TabsNav valor={tab} onCambio={setTab}>
                    <RankingTable filas={filas} canal={vista.canal} cargando={!datos} />
                </TabsNav>
            </div>
        </>
    );
}
