'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';
import { ApiError } from '@/lib/api';
import { useSiteConfig } from '@/lib/useSiteConfig';
import GoogleSignInButton from '@/components/GoogleSignInButton';

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  const searchParams = useSearchParams();
  const referralCode = searchParams.get('ref') || '';
  const { login, register } = useAuth();
  const { branding, telegram } = useSiteConfig();
  const [mode, setMode] = useState<'login' | 'register'>(referralCode ? 'register' : 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'login') await login(email, password);
      else await register(email, password, referralCode);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-mobile flex-col justify-center px-6">
      <div className="mb-8 text-center">
        {branding.logoDataUrl ? (
          <img src={branding.logoDataUrl} alt={branding.siteName} className="mx-auto mb-4 h-14 w-14 rounded-2xl object-cover shadow-glow" />
        ) : (
          <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-accent2 text-2xl font-black text-black shadow-glow">
            {branding.siteName.charAt(0).toUpperCase()}
          </span>
        )}
        <div className="mb-2 text-3xl font-bold tracking-tight">{branding.siteName}</div>
        <p className="text-sm text-muted">{branding.tagline}</p>
      </div>

      <div className="rounded-2xl border border-border bg-panel p-5 shadow-card">
        <div className="mb-5 flex rounded-xl bg-surface p-1">
          <button
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${mode === 'login' ? 'bg-accent text-black' : 'text-muted'}`}
            onClick={() => setMode('login')}
          >
            Log in
          </button>
          <button
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${mode === 'register' ? 'bg-accent text-black' : 'text-muted'}`}
            onClick={() => setMode('register')}
          >
            Sign up
          </button>
        </div>

        {mode === 'register' && referralCode && (
          <p className="mb-3 rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-xs text-accent">
            Referral code <span className="font-mono font-semibold">{referralCode}</span> will be applied — you both get a bonus.
          </p>
        )}

        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <input
            type="email"
            required
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-xl border border-border bg-surface px-4 py-3 text-base outline-none focus:border-accent"
          />
          <input
            type="password"
            required
            minLength={8}
            placeholder="Password (min 8 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-xl border border-border bg-surface px-4 py-3 text-base outline-none focus:border-accent"
          />
          {mode === 'login' && telegram.supportTelegramUrl && (
            <a
              href={telegram.supportTelegramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="-mt-1 self-end text-xs text-muted hover:text-accent"
            >
              Forgot password?
            </a>
          )}
          {error && <p className="text-sm text-danger">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="mt-2 rounded-xl bg-accent py-3 text-base font-semibold text-black disabled:opacity-60"
          >
            {busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}
          </button>
        </form>

        <div className="my-4 flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-[11px] text-muted">or</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <GoogleSignInButton referralCode={mode === 'register' ? referralCode : undefined} onError={setError} />
      </div>

      {mode === 'register' && (
        <p className="mt-4 text-center text-xs text-muted">
          New accounts start with a simulated paper trading balance.
        </p>
      )}
    </div>
  );
}
