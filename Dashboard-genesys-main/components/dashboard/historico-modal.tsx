'use client';

// Modal de consulta histórica: selector de rango + presets + resultados.
// Se abre con el botón "Histórico" del header. No modifica nada del dashboard
// en tiempo real — es una capa paralela e independiente.

import { useState, useCallback, useEffect, useRef } from 'react';
import { CalendarIcon, XIcon, SearchIcon, PhoneIcon, MessageSquareIcon, LayersIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { Agente, RankingAgents, Totales } from '@/types/metrics';

// ── TIPOS ─────────────────────────────────────────────────
interface ResultadoHistorico {
    ok: boolean;
    error?: string;
    intervalo?: { desde: string; hasta: string };
    totales?: Totales;
    ranking?: RankingAgents;
}

type TabHistorico = 'todos' | 'top5Voz' | 'top5Msg';

// ── PRESETS ───────────────────────────────────────────────
// Todos los cálculos en hora Venezuela (UTC-4, sin horario de verano).
const TZ = -4;

function ahoraVE(): Date {
    return new Date(Date.now() + TZ * 3600000);
}

// Devuelve medianoche VE en UTC para un día VE dado (año, mes 0-based, día)
function medianochUTC(año: number, mes: number, dia: number): Date {
    return new Date(Date.UTC(año, mes, dia, -TZ, 0, 0, 0));
}

// Devuelve medianoche VE de hoy en UTC
function medianochHoy(): Date {
    const ve = ahoraVE();
    return medianochUTC(ve.getUTCFullYear(), ve.getUTCMonth(), ve.getUTCDate());
}

interface Preset {
    id: string;
    etiqueta: string;
    obtener: () => { desde: Date; hasta: Date };
}

const PRESETS: Preset[] = [
    {
        id: 'ayer',
        etiqueta: 'Ayer',
        obtener() {
            const inicio = medianochHoy();
            inicio.setUTCDate(inicio.getUTCDate() - 1);
            // hasta = 23:59:59 VE de ayer = medianoche hoy UTC - 1s
            const fin = new Date(medianochHoy().getTime() - 1000);
            return { desde: inicio, hasta: fin };
        }
    },
    {
        id: 'semana_pasada',
        etiqueta: 'Semana pasada',
        obtener() {
            const ve = ahoraVE();
            const dow = ve.getUTCDay(); // 0=dom
            // Lunes de la semana pasada (lunes=1..dom=0)
            const diasHastaLunes = dow === 0 ? 13 : dow + 6;
            const lunes = medianochUTC(ve.getUTCFullYear(), ve.getUTCMonth(), ve.getUTCDate() - diasHastaLunes);
            // Domingo 23:59:59 VE = lunes siguiente 03:59:59 UTC
            // = medianoche lunes UTC + 7 días - 1 segundo
            const domingoFinUTC = new Date(lunes.getTime() + 7 * 86400000 - 1000);
            return { desde: lunes, hasta: domingoFinUTC };
        }
    },
    {
        id: 'semana_actual',
        etiqueta: 'Esta semana',
        obtener() {
            const ve = ahoraVE();
            const dow = ve.getUTCDay();
            const diasHastaLunes = dow === 0 ? 6 : dow - 1;
            const lunes = medianochUTC(ve.getUTCFullYear(), ve.getUTCMonth(), ve.getUTCDate() - diasHastaLunes);
            const ahora = new Date();
            return { desde: lunes, hasta: ahora };
        }
    },
    {
        id: 'mes_pasado',
        etiqueta: 'Mes pasado',
        obtener() {
            const ve = ahoraVE();
            const mesAnterior = ve.getUTCMonth() === 0 ? 11 : ve.getUTCMonth() - 1;
            const añoMes = ve.getUTCMonth() === 0 ? ve.getUTCFullYear() - 1 : ve.getUTCFullYear();
            const inicio = medianochUTC(añoMes, mesAnterior, 1);
            // hasta = 23:59:59 VE del último día del mes anterior
            const finMes = new Date(medianochUTC(ve.getUTCFullYear(), ve.getUTCMonth(), 1).getTime() - 1000);
            return { desde: inicio, hasta: finMes };
        }
    },
    {
        id: 'mes_actual',
        etiqueta: 'Este mes',
        obtener() {
            const ve = ahoraVE();
            const inicio = medianochUTC(ve.getUTCFullYear(), ve.getUTCMonth(), 1);
            const ahora = new Date();
            return { desde: inicio, hasta: ahora };
        }
    }
];

// ── HELPERS UI ────────────────────────────────────────────
// Formatea Date a "YYYY-MM-DD" en hora VE (para los <input type="date">)
function dateToInputVE(d: Date): string {
    const ve = new Date(d.getTime() + TZ * 3600000);
    return ve.toISOString().slice(0, 10);
}

// Convierte "YYYY-MM-DD" de hora VE a medianoche UTC correspondiente
function inputVEToUTC(s: string): Date {
    const [y, m, d] = s.split('-').map(Number);
    return medianochUTC(y, m - 1, d);
}

// Formatea intervalo para mostrar al usuario.
// "hasta" es 23:59:59 VE del último día incluido, así que se muestra directo.
function formatarIntervalo(desde: string, hasta: string): string {
    const fmt = (iso: string) =>
        new Date(iso).toLocaleDateString('es-VE', {
            timeZone: 'America/Caracas',
            day: '2-digit', month: 'short', year: 'numeric'
        });
    return `${fmt(desde)} → ${fmt(hasta)}`;
}

// ── SUBCOMPONENTES ────────────────────────────────────────
const TONOS_RANK = ['oro', 'plata', 'bronce'] as const;

type Canal = 'todos' | 'voz' | 'msg';

function TablaRanking({ filas, canal }: { filas: Agente[]; canal: Canal }) {
    const destacado = (a: Agente) =>
        canal === 'voz' ? a.vozManejadas : canal === 'msg' ? a.msgManejadas : a.total;
    const rankLabel = canal === 'voz' ? 'Llamadas (rank)' : canal === 'msg' ? 'Mensajes (rank)' : 'Total';

    if (!filas.length) {
        return (
            <div className="py-10 text-center text-sm text-muted-foreground">
                Sin datos para este período
            </div>
        );
    }

    return (
        <Table>
            <TableHeader className="[&_th]:text-[10px] [&_th]:tracking-wider [&_th]:uppercase [&_th]:text-muted-foreground">
                <TableRow className="bg-background/50 hover:bg-background/50">
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Agente</TableHead>
                    <TableHead>{rankLabel}</TableHead>
                    <TableHead>Llamadas</TableHead>
                    <TableHead>Mensajes</TableHead>
                    <TableHead>Perdidas</TableHead>
                    <TableHead>T. Habla voz</TableHead>
                    <TableHead>T. Chat MSG</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {filas.map((a, i) => (
                    <TableRow key={`${a.nombre}-${i}`}>
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
                ))}
            </TableBody>
        </Table>
    );
}

function TarjetasTotales({ totales }: { totales: Totales }) {
    return (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
                { etiqueta: 'Llamadas recibidas', valor: totales.voz.ofrecidas, color: 'text-voz' },
                { etiqueta: 'Llamadas perdidas', valor: totales.voz.perdidas, color: 'text-peligro' },
                { etiqueta: 'Mensajes recibidos', valor: totales.msg.ofrecidas, color: 'text-msg' },
                {
                    etiqueta: 'Tasa abandono',
                    valor: totales.voz.ofrecidas > 0
                        ? `${Math.round((totales.voz.perdidas / totales.voz.ofrecidas) * 100)}%`
                        : '—',
                    color: 'text-oro'
                }
            ].map(({ etiqueta, valor, color }) => (
                <div key={etiqueta} className="flex flex-col gap-1 rounded-lg border border-border bg-background px-3 py-2.5">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{etiqueta}</span>
                    <span className={cn('text-2xl font-bold tabular-nums leading-none', color)}>{valor}</span>
                </div>
            ))}
        </div>
    );
}

