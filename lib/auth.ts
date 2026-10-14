// lib/auth.ts — OAuth client-credentials contra Genesys Cloud
// Port de auth.js (sin dotenv: Next.js carga .env/.env.local solo),
// con caché de token: se reutiliza hasta ~60s antes de expirar en vez de
// pedir uno nuevo en cada ciclo de refresco (30s).
import axios from 'axios';

const CLIENT_ID = process.env.GENESYS_CLIENT_ID;
const CLIENT_SECRET = process.env.GENESYS_CLIENT_SECRET;
const REGION = process.env.GENESYS_REGION;

// Genesys requiere las credenciales en Base64
const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');

// Margen antes de la expiración real para no usar un token a punto de vencer
const MARGEN_SEGURIDAD_MS = 60_000;

// El token vive en globalThis para sobrevivir al HMR de `next dev`
// (mismo truco que la caché de lib/cache.ts)
interface EstadoToken {
    token: string | null;
    expiraEn: number; // epoch ms
    enCurso: Promise<string> | null; // dedupe: las 3 partes corren en paralelo
}

const globalTokens = globalThis as unknown as { __genesysToken?: EstadoToken };
const est: EstadoToken = (globalTokens.__genesysToken ??= { token: null, expiraEn: 0, enCurso: null });

export async function getAccessToken(): Promise<string> {
    // Caché: token todavía válido → no se golpea login.<region>
    if (est.token && Date.now() < est.expiraEn - MARGEN_SEGURIDAD_MS) {
        return est.token;
    }
    // Dedupe: las partes del refresco corren en paralelo; sin éste se
    // dispararían N peticiones de token simultáneas en el primer ciclo.
    if (est.enCurso) return est.enCurso;

    est.enCurso = (async () => {
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

            est.token = token;
            est.expiraEn = Date.now() + expiresIn * 1000;

            console.log('✅ Token obtenido exitosamente');
            console.log(`⏱️  Expira en: ${expiresIn} segundos`);

            return token;

        } catch (error) {
            const err = error as { response?: { data?: unknown }; message?: string };
            console.error('❌ Error al obtener token:', err.response?.data || err.message);
            throw error;
        } finally {
            est.enCurso = null;
        }
    })();

    return est.enCurso;
}
