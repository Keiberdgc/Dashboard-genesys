const { getAllMetrics, msToMinSeg } = require('./metrics');

async function main() {
    try {
        const data = await getAllMetrics();

        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📡 TIEMPO REAL — Estado de las colas');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('🔊 VOZ_Soporte:');
        console.log(`   En espera:    ${data.tiempoReal.voz.oWaiting || 0}`);
        console.log(`   En atención:  ${data.tiempoReal.voz.oInteracting || 0}`);
        console.log(`   Agentes:      ${data.tiempoReal.voz.oActiveUsers || 0}`);
        console.log('💬 MSG_Soporte:');
        console.log(`   En espera:    ${data.tiempoReal.msg.oWaiting || 0}`);
        console.log(`   En atención:  ${data.tiempoReal.msg.oInteracting || 0}`);
        console.log(`   Agentes:      ${data.tiempoReal.msg.oActiveUsers || 0}`);

        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('🏆 AGENTE DESTACADO DEL DÍA');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        if (data.agentDestacado) {
            const a = data.agentDestacado;
            console.log(`   Nombre:          ${a.nombre}`);
            console.log(`   Total atendidas: ${a.total}`);
            console.log(`   Llamadas voz:    ${a.voz.manejadas}`);
            console.log(`   Mensajes:        ${a.msg.manejadas}`);
            console.log(`   T. Manejo voz:   ${msToMinSeg(a.voz.tHandle_ms / (a.voz.manejadas || 1))}`);
            console.log(`   T. Manejo msg:   ${msToMinSeg(a.msg.tHandle_ms / (a.msg.manejadas || 1))}`);
        }

        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📊 TOP 5 AGENTES DEL DÍA');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        data.top5.forEach((a, i) => {
            console.log(`${i + 1}. ${a.nombre} — Total: ${a.total} (Voz: ${a.voz.manejadas} | MSG: ${a.msg.manejadas})`);
        });

    } catch (error) {
        console.error('❌ Error:', error.response?.data || error.message);
    }
}

main();