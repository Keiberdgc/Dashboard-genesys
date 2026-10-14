'use client';

// Dashboard Soporte — port del public/index.html original a React.
// Mismo DOM (clases/ids), mismo CSS, misma lógica SSE con reconexión
// manual a los 5s y mismo reloj es-VE cada segundo.
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { Agente, DashboardPayload } from '@/types/metrics';

type Tab = 'todosHoy' | 'top5VozHoy' | 'top5MsgHoy' | 'todosSem' | 'top5VozSem' | 'top5MsgSem';

interface TabDef {
    id: Tab;
    clase: string;
    texto: ReactNode;
}

const TABS: TabDef[] = [
    { id: 'todosHoy', clase: 'tab-todos-hoy', texto: <>📞💬 Todos &mdash; Hoy</> },
    { id: 'top5VozHoy', clase: 'tab-voz-hoy', texto: <>📞 Top 5 Llamadas &mdash; Hoy</> },
    { id: 'top5MsgHoy', clase: 'tab-msg-hoy', texto: <>💬 Top 5 Mensajes &mdash; Hoy</> },
    { id: 'todosSem', clase: 'tab-todos-sem', texto: <>📞💬 Todos &mdash; Semana</> },
    { id: 'top5VozSem', clase: 'tab-voz-sem', texto: <>📞 Top 5 Llamadas &mdash; Semana</> },
    { id: 'top5MsgSem', clase: 'tab-msg-sem', texto: <>💬 Top 5 Mensajes &mdash; Semana</> }
];

const TAB_CONFIG: Record<Tab, { por: 'total' | 'voz' | 'msg'; lista: (d: DashboardPayload) => Agente[] }> = {
    todosHoy: { por: 'total', lista: d => d.hoy.todos },
    top5VozHoy: { por: 'voz', lista: d => d.hoy.top5Voz },
    top5MsgHoy: { por: 'msg', lista: d => d.hoy.top5Msg },
    todosSem: { por: 'total', lista: d => d.semana.todos },
    top5VozSem: { por: 'voz', lista: d => d.semana.top5Voz },
    top5MsgSem: { por: 'msg', lista: d => d.semana.top5Msg }
};

