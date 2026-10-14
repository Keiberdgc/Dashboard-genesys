import type { LucideIcon } from 'lucide-react';
import type { StatDef } from '@/components/dashboard/stat-box';
import { TONO_CLASES, type Tono } from '@/config/tabs';
import { cn } from '@/lib/utils';

// Mini-ficha de un agente destacado (icono + nombre + stats).

interface DestacadoItemProps {
    etiqueta: string;
    icono: LucideIcon;
    nombre: string;
    tonoNombre: Tono;
    stats: StatDef[];
}

export function DestacadoItem({ etiqueta, icono: Icono, nombre, tonoNombre, stats }: DestacadoItemProps) {
    return (
        <div className="relative overflow-hidden rounded-lg border border-border bg-background p-2.5">
            <Icono aria-hidden className="absolute right-2 top-2 size-4 text-oro opacity-30" />
            <div className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">{etiqueta}</div>
            <div className={cn('mb-1.5 truncate pr-6 text-sm font-bold', TONO_CLASES[tonoNombre])}>{nombre}</div>
            <div className="flex gap-1">
                {stats.map(s => (
                    <div key={s.etiqueta} className="flex-1 rounded-md border border-border bg-card px-1 py-1 text-center">
                        <div className={cn('text-xs leading-tight font-bold tabular-nums', TONO_CLASES[s.tono ?? 'neutro'])}>
                            {s.valor}
                        </div>
                        <div className="mt-0.5 text-[9px] leading-tight uppercase text-muted-foreground">{s.etiqueta}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}
