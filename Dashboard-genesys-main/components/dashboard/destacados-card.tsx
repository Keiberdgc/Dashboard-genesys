import { useEffect, useState } from 'react';
import { MessageSquareIcon, PhoneIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DestacadoItem } from '@/components/dashboard/destacado-item';
import type { Agente } from '@/types/metrics';

// Tarjeta "Destacados": alterna entre dos periodos (semana / mes) cada 30s.
// Si solo se pasa un periodo, no alterna.

interface PeriodoDestacado {
    titulo: string;
    voz?: Agente | null;
    msg?: Agente | null;
}

interface DestacadosCardProps {
    periodos: [PeriodoDestacado, ...PeriodoDestacado[]];
    intervaloMs?: number; // por defecto 30 000 ms
}

export function DestacadosCard({ periodos, intervaloMs = 30000 }: DestacadosCardProps) {
    const [idx, setIdx] = useState(0);
    const [visible, setVisible] = useState(true);

    useEffect(() => {
        if (periodos.length <= 1) return;
        const timer = setInterval(() => {
            // Fade out → cambiar → fade in
            setVisible(false);
            setTimeout(() => {
                setIdx(i => (i + 1) % periodos.length);
                setVisible(true);
            }, 350);
        }, intervaloMs);
        return () => clearInterval(timer);
    }, [periodos.length, intervaloMs]);

    const { titulo, voz, msg } = periodos[idx];

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <span className="size-2 shrink-0 rounded-full bg-oro" />
                    <span
                        style={{
                            transition: 'opacity 0.35s ease',
                            opacity: visible ? 1 : 0
                        }}
                    >
                        {titulo}
                    </span>
                    {periodos.length > 1 && (
                        <span className="ml-auto flex gap-1">
                            {periodos.map((_, i) => (
                                <span
                                    key={i}
                                    className="size-1.5 rounded-full transition-colors duration-300"
                                    style={{ background: i === idx ? 'var(--oro)' : 'var(--border)' }}
                                />
                            ))}
                        </span>
                    )}
                </CardTitle>
            </CardHeader>
            <CardContent
                className="grid grid-cols-2 gap-2"
                style={{
                    transition: 'opacity 0.35s ease',
                    opacity: visible ? 1 : 0
                }}
            >
                <DestacadoItem
                    etiqueta="Llamadas"
                    icono={PhoneIcon}
                    nombre={voz?.nombre ?? '—'}
                    tonoNombre="oro"
                    stats={[
                        { etiqueta: 'Atendidas', valor: voz?.vozManejadas ?? 0, tono: 'voz' },
                        { etiqueta: 'Perdidas', valor: voz?.vozPerdidas ?? 0, tono: 'peligro' },
                        { etiqueta: 'T.Habla', valor: voz?.tManejoVoz ?? '—' }
                    ]}
                />
                <DestacadoItem
                    etiqueta="Mensajes"
                    icono={MessageSquareIcon}
                    nombre={msg?.nombre ?? '—'}
                    tonoNombre="msg"
                    stats={[
                        { etiqueta: 'Atendidos', valor: msg?.msgManejadas ?? 0, tono: 'msg' },
                        { etiqueta: 'T.Chat', valor: msg?.tManejoMsg ?? '—' }
                    ]}
                />
            </CardContent>
        </Card>
    );
}