export default function Dashboard() {
    const [tab, setTab] = useState<Tab>('todosHoy');
    const [datos, setDatos] = useState<DashboardPayload | null>(null);
    const [reloj, setReloj] = useState('--:--:--');

    // ── Reloj ──────────────────────────────────────────────
    useEffect(() => {
        const tick = () =>
            setReloj(new Date().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, []);

    // ── SSE — reemplaza el fetch/setInterval ────────────────
    useEffect(() => {
        let sse: EventSource | null = null;
        let reconnect: ReturnType<typeof setTimeout> | null = null;

        const conectar = () => {
            sse = new EventSource('/api/stream');

            sse.onmessage = (e) => {
                try {
                    const d = JSON.parse(e.data) as DashboardPayload;
                    if (d.ok) setDatos(d);
                } catch (err) { console.error('Error parseando SSE:', err); }
            };

            sse.onerror = () => {
                console.warn('SSE desconectado, reconectando en 5s...');
                sse?.close();
                reconnect = setTimeout(conectar, 5000); // reconexión automática
            };
        };

        conectar();

        return () => {
            sse?.close();
            if (reconnect) clearTimeout(reconnect);
        };
    }, []);

    // ── Derivados de render ─────────────────────────────────
    const config = TAB_CONFIG[tab];
    const lista = datos ? config.lista(datos) : [];
    const thRank = config.por === 'voz' ? 'Llamadas (rank)' : config.por === 'msg' ? 'Mensajes (rank)' : 'Total';
    const thTmsg = config.por === 'msg' ? 'T. Chat (rank)' : 'T. Chat MSG';

    const dv = datos?.hoy.destacadoVoz ?? null;
    const dm = datos?.hoy.destacadoMsg ?? null;
    const sv = datos?.semana.destacadoVoz ?? null;
    const sm = datos?.semana.destacadoMsg ?? null;

    const badge = (i: number) =>
        <span className={`rank ${i === 0 ? 'r1' : i === 1 ? 'r2' : i === 2 ? 'r3' : 'rn'}`}>{i + 1}</span>;

    return (
        <>
            {!datos && (
                <div id="loading">
                    <div className="spinner"></div>
                    <p>Conectando con Genesys Cloud...</p>
                </div>
            )}

            <div className="wrap">
                <header
                    style={{ flexDirection: 'column', alignItems: 'center', paddingBottom: 0, borderBottom: 'none', gap: 0, marginBottom: 10 }}>
                    <div
                        style={{ position: 'relative', width: '100%', maxWidth: 1280, height: 120, borderRadius: 10, overflow: 'hidden', marginBottom: 8 }}>
                        <img src="/cabecera_dashboard.png" alt="Thunder Net Soporte Técnico"
                            style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', display: 'block', borderRadius: 10 }} />
                        <div
                            style={{ position: 'absolute', top: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-end', padding: '0 16px', background: 'linear-gradient(to left,rgba(13,17,23,.85) 60%,transparent)' }}>
                            <div className="reloj" id="reloj">{reloj}</div>
                            <div className="act" id="act">
                                {datos ? 'Últ. actualización: ' + new Date(datos.timestamp).toLocaleTimeString('es-VE') : 'Cargando...'}
                            </div>
                        </div>
                    </div>
                    <div style={{ width: '100%', borderBottom: '1px solid #21262d' }}></div>
                </header>

                <div className="top-grid">

                    <div className="card">
                        <div className="card-label"><span className="dot dot-voz"></span>Voz_Soporte &mdash; ahora</div>
                        <div className="stat-grid">
                            <div className="stat-box">
                                <div className="stat-num red" id="ve">{datos?.tiempoReal.voz.enEspera ?? 0}</div>
                                <div className="stat-lbl">En espera</div>
                            </div>
                            <div className="stat-box">
                                <div className="stat-num green" id="va">{datos?.tiempoReal.voz.enAtencion ?? 0}</div>
                                <div className="stat-lbl">En atención</div>
                            </div>
                            <div className="stat-box">
                                <div className="stat-num blue" id="vc">{datos?.tiempoReal.voz.enCola ?? 0}</div>
                                <div className="stat-lbl">En cola</div>
                            </div>
                        </div>
                        <div className="totales-row">
                            <div className="tot-box"><span className="tot-lbl">Recibidas hoy</span><span className="tot-val green"
                                id="vo">{datos?.totalesHoy.voz.ofrecidas ?? 0}</span></div>
                            <div className="tot-box"><span className="tot-lbl">Perdidas</span><span className="tot-val red" id="vp">{datos?.totalesHoy.voz.perdidas ?? 0}</span>
                            </div>
                        </div>
                    </div>

                    <div className="card">
                        <div className="card-label"><span className="dot dot-msg"></span>MSG_Soporte &mdash; ahora</div>
                        <div className="stat-grid">
                            <div className="stat-box">
                                <div className="stat-num red" id="me">{datos?.tiempoReal.msg.enEspera ?? 0}</div>
                                <div className="stat-lbl">En espera</div>
                            </div>
                            <div className="stat-box">
                                <div className="stat-num purple" id="ma">{datos?.tiempoReal.msg.enAtencion ?? 0}</div>
                                <div className="stat-lbl">En atención</div>
                            </div>
                            <div className="stat-box">
                                <div className="stat-num blue" id="mc">{datos?.tiempoReal.msg.enCola ?? 0}</div>
                                <div className="stat-lbl">En cola</div>
                            </div>
                        </div>
                        <div className="totales-row">
                            <div className="tot-box tot-full"><span className="tot-lbl">Recibidos hoy</span><span className="tot-val purple"
                                id="mo">{datos?.totalesHoy.msg.ofrecidas ?? 0}</span></div>
                        </div>
                    </div>

                    <div className="card">
                        <div className="card-label"><span className="dot dot-gold"></span>Destacados del día</div>
                        <div className="dest-grid-2">
                            <div className="dest-card">
                                <div className="dest-icon">&#128293;&#128222;</div>
                                <div className="dest-tipo">Llamadas</div>
                                <div className="dest-nombre gold" id="dvn">{dv?.nombre ?? '—'}</div>
                                <div className="dest-stats">
                                    <div className="dest-stat">
                                        <div className="dest-stat-val green" id="dvt">{dv?.vozManejadas ?? 0}</div>
                                        <div className="dest-stat-lbl">Atendidas</div>
                                    </div>
                                    <div className="dest-stat">
                                        <div className="dest-stat-val red" id="dvp">{dv?.vozPerdidas ?? 0}</div>
                                        <div className="dest-stat-lbl">Perdidas</div>
                                    </div>
                                    <div className="dest-stat">
                                        <div className="dest-stat-val" id="dvm">{dv?.tManejoVoz ?? '—'}</div>
                                        <div className="dest-stat-lbl">T.Habla</div>
                                    </div>
                                </div>
                            </div>
                            <div className="dest-card">
                                <div className="dest-icon">&#128293;&#128172;</div>
                                <div className="dest-tipo">Mensajes</div>
                                <div className="dest-nombre purple" id="dmn">{dm?.nombre ?? '—'}</div>
                                <div className="dest-stats">
                                    <div className="dest-stat">
                                        <div className="dest-stat-val purple" id="dmt">{dm?.msgManejadas ?? 0}</div>
                                        <div className="dest-stat-lbl">Atendidos</div>
                                    </div>
                                    <div className="dest-stat">
                                        <div className="dest-stat-val" id="dmm">{dm?.tManejoMsg ?? '—'}</div>
                                        <div className="dest-stat-lbl">T.Chat</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="card">
                        <div className="card-label"><span className="dot dot-gold"></span>Destacados semana</div>
                        <div className="dest-grid-2">
                            <div className="dest-card">
                                <div className="dest-icon">&#128293;&#128222;</div>
                                <div className="dest-tipo">Llamadas</div>
                                <div className="dest-nombre gold" id="svn">{sv?.nombre ?? '—'}</div>
                                <div className="dest-stats">
                                    <div className="dest-stat">
                                        <div className="dest-stat-val green" id="svt">{sv?.vozManejadas ?? 0}</div>
                                        <div className="dest-stat-lbl">Atendidas</div>
                                    </div>
                                    <div className="dest-stat">
                                        <div className="dest-stat-val red" id="svp">{sv?.vozPerdidas ?? 0}</div>
                                        <div className="dest-stat-lbl">Perdidas</div>
                                    </div>
                                    <div className="dest-stat">
                                        <div className="dest-stat-val" id="svm">{sv?.tManejoVoz ?? '—'}</div>
                                        <div className="dest-stat-lbl">T.Habla</div>
                                    </div>
                                </div>
                            </div>
                            <div className="dest-card">
                                <div className="dest-icon">&#128293;&#128172;</div>
                                <div className="dest-tipo">Mensajes</div>
                                <div className="dest-nombre purple" id="smn">{sm?.nombre ?? '—'}</div>
                                <div className="dest-stats">
                                    <div className="dest-stat">
                                        <div className="dest-stat-val purple" id="smt">{sm?.msgManejadas ?? 0}</div>
                                        <div className="dest-stat-lbl">Atendidos</div>
                                    </div>
                                    <div className="dest-stat">
                                        <div className="dest-stat-val" id="smm">{sm?.tManejoMsg ?? '—'}</div>
                                        <div className="dest-stat-lbl">T.Chat</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                </div>

                <div className="tabs">
                    {TABS.map(t => (
                        <button
                            key={t.id}
                            className={`tab-btn ${t.clase}${tab === t.id ? ' active' : ''}`}
                            onClick={() => setTab(t.id)}>
                            {t.texto}
                        </button>
                    ))}
                </div>

                <div className="tabla-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Agente</th>
                                <th id="th-rank">{thRank}</th>
                                <th>Llamadas</th>
                                <th>Mensajes</th>
                                <th>Perdidas</th>
                                <th id="th-tvoz">T. Habla voz</th>
                                <th id="th-tmsg">{thTmsg}</th>
                            </tr>
                        </thead>
                        <tbody id="tbody">
                            {!datos ? (
                                <tr>
                                    <td colSpan={8} style={{ textAlign: 'center', color: '#484f58', padding: 20 }}>Cargando...</td>
                                </tr>
                            ) : (
                                lista.map((a, i) => (
                                    <tr key={`${tab}-${a.nombre}-${i}`}>
                                        <td>{badge(i)}</td>
                                        <td><strong>{a.nombre}</strong></td>
                                        <td><span className="num-t">{config.por === 'voz' ? a.vozManejadas : config.por === 'msg' ? a.msgManejadas : a.total}</span></td>
                                        <td><span className="pill pv">{a.vozManejadas}</span></td>
                                        <td><span className="pill pm">{a.msgManejadas}</span></td>
                                        <td><span className="pill pr">{a.vozPerdidas}</span></td>
                                        <td>{a.tManejoVoz}</td>
                                        <td>{a.tManejoMsg}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </>
    );
}
