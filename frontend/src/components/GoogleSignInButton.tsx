'use client';

import { useEffect, useRef } from 'react';
import Script from 'next/script';
import { useAuth } from '@/lib/AuthContext';
import { ApiError } from '@/lib/api';

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: { client_id: string; callback: (res: { credential: string }) => void }) => void;
          renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
        };
      };
    };
  }
}

// Renders Google's own "Sign in with Google" button and hands the resulting ID token to
// our backend for verification — no OAuth redirect flow, no client secret involved.
export default function GoogleSignInButton({ referralCode, onError }: { referralCode?: string; onError?: (message: string) => void }) {
  const { loginWithGoogle } = useAuth();
  const buttonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
    const render = () => {
      if (!window.google || !buttonRef.current) return;
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (res) => {
          loginWithGoogle(res.credential, referralCode).catch((err) => {
            onError?.(err instanceof ApiError ? err.message : 'Google sign-in failed');
          });
        },
      });
      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: 'outline',
        size: 'large',
        width: '100%',
        text: 'continue_with',
      });
    };
    if (window.google) render();
    else {
      const timer = window.setInterval(() => {
        if (window.google) {
          render();
          window.clearInterval(timer);
        }
      }, 200);
      return () => window.clearInterval(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [referralCode]);

  if (!GOOGLE_CLIENT_ID) return null;

  return (
    <>
      <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" />
      <div ref={buttonRef} className="flex w-full justify-center" />
    </>
  );
}
