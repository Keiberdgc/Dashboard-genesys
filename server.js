require('dotenv').config();
const express = require('express');
const path = require('path');
const { getAllMetrics } = require('./metrics');

const app = express();
const PORT = 3000;

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/metrics', async (req, res) => {
    try {
        const data = await getAllMetrics();

        res.json({
            ok: true,
            timestamp: new Date().toISOString(),
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
        });

    } catch (error) {
        console.error('Error en /api/metrics:', error.response?.data || error.message);
        res.status(500).json({ ok: false, error: error.message });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    const { networkInterfaces } = require('os');
    const nets = networkInterfaces();
    let ip = 'localhost';
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) { ip = net.address; break; }
        }
    }
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🚀 Dashboard iniciado');
    console.log(`📺 Local:   http://localhost:${PORT}`);
    console.log(`📡 Red:     http://${ip}:${PORT}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
});