'use client';

// Dashboard Soporte — port del public/index.html original a React.
// Esta página solo orquesta: datos por SSE, reloj y vista activa;
// el render vive en components/dashboard/* y el tema en globals.css.
import { useState } from 'react';
import { DashboardHeader } from '@/components/dashboard/dashboard-header';
import { DestacadosCard } from '@/components/dashboard/destacados-card';
import { LoadingScreen } from '@/components/dashboard/loading-screen';
import { RankingTable } from '@/components/dashboard/ranking-table';
import { RealtimeCard } from '@/components/dashboard/realtime-card';
import { TabsNav } from '@/components/dashboard/tabs-nav';
import { listaTab, TAB_POR_ID, type Tab } from '@/config/tabs';
import { useMetricas } from '@/hooks/use-sse';
import { useReloj } from '@/hooks/use-reloj';

export default function Dashboard() {
    const [tab, setTab] = useState<Tab>('todosHoy');
    const datos = useMetricas();
    const reloj = useReloj();

    // ── Derivados de render ─────────────────────────────────
    const vista = TAB_POR_ID[tab];
    const filas = datos ? listaTab(vista, datos) : [];
    const actualizacion = datos ? new Date(datos.timestamp).toLocaleTimeString('es-VE') : null;

    return (
        <>
            {!datos && <LoadingScreen />}

            <div className="px-4 py-3">
                <DashboardHeader reloj={reloj} actualizacion={actualizacion} />

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
                        titulo="Destacados del día"
                        voz={datos?.hoy.destacadoVoz}
                        msg={datos?.hoy.destacadoMsg}
                    />
                    <DestacadosCard
                        titulo="Destacados semana"
                        voz={datos?.semana.destacadoVoz}
                        msg={datos?.semana.destacadoMsg}
                    />
                </div>

                <TabsNav valor={tab} onCambio={setTab}>
                    <RankingTable filas={filas} canal={vista.canal} cargando={!datos} />
                </TabsNav>
            </div>
        </>
    );
}
