'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import MobileShell from '@/components/MobileShell';
import { api, ApiError } from '@/lib/api';

interface Ad {
  id: string;
  side: 'BUY' | 'SELL';
  asset_symbol: string;
  fiat_symbol: string;
  price: string;
  min_amount: string;
  max_amount: string;
  available_amount: string;
  payment_window_minutes: number;
  payment_methods: string[];
  bank_method_ids: string[];
  bank_options: { id: string; bankName: string }[];
  status: 'ACTIVE' | 'PAUSED';
}

interface BankAccount {
  id: string;
  bank_name: string;
  account_holder: string;
  account_number: string;
  note: string | null;
}

interface Balance {
  asset_symbol: string;
  available_balance: string;
}

interface Order {
  id: string;
  merchant_email: string;
  taker_email: string;
  ad_side: 'BUY' | 'SELL';
  asset_symbol: string;
  amount: string;
  total_fiat: string;
  fiat_symbol: string;
  status: string;
  created_at: string;
}

const PAYMENT_WINDOWS = [1, 15, 30] as const;

const emptyForm = {
  side: 'SELL' as 'BUY' | 'SELL',
  assetSymbol: 'USDT',
  fiatSymbol: 'USD',
  price: '',
  minAmount: '',
  maxAmount: '',
  availableAmount: '',
  paymentWindowMinutes: 15 as 1 | 15 | 30,
  paymentMethods: '',
  terms: '',
};

