import type { ReactNode } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TABS, type Tab } from '@/config/tabs';

// Barra de vistas del ranking. El tono (canal) y el tratamiento
// (hoy/semana) salen de config/tabs.ts; el contenido es la tabla.

interface TabsNavProps {
    valor: Tab;
    onCambio: (tab: Tab) => void;
    children: ReactNode;
}

export function TabsNav({ valor, onCambio, children }: TabsNavProps) {
    return (
        <Tabs value={valor} onValueChange={v => onCambio(v as Tab)}>
            <TabsList>
                {TABS.map(t => (
                    <TabsTrigger key={t.id} value={t.id} tono={t.tono} periodo={t.periodo}>
                        <t.icono aria-hidden />
                        {t.etiqueta}
                    </TabsTrigger>
                ))}
            </TabsList>
            <TabsContent value={valor}>{children}</TabsContent>
        </Tabs>
    );
}
