// lib/auth.ts — OAuth client-credentials contra Genesys Cloud
// Port literal de auth.js (sin dotenv: Next.js carga .env/.env.local solo)
import axios from 'axios';

const CLIENT_ID = process.env.GENESYS_CLIENT_ID;
const CLIENT_SECRET = process.env.GENESYS_CLIENT_SECRET;
const REGION = process.env.GENESYS_REGION;

// Genesys requiere las credenciales en Base64
const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');

export async function getAccessToken(): Promise<string> {
    try {
        const response = await axios.post<{ access_token: string; expires_in: number }>(
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
        const err = error as { response?: { data?: unknown }; message?: string };
        console.error('❌ Error al obtener token:', err.response?.data || err.message);
        throw error;
    }
}
