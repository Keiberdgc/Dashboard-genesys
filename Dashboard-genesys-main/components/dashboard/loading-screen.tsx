import { Spinner } from '@/components/ui/spinner';

// Pantalla de conexión (solo hasta el primer payload del sondeo).

export function LoadingScreen() {
    return (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3.5 bg-background">
            <Spinner className="size-9 text-primary" />
            <p className="text-[13px] text-muted-foreground">Conectando con Genesys Cloud...</p>
        </div>
    );
}
