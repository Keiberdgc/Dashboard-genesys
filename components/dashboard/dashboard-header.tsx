import { Separator } from '@/components/ui/separator';

// Cabecera: banner con el reloj en vivo y la hora del último payload.

interface DashboardHeaderProps {
    reloj: string;
    actualizacion: string | null;
}

export function DashboardHeader({ reloj, actualizacion }: DashboardHeaderProps) {
    return (
        <header className="mb-3">
            <div className="relative mx-auto mb-2 h-[120px] w-full max-w-[1280px] overflow-hidden rounded-xl">
                <img
                    src="/cabecera_dashboard.png"
                    alt="Thunder Net Soporte Técnico"
                    className="block size-full object-cover object-center"
                />
                <div className="absolute inset-y-0 right-0 flex flex-col items-end justify-center gap-1 bg-linear-to-l from-background/90 via-background/70 to-transparent px-4">
                    <div className="text-lg leading-none font-bold tabular-nums text-primary">{reloj}</div>
                    <div className="text-right text-[11px] leading-none text-muted-foreground">
                        {actualizacion ? `Últ. actualización: ${actualizacion}` : 'Cargando...'}
                    </div>
                </div>
            </div>
            <Separator />
        </header>
    );
}
