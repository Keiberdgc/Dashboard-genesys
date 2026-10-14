'use client';

import { useEffect, useState } from 'react';
import type { DashboardPayload } from '@/types/metrics';

// Sondeo de /api/metrics cada 30s (antes EventSource/SSE). Con SSE la
// función mantenía la petición abierta todo el día y Vercel facturaba la
// memoria provisionada (2GB) durante horas; con sondeo la petición dura
// milisegundos y el dato sigue llegando con la misma frescura (30s), que
// es como máximo cada cuanto cambian los datos de todas formas.
// Con la pestaña OCULTA no se pide nada (0 peticiones → 0 coste); al
// volver al frente se consulta al instante.

export const INTERVALO_SONDEO_MS = 30000;
const RETRASO_ERROR_MS = 5000; // como la reconexión a los 5s del SSE original

export function useMetricas(): DashboardPayload | null {
    const [datos, setDatos] = useState<DashboardPayload | null>(null);

    useEffect(() => {
        let vivo = true;
        let timer: ReturnType<typeof setTimeout> | null = null;

        async function consultar(): Promise<void> {
            timer = null;
            let retraso = INTERVALO_SONDEO_MS;
            try {
                const respuesta = await fetch('/api/metrics', { cache: 'no-store' });
                if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
                const payload = (await respuesta.json()) as DashboardPayload;
                if (vivo && payload.ok) setDatos(payload);
            } catch (e) {
                retraso = RETRASO_ERROR_MS;
                console.warn('Fallo consultando /api/metrics:', (e as Error).message);
            } finally {
                // No reprogramar con la pestaña oculta: al volver se
                // consulta desde alCambiarVisibilidad().
                if (vivo && !document.hidden) timer = setTimeout(consultar, retraso);
            }
        }

        function alCambiarVisibilidad(): void {
            if (document.hidden) {
                if (timer) {
                    clearTimeout(timer);
                    timer = null;
                }
            } else if (!timer) {
                void consultar();
            }
        }

        document.addEventListener('visibilitychange', alCambiarVisibilidad);
        void consultar();

        return () => {
            vivo = false;
            document.removeEventListener('visibilitychange', alCambiarVisibilidad);
            if (timer) clearTimeout(timer);
        };
    }, []);

    return datos;
}
