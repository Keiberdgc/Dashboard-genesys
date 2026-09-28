require('dotenv').config();
const express = require('express');
const path = require('path');
const { getAllMetrics } = require('./metrics');

const app = express();
const PORT = process.env.PORT || 3010;

app.use(express.static(path.join(__dirname, 'public')));

// ── CACHÉ CENTRAL ──────────────────────────────────────────
// El servidor consulta Genesys cada 60s por su cuenta.
// Los clientes SSE reciben el push automáticamente.
// Así 10 televisores conectados = 1 sola consulta a Genesys.
// ──────────────────────────────────────────────────────────
let cache = null;
let cacheTime = null;
let clients = [];          // lista de respuestas SSE activas

function buildPayload(data) {
    return {
        ok: true,
        timestamp: cacheTime?.toISOString() || new Date().toISOString(),
        tiempoReal: {
            voz: {
                enEspera: data.tiempoReal.voz.oWaiting || 0,
                enAtencion: data.tiempoReal.voz.oInteracting || 0,
                enCola: data.tiempoReal.voz.oOnQueueUsers || 0
            },
            msg: {
                enEspera: data.tiempoReal.msg.oWaiting || 0,
                enAtencion: data.tiempoReal.msg.oInteracting || 0,
                enCola: data.tiempoReal.msg.oOnQueueUsers || 0
            }
        },
        totalesHoy: data.totalesHoy,
        totalesSemana: data.totalesSemana,
        hoy: data.hoy,
        semana: data.semana
    };
}

// Consulta Genesys y notifica a todos los clientes conectados
async function refrescarYEmitir() {
    try {
        console.log('🔄 Consultando Genesys...');
        const data = await getAllMetrics();
        cache = data;
        cacheTime = new Date();
        const payload = JSON.stringify(buildPayload(data));

        // Enviar a todos los clientes SSE activos
        clients.forEach(res => {
            try { res.write(`data: ${payload}\n\n`); } catch (_) { }
        });
        console.log(`✅ Emitido a ${clients.length} cliente(s) — ${cacheTime.toLocaleTimeString()}`);
    } catch (e) {
        console.error('❌ Error consultando Genesys:', e.message);
    }
}

// Arranca inmediatamente y luego cada 60 segundos
refrescarYEmitir();
setInterval(refrescarYEmitir, 30000);

// ── ENDPOINT SSE ───────────────────────────────────────────
app.get('/api/stream', (req, res) => {
    // Cabeceras requeridas para SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // importante para Vercel/nginx
    res.flushHeaders();

    // Si ya hay datos en caché, enviarlos de inmediato al nuevo cliente
    if (cache) {
        res.write(`data: ${JSON.stringify(buildPayload(cache))}\n\n`);
    }

    // Registrar este cliente
    clients.push(res);
    console.log(`📺 Cliente conectado. Total: ${clients.length}`);

    // Ping cada 30s para mantener la conexión viva en Vercel
    const ping = setInterval(() => {
        try { res.write(': ping\n\n'); } catch (_) { }
    }, 20000);

    // Limpiar cuando el cliente se desconecta
    req.on('close', () => {
        clearInterval(ping);
        clients = clients.filter(c => c !== res);
        console.log(`📺 Cliente desconectado. Total: ${clients.length}`);
    });
});

// ── ENDPOINT LEGACY (por si acaso) ────────────────────────
app.get('/api/metrics', (req, res) => {
    if (!cache) return res.status(503).json({ ok: false, error: 'Cargando...' });
    res.json(buildPayload(cache));
});

app.listen(PORT, '0.0.0.0', () => {
    const { networkInterfaces } = require('os');
    const nets = networkInterfaces();
    let ip = 'localhost';
    for (const n of Object.keys(nets))
        for (const net of nets[n])
            if (net.family === 'IPv4' && !net.internal) { ip = net.address; break; }
    console.log(`\n🚀 Dashboard: http://localhost:${PORT}  |  Red: http://${ip}:${PORT}`);
});