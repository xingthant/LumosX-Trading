import type { Metadata, Viewport } from 'next';
import './globals.css';
import '@/lib/fontawesome';
import { AuthProvider } from '@/lib/AuthContext';

export const metadata: Metadata = {
  title: 'PaperTrade — Virtual Crypto Exchange',
  description: 'Simulated cryptocurrency paper trading platform',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#0b0f14',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-surface text-white antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
