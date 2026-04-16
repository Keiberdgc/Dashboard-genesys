const { getAllMetrics } = require('./metrics');

async function main() {
    try {
        const { realtime, aggregates } = await getAllMetrics();

        // ── TIEMPO REAL ──
        console.log('\n📡 RESUMEN TIEMPO REAL:');
        realtime.results?.forEach(result => {
            console.log(`\nCola: ${result.group?.queueId}`);
            result.data?.forEach(d => {
                d.metrics?.forEach(m => {
                    console.log(`  ${m.metric}: ${m.stats?.count ?? m.stats?.sum ?? '-'}`);
                });
            });
        });

        // ── AGREGADOS ──
        console.log('\n📊 RESUMEN AGREGADOS (primeros 3 grupos):');
        aggregates.results?.slice(0, 3).forEach((result, i) => {
            console.log(`\nGrupo ${i + 1}:`);
            console.log(`  userId:    ${result.group?.userId ?? 'N/A'}`);
            console.log(`  queueId:   ${result.group?.queueId ?? 'N/A'}`);
            console.log(`  mediaType: ${result.group?.mediaType ?? 'N/A'}`);
            result.data?.forEach(d => {
                d.metrics?.forEach(m => {
                    console.log(`  ${m.metric}: ${m.stats?.count ?? m.stats?.sum ?? '-'}`);
                });
            });
        });

    } catch (error) {
        console.error('❌ Error:', error.response?.data || error.message);
    }
}

main();