// scripts/test-metrics.ts — resumen legible de getAllMetrics()
// (test-metrics.js original, adaptado al shape actual de datos)
// Uso: npm run test:metrics
import { cargarEnv } from './env';

cargarEnv();

const { getAllMetrics, msToMinSeg } = await import('../lib/metrics');

async function main() {
    try {
        const data = await getAllMetrics();

        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📡 TIEMPO REAL — Estado de las colas');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('🔊 VOZ_Soporte:');
        console.log(`   En espera:    ${data.tiempoReal.voz.oWaiting || 0}`);
        console.log(`   En atención:  ${data.tiempoReal.voz.oInteracting || 0}`);
        console.log(`   En cola:      ${data.tiempoReal.voz.oOnQueueUsers || 0}`);
        console.log('💬 MSG_Soporte:');
        console.log(`   En espera:    ${data.tiempoReal.msg.oWaiting || 0}`);
        console.log(`   En atención:  ${data.tiempoReal.msg.oInteracting || 0}`);
        console.log(`   En cola:      ${data.tiempoReal.msg.oOnQueueUsers || 0}`);

        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📊 TOTALES');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`   HOY    — Voz ofrecidas: ${data.totalesHoy.voz.ofrecidas} | perdidas: ${data.totalesHoy.voz.perdidas} | MSG ofrecidos: ${data.totalesHoy.msg.ofrecidas}`);
        console.log(`   SEMANA — Voz ofrecidas: ${data.totalesSemana.voz.ofrecidas} | perdidas: ${data.totalesSemana.voz.perdidas} | MSG ofrecidos: ${data.totalesSemana.msg.ofrecidas}`);

        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('🏆 AGENTES DESTACADOS');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        const dv = data.hoy.destacadoVoz;
        if (dv) {
            console.log('   HOY — Llamadas:');
            console.log(`     Nombre:          ${dv.nombre}`);
            console.log(`     Atendidas:       ${dv.vozManejadas}`);
            console.log(`     Perdidas:        ${dv.vozPerdidas}`);
            console.log(`     T. Manejo voz:   ${dv.tManejoVoz}`);
        }
        const dm = data.hoy.destacadoMsg;
        if (dm) {
            console.log('   HOY — Mensajes:');
            console.log(`     Nombre:          ${dm.nombre}`);
            console.log(`     Atendidos:       ${dm.msgManejadas}`);
            console.log(`     T. Manejo msg:   ${dm.tManejoMsg}`);
        }

        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📊 TOP 5 AGENTES DEL DÍA (por total)');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        data.hoy.todos.slice(0, 5).forEach((a, i) => {
            console.log(`${i + 1}. ${a.nombre} — Total: ${a.total} (Voz: ${a.vozManejadas} | MSG: ${a.msgManejadas} | Perdidas: ${a.vozPerdidas})`);
        });

        console.log('\n⏱️  (msToMinSeg funciona:', msToMinSeg(90000), ')');
    } catch (error) {
        const err = error as { response?: { data?: unknown }; message?: string };
        console.error('❌ Error:', err.response?.data || err.message);
        process.exitCode = 1;
    }
}

main();
