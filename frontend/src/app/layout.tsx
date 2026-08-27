import type { Metadata, Viewport } from 'next';
import './globals.css';
import '@/lib/fontawesome';
import { AuthProvider } from '@/lib/AuthContext';

// Reaches the backend over the Docker network directly (faster, no round trip through
// nginx/the public domain) since this only ever runs server-side during rendering.
const INTERNAL_API_URL = process.env.INTERNAL_API_URL || 'http://backend-api:4000';
// Used for the OG/Twitter image URL instead, since that one has to be fetchable by
// outside link-preview crawlers (Telegram, WhatsApp, ...), not just from inside Docker.
const PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

const DEFAULT_SITE_NAME = 'PaperTrade';
const DEFAULT_TAGLINE = 'Simulated crypto trading. No real funds involved.';

export async function generateMetadata(): Promise<Metadata> {
  let siteName = DEFAULT_SITE_NAME;
  let tagline = DEFAULT_TAGLINE;
  let hasLogo = false;

  try {
    // Must be dynamic (not cached/ISR'd): a build-time fetch would hit a backend that
    // isn't reachable yet during the Docker image build and silently lock in the fallback.
    const res = await fetch(`${INTERNAL_API_URL}/api/public/site-config`, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      siteName = data.branding?.siteName || siteName;
      tagline = data.branding?.tagline || tagline;
      hasLogo = Boolean(data.branding?.logoDataUrl);
    }
  } catch {
    // Backend unreachable at render time — fall back to the defaults above.
  }

  const logoUrl = hasLogo ? `${PUBLIC_API_URL}/api/public/site-logo` : undefined;

  return {
    title: siteName,
    description: tagline,
    openGraph: {
      title: siteName,
      description: tagline,
      siteName,
      type: 'website',
      ...(logoUrl ? { images: [{ url: logoUrl }] } : {}),
    },
    twitter: {
      card: 'summary',
      title: siteName,
      description: tagline,
      ...(logoUrl ? { images: [logoUrl] } : {}),
    },
  };
}

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
