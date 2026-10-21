import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatBox, TotalBox, type StatDef } from '@/components/dashboard/stat-box';
import { TONO_FONDO, type Tono } from '@/config/tabs';
import { cn } from '@/lib/utils';
import type { TiempoRealCanal, Totales } from '@/types/metrics';

// Tarjeta "X_Soporte — ahora": 3 contadores en vivo + los totales
// del día. Misma estructura para voz y msg; solo cambia el canal.

interface RealtimeCardProps {
    canal: 'voz' | 'msg';
    titulo: string;
    conteo?: TiempoRealCanal;
    totales?: Totales;
}

const CONTEO_VACIO: TiempoRealCanal = { enEspera: 0, enAtencion: 0, enCola: 0 };
const TOTALES_VACIOS: Totales = { voz: { ofrecidas: 0, perdidas: 0 }, msg: { ofrecidas: 0 } };

export function RealtimeCard({ canal, titulo, conteo = CONTEO_VACIO, totales = TOTALES_VACIOS }: RealtimeCardProps) {
    const enAtencion: Tono = canal === 'voz' ? 'voz' : 'msg';

    const estados: StatDef[] = [
        { etiqueta: 'En espera', valor: conteo.enEspera, tono: 'peligro' },
        { etiqueta: 'En atención', valor: conteo.enAtencion, tono: enAtencion },
        { etiqueta: 'En cola', valor: conteo.enCola, tono: 'cielo' }
    ];

    const delDia: StatDef[] =
        canal === 'voz'
            ? [
                { etiqueta: 'Recibidas hoy', valor: totales.voz.ofrecidas, tono: 'voz' },
                { etiqueta: 'Perdidas', valor: totales.voz.perdidas, tono: 'peligro' }
            ]
            : [{ etiqueta: 'Recibidos hoy', valor: totales.msg.ofrecidas, tono: 'msg' }];

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <span className={cn('size-2 shrink-0 rounded-full', TONO_FONDO[canal])} />
                    {titulo}
                </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
                <div className="grid grid-cols-3 gap-1.5">
                    {estados.map(s => <StatBox key={s.etiqueta} {...s} />)}
                </div>
                <div className="grid grid-cols-2 gap-1.5 border-t border-border pt-2">
                    {delDia.map(t => (
                        <TotalBox key={t.etiqueta} {...t} className={cn(delDia.length === 1 && 'col-span-2')} />
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}
