'use client';

import { useEffect, useState } from 'react';
import type { DashboardPayload } from '@/types/metrics';

// SSE con la reconexión manual a los 5s del dashboard original.
// Devuelve el último payload válido recibido (null hasta el primero).

export function useMetricas(): DashboardPayload | null {
    const [datos, setDatos] = useState<DashboardPayload | null>(null);

    useEffect(() => {
        let sse: EventSource | null = null;
        let reconnect: ReturnType<typeof setTimeout> | null = null;

        const conectar = () => {
            sse = new EventSource('/api/stream');

            sse.onmessage = (e) => {
                try {
                    const d = JSON.parse(e.data) as DashboardPayload;
                    if (d.ok) setDatos(d);
                } catch (err) { console.error('Error parseando SSE:', err); }
            };

            sse.onerror = () => {
                console.warn('SSE desconectado, reconectando en 5s...');
                sse?.close();
                reconnect = setTimeout(conectar, 5000); // reconexión automática
            };
        };

        conectar();

        return () => {
            sse?.close();
            if (reconnect) clearTimeout(reconnect);
        };
    }, []);

    return datos;
}
