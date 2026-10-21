'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronLeftIcon, ChevronRightIcon, MessageSquareIcon, PhoneIcon, PhoneOffIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DestacadoItem } from '@/components/dashboard/destacado-item';
import type { Agente } from '@/types/metrics';

// ── Bloque 1: Destacados (día / semana / mes) ─────────────────
interface PeriodoDestacado {
    titulo: string;
    voz?: Agente | null;
    msg?: Agente | null;
}

interface DestacadosCardProps {
    periodos: [PeriodoDestacado, ...PeriodoDestacado[]];
    intervaloMs?: number;
    // índice controlado externamente (sincronización)
    idxExterno?: number;
    onCambio?: (idx: number) => void;
}

export function DestacadosCard({ periodos, intervaloMs = 10000, idxExterno, onCambio }: DestacadosCardProps) {
    const [idxLocal, setIdxLocal] = useState(0);
    const [visible, setVisible] = useState(true);
    const modoExterno = idxExterno !== undefined;
    const idx = modoExterno ? idxExterno : idxLocal;

    const ir = (nuevo: number) => {
        setVisible(false);
        setTimeout(() => {
            const normalizado = ((nuevo % periodos.length) + periodos.length) % periodos.length;
            if (modoExterno) onCambio?.(normalizado);
            else setIdxLocal(normalizado);
            setVisible(true);
        }, 300);
    };

    // Auto-avance solo si no está controlado externamente
    useEffect(() => {
        if (modoExterno || periodos.length <= 1) return;
        const t = setInterval(() => ir(idxLocal + 1), intervaloMs);
        return () => clearInterval(t);
    }, [modoExterno, periodos.length, intervaloMs, idxLocal]);

    const { titulo, voz, msg } = periodos[idx] ?? periodos[0];

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <span className="size-2 shrink-0 rounded-full bg-oro" />
                    <span style={{ transition: 'opacity 0.3s ease', opacity: visible ? 1 : 0 }}>
                        {titulo}
                    </span>
                    {periodos.length > 1 && (
                        <span className="ml-auto flex items-center gap-1.5">
                            <button
                                onClick={() => ir(idx - 1)}
                                className="rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors"
                                aria-label="Anterior"
                            >
                                <ChevronLeftIcon className="size-3.5" />
                            </button>
                            {periodos.map((_, i) => (
                                <button
                                    key={i}
                                    onClick={() => ir(i)}
                                    className="size-1.5 rounded-full transition-colors duration-300"
                                    style={{ background: i === idx ? 'var(--oro)' : 'var(--border)' }}
                                    aria-label={`Ir a ${periodos[i].titulo}`}
                                />
                            ))}
                            <button
                                onClick={() => ir(idx + 1)}
                                className="rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors"
                                aria-label="Siguiente"
                            >
                                <ChevronRightIcon className="size-3.5" />
                            </button>
                        </span>
                    )}
                </CardTitle>
            </CardHeader>
            <CardContent
                className="grid grid-cols-2 gap-2"
                style={{ transition: 'opacity 0.3s ease', opacity: visible ? 1 : 0 }}
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

// ── Bloque 2: Indicadores de atención ────────────────────────
// Tarjeta 1: agente con más llamadas perdidas hoy
// Tarjeta 2: agente con mayor tiempo de manejo en voz hoy
// Tarjeta 3: agente con mayor tiempo de manejo en chat hoy

interface IndicadoresData {
    mayorPerdidas?: Agente | null;
    mayorTManejoVoz?: Agente | null;
    mayorTManejoChat?: Agente | null;
}

interface IndicadoresCardProps {
    data: IndicadoresData;
    intervaloMs?: number;
    // índice controlado externamente (sincronización)
    idxExterno?: number;
    onCambio?: (idx: number) => void;
}

const TARJETAS_INDICADORES = [
    { titulo: 'Mayor llamadas perdidas — Hoy', key: 'mayorPerdidas' as const },
    { titulo: 'Mayor t. manejo voz — Hoy', key: 'mayorTManejoVoz' as const },
    { titulo: 'Mayor t. manejo chat — Hoy', key: 'mayorTManejoChat' as const },
];

export function IndicadoresCard({ data, intervaloMs = 10000, idxExterno, onCambio }: IndicadoresCardProps) {
    const [idxLocal, setIdxLocal] = useState(0);
    const [visible, setVisible] = useState(true);
    const modoExterno = idxExterno !== undefined;
    const idx = modoExterno ? idxExterno : idxLocal;
    const total = TARJETAS_INDICADORES.length;

    const ir = (nuevo: number) => {
        setVisible(false);
        setTimeout(() => {
            const normalizado = ((nuevo % total) + total) % total;
            if (modoExterno) onCambio?.(normalizado);
            else setIdxLocal(normalizado);
            setVisible(true);
        }, 300);
    };

    useEffect(() => {
        if (modoExterno) return;
        const t = setInterval(() => ir(idxLocal + 1), intervaloMs);
        return () => clearInterval(t);
    }, [modoExterno, intervaloMs, idxLocal]);

    const tarjeta = TARJETAS_INDICADORES[idx];
    const agente = data[tarjeta.key];

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <span className="size-2 shrink-0 rounded-full bg-peligro" />
                    <span style={{ transition: 'opacity 0.3s ease', opacity: visible ? 1 : 0 }}>
                        {tarjeta.titulo}
                    </span>
                    <span className="ml-auto flex items-center gap-1.5">
                        <button
                            onClick={() => ir(idx - 1)}
                            className="rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors"
                            aria-label="Anterior"
                        >
                            <ChevronLeftIcon className="size-3.5" />
                        </button>
                        {TARJETAS_INDICADORES.map((_, i) => (
                            <button
                                key={i}
                                onClick={() => ir(i)}
                                className="size-1.5 rounded-full transition-colors duration-300"
                                style={{ background: i === idx ? 'var(--peligro)' : 'var(--border)' }}
                                aria-label={`Ir a ${TARJETAS_INDICADORES[i].titulo}`}
                            />
                        ))}
                        <button
                            onClick={() => ir(idx + 1)}
                            className="rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors"
                            aria-label="Siguiente"
                        >
                            <ChevronRightIcon className="size-3.5" />
                        </button>
                    </span>
                </CardTitle>
            </CardHeader>
            <CardContent
                style={{ transition: 'opacity 0.3s ease', opacity: visible ? 1 : 0 }}
            >
                {idx === 0 && (
                    <DestacadoItem
                        etiqueta="Más perdidas (voz)"
                        icono={PhoneOffIcon}
                        nombre={agente?.nombre ?? '—'}
                        tonoNombre="peligro"
                        stats={[
                            { etiqueta: 'Perdidas', valor: agente?.vozPerdidas ?? 0, tono: 'peligro' },
                            { etiqueta: 'Atendidas', valor: agente?.vozManejadas ?? 0, tono: 'voz' },
                            { etiqueta: 'T.Habla', valor: agente?.tManejoVoz ?? '—' }
                        ]}
                    />
                )}
                {idx === 1 && (
                    <DestacadoItem
                        etiqueta="Mayor t. manejo voz"
                        icono={PhoneIcon}
                        nombre={agente?.nombre ?? '—'}
                        tonoNombre="voz"
                        stats={[
                            { etiqueta: 'T.Habla', valor: agente?.tManejoVoz ?? '—', tono: 'voz' },
                            { etiqueta: 'Atendidas', valor: agente?.vozManejadas ?? 0, tono: 'voz' },
                            { etiqueta: 'Perdidas', valor: agente?.vozPerdidas ?? 0, tono: 'peligro' }
                        ]}
                    />
                )}
                {idx === 2 && (
                    <DestacadoItem
                        etiqueta="Mayor t. manejo chat"
                        icono={MessageSquareIcon}
                        nombre={agente?.nombre ?? '—'}
                        tonoNombre="msg"
                        stats={[
                            { etiqueta: 'T.Chat', valor: agente?.tManejoMsg ?? '—', tono: 'msg' },
                            { etiqueta: 'Atendidos', valor: agente?.msgManejadas ?? 0, tono: 'msg' }
                        ]}
                    />
                )}
            </CardContent>
        </Card>
    );
}

