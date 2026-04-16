// test-auth.js
const { getAccessToken } = require('./auth');

async function main() {
    console.log('🔐 Intentando autenticar con Genesys Cloud...');
    const token = await getAccessToken();
    console.log('🎟️  Token (primeros 30 caracteres):', token.substring(0, 30) + '...');
}

main();