import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Analytics } from '@vercel/analytics/react';
import './globals.css';

export const metadata: Metadata = {
    title: 'Dashboard Soporte'
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
    return (
        <html lang="es">
            <body>
                {children}
                <Analytics />
            </body>
        </html>
    );
}
