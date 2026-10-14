import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
    async headers() {
        return [
            {
                // Evita que proxies tipo nginx/buffering corten el streaming SSE
                // (mismo comportamiento que la cabecera X-Accel-Buffering de server.js)
                source: '/api/stream',
                headers: [
                    { key: 'X-Accel-Buffering', value: 'no' },
                    { key: 'Cache-Control', value: 'no-cache' },
                ],
            },
        ];
    },
};

export default nextConfig;
