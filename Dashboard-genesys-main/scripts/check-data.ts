// scripts/check-data.ts — volcado JSON de getAllMetrics() para inspección
// (check-data.js original, que esperaba el shape antiguo realtime/aggregates)
// Uso: npm run check:data
import { cargarEnv } from './env';

cargarEnv();

const { getAllMetrics } = await import('../lib/metrics');

async function main() {
    try {
        const data = await getAllMetrics();
        console.log('\n📡 RESUMEN DE MÉTRICAS (JSON):\n');
        console.log(JSON.stringify(data, null, 2));
    } catch (error) {
        const err = error as { response?: { data?: unknown }; message?: string };
        console.error('❌ Error:', err.response?.data || err.message);
        process.exitCode = 1;
    }
}

main();