// ── MODAL PRINCIPAL ───────────────────────────────────────
interface HistoricoModalProps {
    abierto: boolean;
    onCerrar: () => void;
}

export function HistoricoModal({ abierto, onCerrar }: HistoricoModalProps) {
    const hoy = dateToInputVE(new Date());

    // Inicializar con el preset "ayer" para que los inputs ya muestren
    // las fechas correctas sin necesidad de hacer clic en el botón.
    const [desdeInput, setDesdeInput] = useState(() => {
        const { desde } = PRESETS.find(p => p.id === 'ayer')!.obtener();
        return dateToInputVE(desde);
    });
    const [hastaInput, setHastaInput] = useState(() => {
        const { hasta } = PRESETS.find(p => p.id === 'ayer')!.obtener();
        return dateToInputVE(hasta);
    });
    const [presetActivo, setPresetActivo] = useState<string | null>('ayer');
    const [cargando, setCargando] = useState(false);
    const [resultado, setResultado] = useState<ResultadoHistorico | null>(null);
    const [tabActiva, setTabActiva] = useState<TabHistorico>('todos');

    const overlayRef = useRef<HTMLDivElement>(null);

    // Cerrar con Escape
    useEffect(() => {
        if (!abierto) return;
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [abierto, onCerrar]);

    // Bloquear scroll del body mientras está abierto
    useEffect(() => {
        document.body.style.overflow = abierto ? 'hidden' : '';
        return () => { document.body.style.overflow = ''; };
    }, [abierto]);

    const aplicarPreset = useCallback((preset: Preset) => {
        const { desde, hasta } = preset.obtener();
        setDesdeInput(dateToInputVE(desde));
        setHastaInput(dateToInputVE(hasta));
        setPresetActivo(preset.id);
        setResultado(null);
    }, []);

    const consultar = useCallback(async () => {
        if (!desdeInput || !hastaInput) return;
        const desdeUTC = inputVEToUTC(desdeInput);
        // "hasta" inclusivo: fin del día seleccionado en VE = medianoche siguiente UTC - 1s
        // Así el 20/10 como "hasta" cubre hasta las 23:59:59 VE del 20/10.
        const hastaBase = inputVEToUTC(hastaInput);
        hastaBase.setUTCDate(hastaBase.getUTCDate() + 1);
        const hastaUTC = new Date(hastaBase.getTime() - 1000);

        setCargando(true);
        setResultado(null);
        try {
            const url = `/api/historico?desde=${encodeURIComponent(desdeUTC.toISOString())}&hasta=${encodeURIComponent(hastaUTC.toISOString())}`;
            const r = await fetch(url, { cache: 'no-store' });
            const json = await r.json() as ResultadoHistorico;
            setResultado(json);
            setTabActiva('todos');
        } catch (e) {
            setResultado({ ok: false, error: (e as Error).message });
        } finally {
            setCargando(false);
        }
    }, [desdeInput, hastaInput]);

    const filaActiva = (): Agente[] => {
        if (!resultado?.ranking) return [];
        return tabActiva === 'top5Voz'
            ? resultado.ranking.top5Voz
            : tabActiva === 'top5Msg'
                ? resultado.ranking.top5Msg
                : resultado.ranking.todos;
    };

    const canalActivo = (): Canal =>
        tabActiva === 'top5Voz' ? 'voz' : tabActiva === 'top5Msg' ? 'msg' : 'todos';

    if (!abierto) return null;

    return (
        // Overlay
        <div
            ref={overlayRef}
            className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-background/80 backdrop-blur-sm p-4 pt-10"
            onClick={e => { if (e.target === overlayRef.current) onCerrar(); }}
        >
            {/* Panel */}
            <div className="relative w-full max-w-5xl rounded-xl border border-border bg-card shadow-2xl">

                {/* Cabecera */}
                <div className="flex items-center justify-between border-b border-border px-5 py-4">
                    <div className="flex items-center gap-2.5">
                        <CalendarIcon className="size-5 text-primary" />
                        <h2 className="text-base font-semibold text-foreground">Consulta histórica</h2>
                    </div>
                    <button
                        onClick={onCerrar}
                        className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        aria-label="Cerrar"
                    >
                        <XIcon className="size-4" />
                    </button>
                </div>

                {/* Selector */}
                <div className="border-b border-border px-5 py-4 space-y-3">
                    {/* Presets */}
                    <div className="flex flex-wrap gap-2">
                        {PRESETS.map(p => (
                            <button
                                key={p.id}
                                onClick={() => aplicarPreset(p)}
                                className={cn(
                                    'rounded-md border px-3 py-1 text-xs font-medium transition-colors',
                                    presetActivo === p.id
                                        ? 'border-primary bg-primary/10 text-primary'
                                        : 'border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground'
                                )}
                            >
                                {p.etiqueta}
                            </button>
                        ))}
                    </div>

                    {/* Rango manual */}
                    <div className="flex flex-wrap items-end gap-3">
                        <div className="flex flex-col gap-1">
                            <label className="text-[11px] text-muted-foreground uppercase tracking-wider">Desde</label>
                            <input
                                type="date"
                                value={desdeInput}
                                max={hastaInput}
                                onChange={e => { setDesdeInput(e.target.value); setPresetActivo(null); setResultado(null); }}
                                className="rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                            />
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-[11px] text-muted-foreground uppercase tracking-wider">Hasta</label>
                            <input
                                type="date"
                                value={hastaInput}
                                min={desdeInput}
                                max={hoy}
                                onChange={e => { setHastaInput(e.target.value); setPresetActivo(null); setResultado(null); }}
                                className="rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                            />
                        </div>
                        <button
                            onClick={consultar}
                            disabled={cargando || !desdeInput || !hastaInput}
                            className={cn(
                                'flex items-center gap-2 rounded-md px-4 py-1.5 text-sm font-semibold transition-colors',
                                cargando || !desdeInput || !hastaInput
                                    ? 'cursor-not-allowed bg-muted text-muted-foreground'
                                    : 'bg-primary text-primary-foreground hover:bg-primary/90'
                            )}
                        >
                            {cargando ? <Spinner /> : <SearchIcon className="size-3.5" />}
                            {cargando ? 'Consultando...' : 'Consultar'}
                        </button>
                    </div>
                </div>

                {/* Resultados */}
                <div className="px-5 py-4">
                    {/* Estado inicial */}
                    {!resultado && !cargando && (
                        <div className="py-12 text-center text-sm text-muted-foreground">
                            Selecciona un período y presiona <strong className="text-foreground">Consultar</strong>
                        </div>
                    )}

                    {/* Cargando */}
                    {cargando && (
                        <div className="py-12 flex flex-col items-center gap-3 text-sm text-muted-foreground">
                            <Spinner />
                            <span>Consultando Genesys Cloud…</span>
                        </div>
                    )}

                    {/* Error */}
                    {resultado && !resultado.ok && (
                        <div className="py-8 text-center text-sm text-destructive">
                            ⚠️ {resultado.error || 'Error desconocido'}
                        </div>
                    )}

                    {/* Datos */}
                    {resultado?.ok && resultado.totales && resultado.ranking && resultado.intervalo && (
                        <div className="space-y-4">
                            {/* Subtítulo con el rango real consultado */}
                            <p className="text-xs text-muted-foreground">
                                Período: <span className="font-medium text-foreground">
                                    {formatarIntervalo(resultado.intervalo.desde, resultado.intervalo.hasta)}
                                </span>
                            </p>

                            {/* Totales */}
                            <TarjetasTotales totales={resultado.totales} />

                            {/* Tabs de ranking */}
                            <Card className="py-0">
                                <CardHeader className="border-b border-border px-4 py-3">
                                    <div className="flex items-center justify-between">
                                        <CardTitle className="text-sm">Ranking de agentes</CardTitle>
                                        <div className="flex gap-1">
                                            {(
                                                [
                                                    { id: 'todos', label: 'Todos', icon: LayersIcon, tono: 'cielo' },
                                                    { id: 'top5Voz', label: 'Top 5 Llamadas', icon: PhoneIcon, tono: 'voz' },
                                                    { id: 'top5Msg', label: 'Top 5 Mensajes', icon: MessageSquareIcon, tono: 'msg' }
                                                ] as const
                                            ).map(({ id, label, icon: Icon, tono }) => (
                                                <button
                                                    key={id}
                                                    onClick={() => setTabActiva(id)}
                                                    className={cn(
                                                        'flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
                                                        tabActiva === id
                                                            ? `border-${tono}/40 bg-${tono}/10 text-${tono}`
                                                            : 'border-border bg-background text-muted-foreground hover:text-foreground'
                                                    )}
                                                >
                                                    <Icon className="size-3" />
                                                    {label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="p-0 overflow-x-auto">
                                    <TablaRanking filas={filaActiva()} canal={canalActivo()} />
                                </CardContent>
                            </Card>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
