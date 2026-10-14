// scripts/env.ts — carga .env para los scripts ejecutados con tsx
// (Next.js carga .env solo, pero tsx/node no lo hace)
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export function cargarEnv(): void {
    const ruta = resolve(process.cwd(), '.env');
    if (existsSync(ruta)) {
        process.loadEnvFile(ruta);
        console.log('📄 .env cargado desde', ruta);
    } else {
        console.warn('⚠️  No se encontró .env — se usan solo las variables del entorno');
    }
}
