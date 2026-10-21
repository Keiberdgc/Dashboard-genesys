'use client';

// Dashboard Soporte — port del public/index.html original a React.
// Esta página solo orquesta: datos (sondeo de /api/metrics), reloj y vista
// activa; el render vive en components/dashboard/* y el tema en globals.css.
import { useState } from 'react';
import { CalendarIcon } from 'lucide-react';
import { DashboardHeader } from '@/components/dashboard/dashboard-header';
import { DestacadosCard } from '@/components/dashboard/destacados-card';
import { HistoricoModal } from '@/components/dashboard/historico-modal';
import { LoadingScreen } from '@/components/dashboard/loading-screen';
import { RankingTable } from '@/components/dashboard/ranking-table';
import { RealtimeCard } from '@/components/dashboard/realtime-card';
import { TabsNav } from '@/components/dashboard/tabs-nav';
import { listaTab, TAB_POR_ID, type Tab } from '@/config/tabs';
import { useMetricas } from '@/hooks/use-metricas';
import { useReloj } from '@/hooks/use-reloj';

export default function Dashboard() {
    const [tab, setTab] = useState<Tab>('todosHoy');
    const [historicoAbierto, setHistoricoAbierto] = useState(false);
    const datos = useMetricas();
    const reloj = useReloj();

    // ── Derivados de render ─────────────────────────────────
    const vista = TAB_POR_ID[tab];
    const filas = datos ? listaTab(vista, datos) : [];
    const actualizacion = datos ? new Date(datos.timestamp).toLocaleTimeString('es-VE') : null;

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
                    <DestacadosCard
                        periodos={[{
                            titulo: 'Destacados del día',
                            voz: datos?.hoy.destacadoVoz,
                            msg: datos?.hoy.destacadoMsg
                        }]}
                    />
                    <DestacadosCard
                        periodos={[
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
                    />
                </div>

                <TabsNav valor={tab} onCambio={setTab}>
                    <RankingTable filas={filas} canal={vista.canal} cargando={!datos} />
                </TabsNav>
            </div>
        </>
    );
}
