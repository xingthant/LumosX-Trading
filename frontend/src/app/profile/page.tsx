'use client';

import { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faWallet, faListCheck, faRightFromBracket, faShieldHalved, faGear, faHandshake, faGift, faChevronRight } from '@fortawesome/free-solid-svg-icons';
import Link from 'next/link';
import MobileShell from '@/components/MobileShell';
import { useAuth } from '@/lib/AuthContext';
import { api } from '@/lib/api';

interface Me {
  id: string;
  email: string;
  role: string;
  is_merchant: boolean;
  created_at: string;
}

interface Balance {
  asset_symbol: string;
  available_balance: string;
}

export default function ProfilePage() {
  const { logout } = useAuth();
  const [me, setMe] = useState<Me | null>(null);
  const [balances, setBalances] = useState<Balance[]>([]);

  useEffect(() => {
    api.get<{ user: Me }>('/api/auth/me').then((res) => setMe(res.user)).catch(() => {});
    api.get<{ balances: Balance[] }>('/api/wallet/balances').then((res) => setBalances(res.balances)).catch(() => {});
  }, []);

  return (
    <MobileShell title="Profile">
      <div className="relative mb-4 flex flex-col items-center overflow-hidden rounded-2xl border border-border bg-hero-gradient p-6 text-center shadow-card">
        <div className="pointer-events-none absolute inset-0 bg-sheen" />
        <span className="relative mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent2 text-2xl font-bold text-black shadow-glow">
          {me?.email.charAt(0).toUpperCase() || '?'}
        </span>
        <div className="relative text-base font-semibold">{me?.email || '—'}</div>
        <div className="relative mt-1 flex items-center gap-1.5 text-xs text-muted">
          {me?.role === 'ADMIN' && <FontAwesomeIcon icon={faShieldHalved} className="text-amber-400" />}
          {me?.role}
        </div>
        {me && <div className="relative mt-1 text-[11px] text-muted">Member since {new Date(me.created_at).toLocaleDateString()}</div>}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2">
        {balances.slice(0, 4).map((b) => (
          <div key={b.asset_symbol} className="rounded-xl border border-border bg-panel p-3 shadow-card">
            <div className="text-[11px] text-muted">{b.asset_symbol}</div>
            <div className="font-semibold tabular-nums">{parseFloat(b.available_balance).toLocaleString()}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-col overflow-hidden rounded-2xl border border-border shadow-card">
        <Link href="/wallet" className="flex items-center gap-3 border-b border-border bg-panel px-4 py-3 text-sm transition-colors hover:bg-panel2">
          <FontAwesomeIcon icon={faWallet} className="text-muted" /> Wallet & Bank Deposits
          <FontAwesomeIcon icon={faChevronRight} className="ml-auto text-[10px] text-muted" />
        </Link>
        <Link href="/orders" className="flex items-center gap-3 border-b border-border bg-panel px-4 py-3 text-sm transition-colors hover:bg-panel2">
          <FontAwesomeIcon icon={faListCheck} className="text-muted" /> Orders & Trades
          <FontAwesomeIcon icon={faChevronRight} className="ml-auto text-[10px] text-muted" />
        </Link>
        <Link href="/settings" className="flex items-center gap-3 border-b border-border bg-panel px-4 py-3 text-sm transition-colors hover:bg-panel2">
          <FontAwesomeIcon icon={faGear} className="text-muted" /> Security & Payout Methods
          <FontAwesomeIcon icon={faChevronRight} className="ml-auto text-[10px] text-muted" />
        </Link>
        <Link href="/rewards" className="flex items-center gap-3 border-b border-border bg-panel px-4 py-3 text-sm transition-colors hover:bg-panel2">
          <FontAwesomeIcon icon={faGift} className="text-muted" /> Rewards & Referrals
          <FontAwesomeIcon icon={faChevronRight} className="ml-auto text-[10px] text-muted" />
        </Link>
        {me?.is_merchant && (
          <Link href="/p2p/merchant" className="flex items-center gap-3 border-b border-border bg-panel px-4 py-3 text-sm transition-colors hover:bg-panel2">
            <FontAwesomeIcon icon={faHandshake} className="text-muted" /> Merchant Center
            <FontAwesomeIcon icon={faChevronRight} className="ml-auto text-[10px] text-muted" />
          </Link>
        )}
        {me?.role === 'ADMIN' && (
          <Link href="/admin" className="flex items-center gap-3 border-b border-border bg-panel px-4 py-3 text-sm transition-colors hover:bg-panel2">
            <FontAwesomeIcon icon={faShieldHalved} className="text-muted" /> Admin Console
            <FontAwesomeIcon icon={faChevronRight} className="ml-auto text-[10px] text-muted" />
          </Link>
        )}
        <button onClick={logout} className="flex items-center gap-3 bg-panel px-4 py-3 text-left text-sm text-danger transition-colors hover:bg-panel2">
          <FontAwesomeIcon icon={faRightFromBracket} /> Log out
        </button>
      </div>
    </MobileShell>
  );
}
