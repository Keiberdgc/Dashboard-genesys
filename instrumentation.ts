// instrumentation.ts — se ejecuta UNA VEZ cuando arranca el servidor Next
// Equivale a las líneas de arranque de server.js:
//   refrescarYEmitir(); setInterval(refrescarYEmitir, 30000);
export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        const { asegurarBucleRefresco } = await import('./lib/cache');
        asegurarBucleRefresco();
    }
}