export default function MerchantCenterPage() {
  const [ads, setAds] = useState<Ad[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [selectedBankIds, setSelectedBankIds] = useState<string[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [adsMessage, setAdsMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [forbidden, setForbidden] = useState(false);

  function load() {
    api
      .get<{ ads: Ad[] }>('/api/p2p/ads/mine')
      .then((res) => setAds(res.ads))
      .catch((err) => {
        if (err instanceof ApiError && err.status === 403) setForbidden(true);
      });
    api.get<{ orders: Order[] }>('/api/p2p/orders').then((res) => setOrders(res.orders)).catch(() => {});
    api
      .get<{ methods: (BankAccount & { type: string })[] }>('/api/wallet/payment-methods')
      .then((res) => setBankAccounts(res.methods.filter((m) => m.type === 'BANK_ACCOUNT')))
      .catch(() => {});
    api.get<{ balances: Balance[] }>('/api/wallet/balances').then((res) => setBalances(res.balances)).catch(() => {});
  }

  const sellAssetBalance = balances.find((b) => b.asset_symbol === form.assetSymbol.toUpperCase());

  useEffect(load, []);

  function toggleBankId(id: string) {
    setSelectedBankIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function createAd(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    const labelCount = form.paymentMethods.split(',').map((s) => s.trim()).filter(Boolean).length;
    if (form.side === 'SELL' ? selectedBankIds.length === 0 && labelCount === 0 : labelCount === 0) {
      setMessage({ kind: 'error', text: 'Choose at least one bank account or add a payment method label' });
      return;
    }
    setBusy(true);
    try {
      await api.post('/api/p2p/ads', {
        side: form.side,
        assetSymbol: form.assetSymbol,
        fiatSymbol: form.fiatSymbol,
        price: parseFloat(form.price),
        minAmount: parseFloat(form.minAmount),
        maxAmount: parseFloat(form.maxAmount),
        availableAmount: parseFloat(form.availableAmount),
        paymentWindowMinutes: form.paymentWindowMinutes,
        paymentMethods: form.paymentMethods.split(',').map((s) => s.trim()).filter(Boolean),
        bankMethodIds: form.side === 'SELL' ? selectedBankIds : undefined,
        terms: form.terms || undefined,
      });
      setMessage({ kind: 'ok', text: 'Ad published.' });
      setForm(emptyForm);
      setSelectedBankIds([]);
      load();
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof ApiError ? err.message : 'Failed to publish ad' });
    } finally {
      setBusy(false);
    }
  }

  async function toggleAd(ad: Ad) {
    setAdsMessage(null);
    try {
      await api.patch(`/api/p2p/ads/${ad.id}`, { status: ad.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE' });
      load();
    } catch (err) {
      setAdsMessage({ kind: 'error', text: err instanceof ApiError ? err.message : 'Failed to update ad' });
    }
  }

  async function deleteAd(ad: Ad) {
    setAdsMessage(null);
    try {
      await api.del(`/api/p2p/ads/${ad.id}`);
      setAdsMessage({ kind: 'ok', text: 'Ad deleted.' });
      load();
    } catch (err) {
      setAdsMessage({ kind: 'error', text: err instanceof ApiError ? err.message : 'Failed to delete ad' });
    }
  }

  if (forbidden) {
    return (
      <MobileShell title="Merchant Center">
        <div className="mt-8 rounded-2xl border border-border bg-panel p-6 text-center text-sm text-muted">
          You're not a merchant yet. Ask an admin to grant merchant status to your account.
        </div>
      </MobileShell>
    );
  }

  const actionableOrders = orders.filter((o) => o.status === 'PENDING_PAYMENT' || o.status === 'PAID');

  return (
    <MobileShell title="Merchant Center">
      {actionableOrders.length > 0 && (
        <div className="mb-4">
          <h2 className="mb-2 text-sm font-semibold text-muted">Needs your action</h2>
          <div className="flex flex-col gap-2">
            {actionableOrders.map((o) => (
              <Link key={o.id} href={`/p2p/orders/${o.id}`} className="block rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-medium">
                    {o.taker_email} · {parseFloat(o.amount).toLocaleString()} {o.asset_symbol}
                  </span>
                  <span className="text-amber-400">{o.status}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      <h2 className="mb-2 text-sm font-semibold text-muted">My Ads</h2>
      {adsMessage && (
        <p className={`mb-2 text-xs ${adsMessage.kind === 'ok' ? 'text-accent' : 'text-danger'}`}>{adsMessage.text}</p>
      )}
      <div className="mb-4 flex flex-col gap-2">
        {ads.length === 0 && <p className="text-sm text-muted">No ads published yet.</p>}
        {ads.map((ad) => (
          <div key={ad.id} className="rounded-xl border border-border bg-panel p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className={`font-semibold ${ad.side === 'SELL' ? 'text-accent' : 'text-danger'}`}>
                {ad.side === 'SELL' ? 'Selling' : 'Buying'} {ad.asset_symbol}
              </span>
              <span className={ad.status === 'ACTIVE' ? 'text-accent text-xs' : 'text-muted text-xs'}>{ad.status}</span>
            </div>
            <div className="mt-1 text-xs text-muted">
              {parseFloat(ad.price).toLocaleString()} {ad.fiat_symbol} · limit {parseFloat(ad.min_amount).toLocaleString()}–
              {parseFloat(ad.max_amount).toLocaleString()} · {parseFloat(ad.available_amount).toLocaleString()} left · pay within{' '}
              {ad.payment_window_minutes} min
            </div>
            {(ad.bank_options.length > 0 || ad.payment_methods.length > 0) && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {ad.bank_options?.map((b) => (
                  <span key={b.id} className="rounded bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent">
                    {b.bankName}
                  </span>
                ))}
                {ad.payment_methods.map((pm) => (
                  <span key={pm} className="rounded bg-surface px-1.5 py-0.5 text-[10px] text-muted">
                    {pm}
                  </span>
                ))}
              </div>
            )}
            <div className="mt-2 flex gap-2">
              <button onClick={() => toggleAd(ad)} className="rounded-lg border border-border px-2 py-1 text-xs">
                {ad.status === 'ACTIVE' ? 'Pause' : 'Resume'}
              </button>
              <button onClick={() => deleteAd(ad)} className="rounded-lg border border-border px-2 py-1 text-xs text-danger">
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      <h2 className="mb-2 text-sm font-semibold text-muted">Publish a new ad</h2>
      <form onSubmit={createAd} className="rounded-2xl border border-border bg-panel p-4">
        <div className="mb-2 flex rounded-xl bg-surface p-1">
          <button type="button" onClick={() => setForm({ ...form, side: 'SELL' })} className={`flex-1 rounded-lg py-2 text-sm font-semibold ${form.side === 'SELL' ? 'bg-accent text-black' : 'text-muted'}`}>
            I'm Selling
          </button>
          <button type="button" onClick={() => setForm({ ...form, side: 'BUY' })} className={`flex-1 rounded-lg py-2 text-sm font-semibold ${form.side === 'BUY' ? 'bg-danger text-white' : 'text-muted'}`}>
            I'm Buying
          </button>
        </div>
        <div className="mb-2 flex gap-2">
          <input value={form.assetSymbol} onChange={(e) => setForm({ ...form, assetSymbol: e.target.value.toUpperCase() })} placeholder="Asset" className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
          <input value={form.fiatSymbol} onChange={(e) => setForm({ ...form, fiatSymbol: e.target.value.toUpperCase() })} placeholder="Fiat currency" className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
        </div>
        <input required type="number" step="any" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="Price per unit" className="mb-2 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
        <div className="mb-2 flex gap-2">
          <input required type="number" step="any" value={form.minAmount} onChange={(e) => setForm({ ...form, minAmount: e.target.value })} placeholder="Min amount" className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
          <input required type="number" step="any" value={form.maxAmount} onChange={(e) => setForm({ ...form, maxAmount: e.target.value })} placeholder="Max amount" className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
        </div>
        <input required type="number" step="any" value={form.availableAmount} onChange={(e) => setForm({ ...form, availableAmount: e.target.value })} placeholder="Total available amount" className="mb-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
        {form.side === 'SELL' && (
          <p className="mb-2 text-[11px] text-muted">
            You have{' '}
            <span className={parseFloat(sellAssetBalance?.available_balance || '0') > 0 ? 'text-accent' : 'text-danger'}>
              {parseFloat(sellAssetBalance?.available_balance || '0').toLocaleString()} {form.assetSymbol}
            </span>{' '}
            available to sell.
          </p>
        )}
        <div className="mb-2">
          <label className="mb-1 block text-[11px] text-muted">Payment window — how long the buyer has to pay</label>
          <div className="flex rounded-xl bg-surface p-1">
            {PAYMENT_WINDOWS.map((mins) => (
              <button
                key={mins}
                type="button"
                onClick={() => setForm({ ...form, paymentWindowMinutes: mins })}
                className={`flex-1 rounded-lg py-1.5 text-xs font-semibold ${form.paymentWindowMinutes === mins ? 'bg-accent text-black' : 'text-muted'}`}
              >
                {mins} min
              </button>
            ))}
          </div>
        </div>
        {form.side === 'SELL' && (
          <div className="mb-2">
            <label className="mb-1 block text-[11px] text-muted">Bank accounts buyers can pay into (pick up to 7)</label>
            {bankAccounts.length === 0 ? (
              <p className="rounded-lg border border-border bg-surface px-3 py-2 text-xs text-muted">
                No bank accounts saved yet —{' '}
                <Link href="/settings" className="text-accent underline">
                  add one in Settings
                </Link>{' '}
                to let buyers pay directly into your bank.
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {bankAccounts.map((b) => (
                  <label
                    key={b.id}
                    className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-xs ${
                      selectedBankIds.includes(b.id) ? 'border-accent bg-accent/10' : 'border-border bg-surface'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={selectedBankIds.includes(b.id)}
                      disabled={!selectedBankIds.includes(b.id) && selectedBankIds.length >= 7}
                      onChange={() => toggleBankId(b.id)}
                    />
                    <span>
                      <span className="font-medium">{b.bank_name}</span> · {b.account_holder} · {b.account_number}
                      {b.note && <span className="block text-muted">Note: {b.note}</span>}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}
        <input value={form.paymentMethods} onChange={(e) => setForm({ ...form, paymentMethods: e.target.value })} placeholder="Other payment methods (comma separated, optional)" className="mb-2 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
        <textarea value={form.terms} onChange={(e) => setForm({ ...form, terms: e.target.value })} placeholder="Terms (optional)" rows={2} className="mb-2 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
        {message && <p className={`mb-2 text-xs ${message.kind === 'ok' ? 'text-accent' : 'text-danger'}`}>{message.text}</p>}
        <button type="submit" disabled={busy} className="w-full rounded-lg bg-accent py-2.5 text-sm font-semibold text-black disabled:opacity-60">
          {busy ? 'Publishing…' : 'Publish ad'}
        </button>
      </form>
    </MobileShell>
  );
}
