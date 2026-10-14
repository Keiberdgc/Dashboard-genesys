import { cn } from '@/lib/utils';
import { TONO_CLASES, type Tono } from '@/config/tabs';

// Cajas numéricas de las tarjetas: un dato = una caja.
// El color sale del token de canal, nunca de un valor crudo.

export interface StatDef {
    etiqueta: string;
    valor: number | string;
    tono?: Tono;
}

export function StatBox({ etiqueta, valor, tono = 'neutro' }: StatDef) {
    return (
        <div className="flex flex-col items-center gap-1 rounded-lg border border-border bg-background px-1 py-2">
            <div className={cn('text-3xl leading-none font-bold tabular-nums', TONO_CLASES[tono])}>{valor}</div>
            <div className="text-[10px] leading-tight text-muted-foreground">{etiqueta}</div>
        </div>
    );
}

export function TotalBox({ etiqueta, valor, tono = 'neutro', className }: StatDef & { className?: string }) {
    return (
        <div className={cn('flex flex-col gap-0.5 rounded-lg border border-border bg-background px-2 py-1.5', className)}>
            <span className="text-[10px] leading-tight text-muted-foreground">{etiqueta}</span>
            <span className={cn('text-base leading-none font-bold tabular-nums', TONO_CLASES[tono])}>{valor}</span>
        </div>
    );
}
