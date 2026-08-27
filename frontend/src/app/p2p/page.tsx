'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCircleCheck, faClock } from '@fortawesome/free-solid-svg-icons';
import MobileShell from '@/components/MobileShell';
import { api, ApiError } from '@/lib/api';

interface Ad {
  id: string;
  merchant_id: string;
  merchant_email: string;
  side: 'BUY' | 'SELL';
  asset_symbol: string;
  fiat_symbol: string;
  price: string;
  min_amount: string;
  max_amount: string;
  available_amount: string;
  payment_window_minutes: number;
  payment_methods: string[];
}

export default function P2PPage() {
  const router = useRouter();
  // From the viewer's perspective: 'BUY' means the viewer wants to buy crypto (browsing merchant SELL ads).
  const [tab, setTab] = useState<'BUY' | 'SELL'>('BUY');
  const [asset, setAsset] = useState('USDT');
  const [ads, setAds] = useState<Ad[]>([]);
  const [activeAd, setActiveAd] = useState<Ad | null>(null);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  function load() {
    const adSide = tab === 'BUY' ? 'SELL' : 'BUY';
    api.get<{ ads: Ad[] }>(`/api/p2p/ads?side=${adSide}&asset=${asset}`).then((res) => setAds(res.ads)).catch(() => {});
  }

  useEffect(load, [tab, asset]);

  async function placeOrder() {
    if (!activeAd) return;
    setMessage(null);
    setBusy(true);
    try {
      const res = await api.post<{ order: { id: string } }>('/api/p2p/orders', { adId: activeAd.id, amount: parseFloat(amount) });
      router.push(`/p2p/orders/${res.order.id}`);
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof ApiError ? err.message : 'Failed to create order' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <MobileShell title="P2P">
      <div className="mb-3 flex rounded-xl border border-border bg-panel p-1">
        <button onClick={() => setTab('BUY')} className={`flex-1 rounded-lg py-2 text-sm font-semibold ${tab === 'BUY' ? 'bg-accent text-black' : 'text-muted'}`}>
          Buy Crypto
        </button>
        <button onClick={() => setTab('SELL')} className={`flex-1 rounded-lg py-2 text-sm font-semibold ${tab === 'SELL' ? 'bg-danger text-white' : 'text-muted'}`}>
          Sell Crypto
        </button>
      </div>

      <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
        {['USDT', 'BTC', 'ETH'].map((a) => (
          <button
            key={a}
            onClick={() => setAsset(a)}
            className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium ${
              a === asset ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted'
            }`}
          >
            {a}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        {ads.length === 0 && <p className="mt-8 text-center text-sm text-muted">No merchant offers available for {asset} right now.</p>}
        {ads.map((ad) => (
          <div key={ad.id} className="rounded-xl border border-border bg-panel p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-sm font-semibold">
                <FontAwesomeIcon icon={faCircleCheck} className="text-accent" />
                {ad.merchant_email.split('@')[0]}
              </div>
              <div className="text-right">
                <div className="text-sm font-bold tabular-nums">
                  {parseFloat(ad.price).toLocaleString()} {ad.fiat_symbol}
                </div>
                <div className="text-[10px] text-muted">per {ad.asset_symbol}</div>
              </div>
            </div>
            <div className="mt-1.5 flex items-center justify-between text-xs text-muted">
              <span>
                Limit {parseFloat(ad.min_amount).toLocaleString()}–{parseFloat(ad.max_amount).toLocaleString()} {ad.asset_symbol}
              </span>
              <span>{parseFloat(ad.available_amount).toLocaleString()} available</span>
            </div>
            <div className="mt-1 flex items-center gap-1 text-[11px] text-muted">
              <FontAwesomeIcon icon={faClock} /> Pay within {ad.payment_window_minutes} min
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {ad.payment_methods.map((pm) => (
                <span key={pm} className="rounded bg-surface px-1.5 py-0.5 text-[10px] text-muted">
                  {pm}
                </span>
              ))}
            </div>
            <button
              onClick={() => {
                setActiveAd(ad);
                setAmount('');
                setMessage(null);
              }}
              className={`mt-2 w-full rounded-lg py-2 text-sm font-semibold ${tab === 'BUY' ? 'bg-accent text-black' : 'bg-danger text-white'}`}
            >
              {tab === 'BUY' ? 'Buy' : 'Sell'} {ad.asset_symbol}
            </button>
          </div>
        ))}
      </div>

      {activeAd && (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/60" onClick={() => setActiveAd(null)}>
          <div
            className="w-full max-w-mobile rounded-t-2xl border-t border-border bg-panel p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-3 text-sm font-semibold">
              {tab === 'BUY' ? 'Buy' : 'Sell'} {activeAd.asset_symbol} with {activeAd.merchant_email.split('@')[0]}
            </h3>
            <div className="mb-2 text-xs text-muted">
              Price: {parseFloat(activeAd.price).toLocaleString()} {activeAd.fiat_symbol} per {activeAd.asset_symbol} · Limit{' '}
              {parseFloat(activeAd.min_amount).toLocaleString()}–{parseFloat(activeAd.max_amount).toLocaleString()} · Pay within{' '}
              {activeAd.payment_window_minutes} min
            </div>
            <input
              type="number"
              step="any"
              autoFocus
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={`Amount (${activeAd.asset_symbol})`}
              className="mb-2 w-full rounded-xl border border-border bg-surface px-4 py-3 text-base outline-none focus:border-accent"
            />
            {amount && !Number.isNaN(parseFloat(amount)) && (
              <p className="mb-2 text-xs text-muted">
                Total: <span className="font-semibold text-white">{(parseFloat(amount) * parseFloat(activeAd.price)).toLocaleString()}</span>{' '}
                {activeAd.fiat_symbol}
              </p>
            )}
            {message && <p className="mb-2 text-sm text-danger">{message.text}</p>}
            <button
              onClick={placeOrder}
              disabled={busy || !amount}
              className={`w-full rounded-xl py-3 text-base font-semibold disabled:opacity-60 ${tab === 'BUY' ? 'bg-accent text-black' : 'bg-danger text-white'}`}
            >
              {busy ? 'Creating order…' : 'Confirm'}
            </button>
            <button onClick={() => setActiveAd(null)} className="mt-2 w-full rounded-xl border border-border py-2.5 text-sm text-muted">
              Cancel
            </button>
          </div>
        </div>
      )}
    </MobileShell>
  );
}
