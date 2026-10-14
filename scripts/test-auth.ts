// scripts/test-auth.ts — verifica las credenciales de Genesys (test-auth.js original)
// Uso: npm run test:auth
import { cargarEnv } from './env';

cargarEnv();

const { getAccessToken } = await import('../lib/auth');

async function main() {
    console.log('🔐 Intentando autenticar con Genesys Cloud...');
    const token = await getAccessToken();
    console.log('🎟️  Token (primeros 30 caracteres):', token.substring(0, 30) + '...');
}

main();
