'use client';

import { useEffect, useState } from 'react';

/** Reloj local es-VE con segundos, actualizado cada segundo. */
export function useReloj(): string {
    const [reloj, setReloj] = useState('--:--:--');

    useEffect(() => {
        const tick = () =>
            setReloj(new Date().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, []);

    return reloj;
}
