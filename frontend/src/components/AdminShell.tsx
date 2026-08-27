'use client';

import { ReactNode, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';
import { useSiteConfig } from '@/lib/useSiteConfig';

const TABS = [
  { href: '/admin', label: 'Users & Balances' },
  { href: '/admin/transactions', label: 'Deposits & Withdrawals' },
  { href: '/admin/banks', label: 'Bank Config' },
  { href: '/admin/prices', label: 'Price Overrides' },
  { href: '/admin/durations', label: 'Trade Durations' },
  { href: '/admin/outcomes', label: 'Trade Outcome Control' },
  { href: '/admin/promotions', label: 'Promotions' },
  { href: '/admin/bonuses', label: 'Bonuses' },
  { href: '/admin/merchants', label: 'Merchants' },
  { href: '/admin/p2p', label: 'P2P Oversight' },
  { href: '/admin/branding', label: 'Branding' },
  { href: '/admin/telegram', label: 'Telegram Promo' },
  { href: '/admin/audit', label: 'Audit Logs' },
];

export default function AdminShell({ title, children }: { title: string; children: ReactNode }) {
  const { user, loading, logout } = useAuth();
  const { branding } = useSiteConfig();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/login');
    else if (user.role !== 'ADMIN') router.replace('/dashboard');
  }, [user, loading, router]);

  if (loading || !user || user.role !== 'ADMIN') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <div>
          <div className="text-sm text-muted">{branding.siteName} Admin</div>
          <h1 className="text-xl font-semibold">{title}</h1>
        </div>
        <button onClick={logout} className="text-sm text-muted underline underline-offset-2">
          {user.email} · log out
        </button>
      </header>
      <nav className="flex gap-1 overflow-x-auto border-b border-border px-4">
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium ${
              pathname === tab.href ? 'border-accent text-accent' : 'border-transparent text-muted'
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
