import { MessageSquareIcon, PhoneIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DestacadoItem } from '@/components/dashboard/destacado-item';
import type { Agente } from '@/types/metrics';

// Tarjeta "Destacados": el mejor de llamadas y el de mensajes.
// Una sola implementación para el día y para la semana.

interface DestacadosCardProps {
    titulo: string;
    voz?: Agente | null;
    msg?: Agente | null;
}

export function DestacadosCard({ titulo, voz, msg }: DestacadosCardProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <span className="size-2 shrink-0 rounded-full bg-oro" />
                    {titulo}
                </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2">
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
