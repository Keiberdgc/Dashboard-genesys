// auth.js
require('dotenv').config();
const axios = require('axios');

const CLIENT_ID = process.env.GENESYS_CLIENT_ID;
const CLIENT_SECRET = process.env.GENESYS_CLIENT_SECRET;
const REGION = process.env.GENESYS_REGION;

// Genesys requiere las credenciales en Base64
const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');

async function getAccessToken() {
    try {
        const response = await axios.post(
            `https://login.${REGION}/oauth/token`,
            'grant_type=client_credentials',
            {
                headers: {
                    'Authorization': `Basic ${credentials}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );

        const token = response.data.access_token;
        const expiresIn = response.data.expires_in;

        console.log('✅ Token obtenido exitosamente');
        console.log(`⏱️  Expira en: ${expiresIn} segundos`);

        return token;

    } catch (error) {
        console.error('❌ Error al obtener token:', error.response?.data || error.message);
        throw error;
    }
}

module.exports = { getAccessToken };