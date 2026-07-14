require('dotenv').config();
const express = require('express');
const path = require('path');
const { getAllMetrics } = require('./metrics');

const app = express();
const PORT = 3010;
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/metrics', async (req, res) => {
    try {
        const data = await getAllMetrics();
        res.json({
            ok: true,
            timestamp: new Date().toISOString(),
            tiempoReal: {
                voz: { enEspera: data.tiempoReal.voz.oWaiting || 0, enAtencion: data.tiempoReal.voz.oInteracting || 0, enCola: data.tiempoReal.voz.oOnQueueUsers || 0 },
                msg: { enEspera: data.tiempoReal.msg.oWaiting || 0, enAtencion: data.tiempoReal.msg.oInteracting || 0, enCola: data.tiempoReal.msg.oOnQueueUsers || 0 }
            },
            totalesHoy: data.totalesHoy,
            totalesSemana: data.totalesSemana,
            hoy: data.hoy,
            semana: data.semana
        });
    } catch (e) {
        console.error('Error:', e.response?.data || e.message);
        res.status(500).json({ ok: false, error: e.message });
    }
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