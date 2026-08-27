'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import MobileShell from '@/components/MobileShell';
import PriceChart from '@/components/PriceChart';
import ShortTermTradePanel from '@/components/ShortTermTradePanel';
import { api, ApiError } from '@/lib/api';
import { getSocket, subscribeToPairs } from '@/lib/socket';

interface ResolvedPrice {
  pair: string;
  price: number;
  source: 'override' | 'live';
  volume?: number;
}

interface Stats {
  pair: string;
  lastPrice: number;
  priceChangePercent: number;
  highPrice: number;
  lowPrice: number;
  volume: number;
  quoteVolume: number;
}

interface Balance {
  asset_symbol: string;
  available_balance: string;
  locked_balance: string;
}

const PERCENT_STEPS = [25, 50, 75, 100];

export default function MarketPage() {
  return (
    <Suspense fallback={null}>
      <MarketPageInner />
    </Suspense>
  );
}

function MarketPageInner() {
  const searchParams = useSearchParams();
  const [pairs, setPairs] = useState<string[]>([]);
  const [selectedPair, setSelectedPair] = useState<string>('');
  const [prices, setPrices] = useState<Record<string, ResolvedPrice>>({});
  const [stats, setStats] = useState<Record<string, Stats>>({});
  const [balances, setBalances] = useState<Balance[]>([]);
  const [tradeMode, setTradeMode] = useState<'SPOT' | 'SHORT_TERM'>('SPOT');
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [type, setType] = useState<'MARKET' | 'LIMIT'>('MARKET');
  const [amount, setAmount] = useState('');
  const [limitPrice, setLimitPrice] = useState('');
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<{ pairs: string[] }>('/api/market/pairs').then((res) => {
      setPairs(res.pairs);
      const requested = searchParams.get('pair')?.toUpperCase();
      setSelectedPair(requested && res.pairs.includes(requested) ? requested : res.pairs[0]);
    });
    api.get<{ prices: ResolvedPrice[] }>('/api/market/prices').then((res) => {
      const map: Record<string, ResolvedPrice> = {};
      res.prices.forEach((p) => (map[p.pair] = p));
      setPrices(map);
    });
    refreshBalances();
    refreshStats();
    const statsTimer = window.setInterval(refreshStats, 15000);

    const socket = getSocket();
    const onPrice = (payload: ResolvedPrice) => setPrices((prev) => ({ ...prev, [payload.pair]: payload }));
    socket.on('price', onPrice);
    socket.on('order:update', () => refreshBalances());
    return () => {
      socket.off('price', onPrice);
      window.clearInterval(statsTimer);
    };
  }, []);

  useEffect(() => {
    if (pairs.length) subscribeToPairs(pairs);
  }, [pairs]);

  function refreshBalances() {
    api.get<{ balances: Balance[] }>('/api/wallet/balances').then((res) => setBalances(res.balances)).catch(() => {});
  }

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

  const current = selectedPair ? prices[selectedPair] : undefined;
  const currentStats = selectedPair ? stats[selectedPair] : undefined;

  const baseAsset = useMemo(() => selectedPair?.replace(/USDT|USD|BUSD$/, ''), [selectedPair]);
  const quoteAsset = useMemo(() => selectedPair?.match(/USDT|USD|BUSD$/)?.[0] || 'USDT', [selectedPair]);

  const baseBalance = balances.find((b) => b.asset_symbol === baseAsset);
  const quoteBalance = balances.find((b) => b.asset_symbol === quoteAsset);

  function applyPercent(pct: number) {
    const refPrice = type === 'LIMIT' ? parseFloat(limitPrice) : current?.price;
    if (!refPrice) return;
    if (side === 'BUY') {
      const available = parseFloat(quoteBalance?.available_balance || '0');
      const spend = (available * pct) / 100;
      setAmount((spend / refPrice).toFixed(6));
    } else {
      const available = parseFloat(baseBalance?.available_balance || '0');
      setAmount(((available * pct) / 100).toFixed(6));
    }
  }

  async function submitOrder(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setBusy(true);
    try {
      await api.post('/api/orders', {
        pair: selectedPair,
        type,
        side,
        amount: parseFloat(amount),
        ...(type === 'LIMIT' ? { price: parseFloat(limitPrice) } : {}),
      });
      setMessage({ kind: 'ok', text: `${side} order placed successfully.` });
      setAmount('');
      setLimitPrice('');
      refreshBalances();
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof ApiError ? err.message : 'Failed to place order' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <MobileShell title="Market">
      <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
        {pairs.map((p) => {
          const s = stats[p];
          const pPrice = prices[p]?.price;
          const up = (s?.priceChangePercent ?? 0) >= 0;
          return (
            <button
              key={p}
              onClick={() => setSelectedPair(p)}
              className={`flex min-w-[92px] flex-col items-start gap-0.5 rounded-xl border px-3 py-2 text-left ${
                p === selectedPair ? 'border-accent bg-accent/10' : 'border-border bg-panel'
              }`}
            >
              <span className="text-xs font-semibold">{p.replace(/USDT|USD|BUSD$/, '')}</span>
              <span className="text-[11px] tabular-nums text-muted">
                {pPrice ? pPrice.toLocaleString(undefined, { maximumFractionDigits: pPrice < 10 ? 4 : 2 }) : '—'}
              </span>
              {s && (
                <span className={`text-[10px] font-medium tabular-nums ${up ? 'text-accent' : 'text-danger'}`}>
                  {up ? '+' : ''}
                  {s.priceChangePercent.toFixed(2)}%
                </span>
              )}
            </button>
          );
        })}
      </div>

      {current && (
        <>
          <div className="mb-2 flex items-end justify-between">
            <div>
              <div
                className={`text-2xl font-bold tabular-nums ${
                  currentStats ? (currentStats.priceChangePercent >= 0 ? 'text-accent' : 'text-danger') : ''
                }`}
              >
                {current.price.toLocaleString(undefined, { maximumFractionDigits: 6 })}
              </div>
              <div className="text-xs text-muted">{selectedPair} · {quoteAsset}</div>
            </div>
            {current.source === 'override' && (
              <span className="rounded-full bg-amber-500/15 px-2 py-1 text-[10px] font-semibold text-amber-400">ADMIN OVERRIDE</span>
            )}
          </div>

          {currentStats && (
            <div className="mb-3 grid grid-cols-4 gap-2 text-[11px]">
              <div>
                <div className="text-muted">24h Change</div>
                <div className={`font-semibold tabular-nums ${currentStats.priceChangePercent >= 0 ? 'text-accent' : 'text-danger'}`}>
                  {currentStats.priceChangePercent >= 0 ? '+' : ''}
                  {currentStats.priceChangePercent.toFixed(2)}%
                </div>
              </div>
              <div>
                <div className="text-muted">24h High</div>
                <div className="font-semibold tabular-nums">{currentStats.highPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
              </div>
              <div>
                <div className="text-muted">24h Low</div>
                <div className="font-semibold tabular-nums">{currentStats.lowPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
              </div>
              <div>
                <div className="text-muted">24h Vol ({baseAsset})</div>
                <div className="font-semibold tabular-nums">{currentStats.volume.toLocaleString(undefined, { maximumFractionDigits: 1 })}</div>
              </div>
            </div>
          )}
        </>
      )}

      <div className="mb-4 rounded-2xl border border-border bg-panel p-2 shadow-card">
        {selectedPair && <PriceChart pair={selectedPair} latestTick={current ? { price: current.price, volume: current.volume } : null} />}
      </div>

      <div className="mb-4 flex rounded-xl border border-border bg-panel p-1">
        <button
          onClick={() => setTradeMode('SPOT')}
          className={`flex-1 rounded-lg py-2 text-sm font-semibold ${tradeMode === 'SPOT' ? 'bg-accent text-black' : 'text-muted'}`}
        >
          Spot
        </button>
        <button
          onClick={() => setTradeMode('SHORT_TERM')}
          className={`flex-1 rounded-lg py-2 text-sm font-semibold ${tradeMode === 'SHORT_TERM' ? 'bg-accent text-black' : 'text-muted'}`}
        >
          Short-Term
        </button>
      </div>

      {tradeMode === 'SHORT_TERM' && selectedPair && <ShortTermTradePanel pair={selectedPair} onSettled={refreshBalances} />}

      {tradeMode === 'SPOT' && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-border bg-panel p-3">
              <div className="text-[11px] text-muted">{quoteAsset} available</div>
              <div className="font-semibold tabular-nums">{parseFloat(quoteBalance?.available_balance || '0').toLocaleString()}</div>
            </div>
            <div className="rounded-xl border border-border bg-panel p-3">
              <div className="text-[11px] text-muted">{baseAsset} available</div>
              <div className="font-semibold tabular-nums">{parseFloat(baseBalance?.available_balance || '0').toLocaleString()}</div>
            </div>
          </div>

      <form onSubmit={submitOrder} className="rounded-2xl border border-border bg-panel p-4">
        <div className="mb-3 flex rounded-xl bg-surface p-1">
          <button type="button" onClick={() => setSide('BUY')} className={`flex-1 rounded-lg py-2 text-sm font-semibold ${side === 'BUY' ? 'bg-accent text-black' : 'text-muted'}`}>
            Buy
          </button>
          <button type="button" onClick={() => setSide('SELL')} className={`flex-1 rounded-lg py-2 text-sm font-semibold ${side === 'SELL' ? 'bg-danger text-white' : 'text-muted'}`}>
            Sell
          </button>
        </div>

        <div className="mb-3 flex gap-4 text-sm">
          <label className="flex items-center gap-1.5">
            <input type="radio" checked={type === 'MARKET'} onChange={() => setType('MARKET')} /> Market
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" checked={type === 'LIMIT'} onChange={() => setType('LIMIT')} /> Limit
          </label>
        </div>

        {type === 'LIMIT' && (
          <input
            type="number"
            step="any"
            required
            placeholder={`Limit price (${quoteAsset})`}
            value={limitPrice}
            onChange={(e) => setLimitPrice(e.target.value)}
            className="mb-2 w-full rounded-xl border border-border bg-surface px-4 py-3 text-base outline-none focus:border-accent"
          />
        )}
        <input
          type="number"
          step="any"
          required
          placeholder={`Amount (${baseAsset})`}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-base outline-none focus:border-accent"
        />

        <div className="my-2 flex gap-1.5">
          {PERCENT_STEPS.map((pct) => (
            <button
              key={pct}
              type="button"
              onClick={() => applyPercent(pct)}
              className="flex-1 rounded-lg border border-border py-1.5 text-[11px] font-medium text-muted hover:border-accent hover:text-accent"
            >
              {pct}%
            </button>
          ))}
        </div>

        {message && <p className={`mb-2 text-sm ${message.kind === 'ok' ? 'text-accent' : 'text-danger'}`}>{message.text}</p>}

        <button
          type="submit"
          disabled={busy || !selectedPair}
          className={`w-full rounded-xl py-3 text-base font-semibold disabled:opacity-60 ${side === 'BUY' ? 'bg-accent text-black' : 'bg-danger text-white'}`}
        >
          {busy ? 'Placing…' : `${side === 'BUY' ? 'Buy' : 'Sell'} ${selectedPair}`}
        </button>
      </form>
        </>
      )}
    </MobileShell>
  );
}
