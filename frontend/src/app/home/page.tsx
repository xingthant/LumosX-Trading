'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowDown,
  faArrowUp,
  faHandshake,
  faGift,
  faArrowTrendUp,
  faArrowTrendDown,
  faGem,
} from '@fortawesome/free-solid-svg-icons';
import MobileShell from '@/components/MobileShell';
import CoinAvatar from '@/components/CoinAvatar';
import { useAuth } from '@/lib/AuthContext';
import { api } from '@/lib/api';
import { getSocket, subscribeToPairs } from '@/lib/socket';

interface Balance {
  asset_symbol: string;
  available_balance: string;
  locked_balance: string;
}

interface ResolvedPrice {
  pair: string;
  price: number;
  source: 'override' | 'live';
}

interface Stats {
  pair: string;
  lastPrice: number;
  priceChangePercent: number;
}

interface Promotion {
  id: string;
  title: string;
  description: string | null;
  badge_text: string | null;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function HomePage() {
  const { user } = useAuth();
  const [balances, setBalances] = useState<Balance[]>([]);
  const [pairs, setPairs] = useState<string[]>([]);
  const [prices, setPrices] = useState<Record<string, ResolvedPrice>>({});
  const [stats, setStats] = useState<Record<string, Stats>>({});
  const [promotions, setPromotions] = useState<Promotion[]>([]);

  useEffect(() => {
    api.get<{ balances: Balance[] }>('/api/wallet/balances').then((res) => setBalances(res.balances)).catch(() => {});
    api.get<{ pairs: string[] }>('/api/market/pairs').then((res) => setPairs(res.pairs));
    api.get<{ prices: ResolvedPrice[] }>('/api/market/prices').then((res) => {
      const map: Record<string, ResolvedPrice> = {};
      res.prices.forEach((p) => (map[p.pair] = p));
      setPrices(map);
    });
    api.get<{ promotions: Promotion[] }>('/api/market/promotions').then((res) => setPromotions(res.promotions.slice(0, 5))).catch(() => {});
    refreshStats();
    const timer = window.setInterval(refreshStats, 15000);

    const socket = getSocket();
    const onPrice = (payload: ResolvedPrice) => setPrices((prev) => ({ ...prev, [payload.pair]: payload }));
    socket.on('price', onPrice);
    return () => {
      socket.off('price', onPrice);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (pairs.length) subscribeToPairs(pairs);
  }, [pairs]);

  function refreshStats() {
    api
      .get<{ stats: Stats[] }>('/api/market/stats')
      .then((res) => {
        const map: Record<string, Stats> = {};
        res.stats.forEach((s) => (map[s.pair] = s));
        setStats(map);
      })
      .catch(() => {});
  }

  const usdtBalance = balances.find((b) => b.asset_symbol === 'USDT');

  const holdings = useMemo(() => {
    return balances
      .map((b) => {
        const total = parseFloat(b.available_balance) + parseFloat(b.locked_balance);
        const price = b.asset_symbol === 'USDT' ? 1 : prices[`${b.asset_symbol}USDT`]?.price;
        return { asset: b.asset_symbol, amount: total, value: price ? total * price : null };
      })
      .filter((h) => h.amount > 0)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  }, [balances, prices]);

  const portfolioValue = useMemo(() => holdings.reduce((sum, h) => sum + (h.value ?? 0), 0), [holdings]);

  return (
    <MobileShell title="Home">
      <div className="mb-1 text-sm text-muted">
        {greeting()}, <span className="text-white">{user?.email.split('@')[0]}</span>
      </div>

      <div className="relative mb-4 overflow-hidden rounded-2xl border border-border bg-hero-gradient p-5 shadow-card">
        <div className="pointer-events-none absolute inset-0 bg-sheen" />
        <div className="relative text-xs text-muted">Estimated total balance</div>
        <div className="relative mt-1 text-3xl font-bold tabular-nums">
          {portfolioValue.toLocaleString(undefined, { maximumFractionDigits: 2 })} <span className="text-base font-medium text-muted">USDT</span>
        </div>
        <div className="relative mt-1 text-[11px] text-muted">
          {parseFloat(usdtBalance?.available_balance || '0').toLocaleString()} USDT available to trade
        </div>

        <div className="relative mt-4 grid grid-cols-4 gap-2">
          <Link href="/wallet?mode=deposit" className="flex flex-col items-center gap-1.5 rounded-xl bg-accent py-2.5 text-[11px] font-semibold text-black">
            <FontAwesomeIcon icon={faArrowDown} className="text-sm" />
            Deposit
          </Link>
          <Link href="/wallet?mode=withdraw" className="flex flex-col items-center gap-1.5 rounded-xl border border-border bg-panel/60 py-2.5 text-[11px] font-semibold backdrop-blur">
            <FontAwesomeIcon icon={faArrowUp} className="text-sm" />
            Withdraw
          </Link>
          <Link href="/p2p" className="flex flex-col items-center gap-1.5 rounded-xl border border-border bg-panel/60 py-2.5 text-[11px] font-semibold backdrop-blur">
            <FontAwesomeIcon icon={faHandshake} className="text-sm" />
            P2P
          </Link>
          <Link href="/rewards" className="flex flex-col items-center gap-1.5 rounded-xl border border-border bg-panel/60 py-2.5 text-[11px] font-semibold backdrop-blur">
            <FontAwesomeIcon icon={faGift} className="text-sm" />
            Rewards
          </Link>
        </div>
      </div>

      {holdings.length > 0 && (
        <div className="mb-4">
          <h2 className="mb-2 text-sm font-semibold text-muted">Your Assets</h2>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {holdings.map((h) => (
              <div key={h.asset} className="flex min-w-[132px] items-center gap-2.5 rounded-xl border border-border bg-panel px-3 py-2.5 shadow-card">
                <CoinAvatar symbol={h.asset} size={32} />
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold">{h.asset}</div>
                  <div className="truncate text-[11px] text-muted">
                    {h.amount.toLocaleString(undefined, { maximumFractionDigits: h.amount < 1 ? 6 : 2 })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {promotions.length > 0 && (
        <div className="mb-4">
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-muted">
            <FontAwesomeIcon icon={faGem} className="text-amber-400" /> Offers for you
          </h2>
          <div className="flex gap-2.5 overflow-x-auto pb-1">
            {promotions.map((p) => (
              <div key={p.id} className="min-w-[220px] rounded-xl border border-amber-500/25 bg-gradient-to-br from-amber-500/10 to-transparent p-3 shadow-card">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs font-semibold">{p.title}</span>
                  {p.badge_text && <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-semibold text-amber-400">{p.badge_text}</span>}
                </div>
                {p.description && <p className="line-clamp-2 text-[11px] text-muted">{p.description}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      <h2 className="mb-2 text-sm font-semibold text-muted">Live Market</h2>
      <div className="flex flex-col gap-1.5">
        {pairs.map((p) => {
          const price = prices[p]?.price;
          const s = stats[p];
          const up = (s?.priceChangePercent ?? 0) >= 0;
          const base = p.replace(/USDT|USD|BUSD$/, '');
          return (
            <Link
              key={p}
              href={`/market?pair=${p}`}
              className="flex items-center justify-between rounded-xl border border-border bg-panel px-3.5 py-3 transition-colors hover:border-accent/40"
            >
              <div className="flex items-center gap-3">
                <CoinAvatar symbol={base} size={36} />
                <div>
                  <div className="text-sm font-semibold">{base}</div>
                  <div className="text-[11px] text-muted">{p}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="tabular-nums font-medium">{price ? price.toLocaleString(undefined, { maximumFractionDigits: price < 10 ? 4 : 2 }) : '—'}</div>
                {s && (
                  <div className={`flex items-center justify-end gap-1 text-[11px] font-medium tabular-nums ${up ? 'text-accent' : 'text-danger'}`}>
                    <FontAwesomeIcon icon={up ? faArrowTrendUp : faArrowTrendDown} className="text-[10px]" />
                    {up ? '+' : ''}
                    {s.priceChangePercent.toFixed(2)}%
                  </div>
                )}
              </div>
            </Link>
          );
        })}
        {pairs.length === 0 && <p className="rounded-xl border border-border bg-panel px-4 py-6 text-center text-sm text-muted">Loading markets…</p>}
      </div>
    </MobileShell>
  );
}
