'use client';

import { useState, type ReactNode } from 'react';
import { ChevronDownIcon } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TABS_DIRECTOS, GRUPOS_TABS, type Tab, type GrupoTab, type TabDef } from '@/config/tabs';
import { cn } from '@/lib/utils';

// Barra de vistas del ranking con soporte de submenús.
// Los tabs directos se muestran como antes.
// Los grupos (perdidas, tManejoVoz, tManejoChat) muestran un botón
// con dropdown de submenú (Hoy / Semana / Mes).

interface TabsNavProps {
    valor: Tab;
    onCambio: (tab: Tab) => void;
    children: ReactNode;
}

// Mapeo de tono a clases de color
const TONO_BTN: Record<string, string> = {
    voz: 'text-voz/80 hover:text-voz border-voz/40 bg-voz/15',
    msg: 'text-msg/80 hover:text-msg border-msg/40 bg-msg/15',
    cielo: 'text-cielo/80 hover:text-cielo border-cielo/40 bg-cielo/15',
    peligro: 'text-peligro/80 hover:text-peligro border-peligro/40 bg-peligro/15',
};

const TONO_ACTIVO: Record<string, string> = {
    voz: 'border-voz/40 bg-voz/15 text-voz',
    msg: 'border-msg/40 bg-msg/15 text-msg',
    cielo: 'border-cielo/40 bg-cielo/15 text-cielo',
    peligro: 'border-peligro/40 bg-peligro/15 text-peligro',
};

function GrupoDropdown({
    grupo,
    tabActual,
    onCambio,
}: {
    grupo: GrupoTab;
    tabActual: Tab;
    onCambio: (tab: Tab) => void;
}) {
    const [abierto, setAbierto] = useState(false);
    const tabDelGrupo = grupo.tabs.find(t => t.id === tabActual);
    const estaActivo = !!tabDelGrupo;
    const Icono = grupo.icono;

    // Etiqueta del subperiodo activo
    const subEtiqueta = tabDelGrupo
        ? tabDelGrupo.periodo === 'hoy' ? 'Hoy'
            : tabDelGrupo.periodo === 'semana' ? 'Semana'
                : 'Mes'
        : null;

    return (
        <div className="relative">
            <button
                onClick={() => setAbierto(v => !v)}
                onBlur={() => setTimeout(() => setAbierto(false), 150)}
                className={cn(
                    'relative inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md border px-3 py-0.5 text-sm font-medium whitespace-nowrap transition-all',
                    estaActivo
                        ? TONO_ACTIVO[grupo.tono]
                        : cn('border-transparent', TONO_BTN[grupo.tono])
                )}
            >
                <Icono className="size-4" aria-hidden />
                {grupo.etiqueta}
                {subEtiqueta && (
                    <span className="ml-0.5 rounded px-1 py-0 text-[10px] font-bold opacity-80 border border-current/30">
                        {subEtiqueta}
                    </span>
                )}
                <ChevronDownIcon className={cn('size-3.5 transition-transform', abierto && 'rotate-180')} />
            </button>

            {abierto && (
                <div className="absolute left-0 top-full z-50 mt-1 min-w-[130px] rounded-lg border border-border bg-card p-1 shadow-lg">
                    {grupo.tabs.map(t => {
                        const subLabel = t.periodo === 'hoy' ? 'Hoy'
                            : t.periodo === 'semana' ? 'Semana'
                                : 'Mes';
                        return (
                            <button
                                key={t.id}
                                onClick={() => { onCambio(t.id); setAbierto(false); }}
                                className={cn(
                                    'flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors',
                                    tabActual === t.id
                                        ? cn('font-semibold', TONO_ACTIVO[grupo.tono])
                                        : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                                )}
                            >
                                {subLabel}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

export function TabsNav({ valor, onCambio, children }: TabsNavProps) {
    // Determinar qué tab está activo entre los directos
    const tabDirecto = TABS_DIRECTOS.find(t => t.id === valor);

    return (
        <Tabs value={valor} onValueChange={v => onCambio(v as Tab)}>
            <div className="inline-flex w-full flex-wrap items-center gap-1 rounded-lg bg-muted p-[3px] mb-2">
                <TabsList className="bg-transparent p-0 gap-1 flex-wrap h-auto">
                    {TABS_DIRECTOS.map(t => (
                        <TabsTrigger
                            key={t.id}
                            value={t.id}
                            tono={t.tono === 'peligro' ? 'neutro' : t.tono}
                            periodo={t.periodo === 'mes' ? 'semana' : t.periodo}
                        >
                            <t.icono aria-hidden />
                            {t.etiqueta}
                        </TabsTrigger>
                    ))}
                </TabsList>
                {/* Grupos con submenú — fuera del TabsList para no romper Base UI */}
                {GRUPOS_TABS.map(g => (
                    <GrupoDropdown
                        key={g.id}
                        grupo={g}
                        tabActual={valor}
                        onCambio={onCambio}
                    />
                ))}
            </div>
            <TabsContent value={valor}>{children}</TabsContent>
        </Tabs>
    );
}
