import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { type Canal } from '@/config/tabs';
import type { Agente } from '@/types/metrics';

// Tabla de ranking. Las columnas y el valor que manda ("rank")
// cambian según el canal de la vista activa.

const COLUMNAS: Record<Canal, { rank: string; tChat: string }> = {
    total: { rank: 'Total', tChat: 'T. Chat MSG' },
    voz: { rank: 'Llamadas (rank)', tChat: 'T. Chat MSG' },
    msg: { rank: 'Mensajes (rank)', tChat: 'T. Chat (rank)' }
};

/** Tono del badge de posición: 1º oro, 2º plata, 3º bronce */
const TONOS_RANK = ['oro', 'plata', 'bronce'] as const;

interface RankingTableProps {
    filas: Agente[];
    canal: Canal;
    cargando: boolean;
}

export function RankingTable({ filas, canal, cargando }: RankingTableProps) {
    const { rank, tChat } = COLUMNAS[canal];
    const destacado = (a: Agente) => (canal === 'voz' ? a.vozManejadas : canal === 'msg' ? a.msgManejadas : a.total);

    return (
        <Card className="py-0">
            <CardContent className="p-0">
                <Table>
                    <TableHeader className="[&_th]:text-[10px] [&_th]:tracking-wider [&_th]:text-muted-foreground [&_th]:uppercase">
                        <TableRow className="bg-background/50 hover:bg-background/50">
                            <TableHead className="w-10">#</TableHead>
                            <TableHead>Agente</TableHead>
                            <TableHead>{rank}</TableHead>
                            <TableHead>Llamadas</TableHead>
                            <TableHead>Mensajes</TableHead>
                            <TableHead>Perdidas</TableHead>
                            <TableHead>T. Habla voz</TableHead>
                            <TableHead>{tChat}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {cargando ? (
                            <TableRow className="hover:bg-transparent">
                                <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                                    <span className="inline-flex items-center gap-2">
                                        <Spinner /> Cargando...
                                    </span>
                                </TableCell>
                            </TableRow>
                        ) : (
                            filas.map((a, i) => (
                                <TableRow key={`${canal}-${a.nombre}-${i}`}>
                                    <TableCell>
                                        <Badge variant="secondary" tono={TONOS_RANK[i]} className="min-w-5 px-0 font-bold">
                                            {i + 1}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="font-semibold">{a.nombre}</TableCell>
                                    <TableCell className="text-sm font-bold tabular-nums">{destacado(a)}</TableCell>
                                    <TableCell><Badge tono="voz">{a.vozManejadas}</Badge></TableCell>
                                    <TableCell><Badge tono="msg">{a.msgManejadas}</Badge></TableCell>
                                    <TableCell><Badge tono="peligro">{a.vozPerdidas}</Badge></TableCell>
                                    <TableCell className="tabular-nums">{a.tManejoVoz}</TableCell>
                                    <TableCell className="tabular-nums">{a.tManejoMsg}</TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
}
