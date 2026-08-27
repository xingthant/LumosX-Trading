'use client';

import { ReactNode, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';
import { subscribeToOrders } from '@/lib/socket';
import BottomNav from './BottomNav';
import TelegramPromo from './TelegramPromo';

export default function MobileShell({ title, children }: { title: string; children: ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  useEffect(() => {
    if (user) subscribeToOrders();
  }, [user]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted">Loading…</p>
      </div>
    );
  }

  const initial = user.email.charAt(0).toUpperCase();

  return (
    <div className="mx-auto min-h-screen w-full max-w-mobile pb-24">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border/80 bg-surface/80 px-4 py-3 backdrop-blur-lg">
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        <button onClick={logout} className="flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-xs text-muted transition-colors hover:text-white">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent2 text-[11px] font-semibold text-black">
            {initial}
          </span>
          {user.email.split('@')[0]}
        </button>
      </header>
      <main className="animate-in px-4 py-4">{children}</main>
      <TelegramPromo />
      <BottomNav />
    </div>
  );
}
