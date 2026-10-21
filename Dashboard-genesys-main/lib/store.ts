// lib/store.ts — caché compartida entre instancias (Redis REST de Upstash)
// En Vercel cada instancia serverless tiene su propia caché (globalThis);
// aquí se publica el payload para que:
//   • las INSTANCIAS frías respondan al instante sin volver a Genesys;
//   • el CRON (app/api/cron/refresh) mantenga los datos calientes aunque
//     todavía no haya nadie mirando.
// Todo es opcional: sin variables de entorno, store.estaConfigurado() es
// false y el sistema funciona igual que antes solo con caché local
// (dev local, o si aún no se ha creado la base de datos).
import { Redis } from '@upstash/redis';

export interface PayloadCompartido {
    json: string;        // payload listo para la UI, tal cual lo consume
    guardadoEn: number;  // epoch ms de la última consulta de tiempo real
}

const CLAVE = 'dashboard:genesys:payload';
const TTL_SEGUNDOS = 600; // sin refrescos en 10min expira sola

let cliente: Redis | null | undefined;

// Acepta las variables de la integración Upstash en Vercel
// (UPSTASH_REDIS_REST_URL/TOKEN) y las de Vercel KV heredadas (KV_REST_API_*).
function obtenerCliente(): Redis | null {
    if (cliente !== undefined) return cliente;
    const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
    cliente = url && token ? new Redis({ url, token }) : null;
    return cliente;
}

export function estaConfigurado(): boolean {
    return obtenerCliente() !== null;
}

// Devuelve null si no hay KV configurada o si falla (nunca tira abajo
// el sondeo: ante un fallo de KV se usa la caché local).
export async function leerPayloadCompartido(): Promise<PayloadCompartido | null> {
    const redis = obtenerCliente();
    if (!redis) return null;
    try {
        const valor = await redis.get<PayloadCompartido>(CLAVE);
        if (!valor || typeof valor !== 'object' || typeof valor.json !== 'string') return null;
        return { json: valor.json, guardadoEn: Number(valor.guardadoEn) || 0 };
    } catch (e) {
        console.warn('⚠️ KV indisponible, se usa la caché local:', (e as Error).message);
        return null;
    }
}

// Best-effort: si la escritura falla, el dato se reescribe en el próximo refresh.
export async function guardarPayloadCompartido(payload: PayloadCompartido): Promise<void> {
    const redis = obtenerCliente();
    if (!redis) return;
    try {
        await redis.set(CLAVE, payload, { ex: TTL_SEGUNDOS });
    } catch (e) {
        console.warn('⚠️ No se pudo publicar en la KV:', (e as Error).message);
    }
}