// ── Wrapper sincronizador ─────────────────────────────────────
// Mantiene un índice compartido entre DestacadosCard e IndicadoresCard
// y lo avanza automáticamente cada intervaloMs.

interface DualDestacadosProps {
    periodos: [PeriodoDestacado, ...PeriodoDestacado[]];
    indicadores: IndicadoresData;
    intervaloMs?: number;
}

export function DualDestacados({ periodos, indicadores, intervaloMs = 10000 }: DualDestacadosProps) {
    const [idx, setIdx] = useState(0);
    const [visible, setVisible] = useState(true);
    // El número de "slides" es el mayor entre los dos bloques
    const total = Math.max(periodos.length, TARJETAS_INDICADORES.length);

    const ir = (nuevo: number) => {
        setVisible(false);
        setTimeout(() => {
            setIdx(((nuevo % total) + total) % total);
            setVisible(true);
        }, 300);
    };

    useEffect(() => {
        const t = setInterval(() => ir(idx + 1), intervaloMs);
        return () => clearInterval(t);
    }, [idx, intervaloMs, total]);

    // Índice ajustado a cada bloque (por si tienen diferente longitud)
    const idxDestacados = idx % periodos.length;
    const idxIndicadores = idx % TARJETAS_INDICADORES.length;

    return (
        <>
            <DestacadosCard
                periodos={periodos}
                idxExterno={idxDestacados}
                onCambio={ir}
            />
            <IndicadoresCard
                data={indicadores}
                idxExterno={idxIndicadores}
                onCambio={ir}
            />
        </>
    );
}
