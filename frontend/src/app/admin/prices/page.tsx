'use client';

import { useEffect, useState } from 'react';
import AdminShell from '@/components/AdminShell';
import { api, ApiError } from '@/lib/api';

interface ResolvedPrice {
  pair: string;
  price: number;
  source: 'override' | 'live';
}

interface OverrideRow {
  pair: string;
  custom_price: string;
  is_active: boolean;
  updated_at: string;
}

export default function AdminPricesPage() {
  const [prices, setPrices] = useState<ResolvedPrice[]>([]);
  const [overrides, setOverrides] = useState<OverrideRow[]>([]);
  const [pair, setPair] = useState('BTCUSDT');
  const [customPrice, setCustomPrice] = useState('');
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    api.get<{ prices: ResolvedPrice[] }>('/api/market/prices').then((res) => setPrices(res.prices)).catch(() => {});
    api.get<{ overrides: OverrideRow[] }>('/api/admin/prices/overrides').then((res) => setOverrides(res.overrides)).catch(() => {});
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);

  async function setOverride(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setBusy(true);
    try {
      await api.post('/api/admin/prices/override', { pair: pair.toUpperCase(), price: parseFloat(customPrice) });
      setMessage({ kind: 'ok', text: `Override applied for ${pair.toUpperCase()}.` });
      setCustomPrice('');
      load();
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof ApiError ? err.message : 'Failed to set override' });
    } finally {
      setBusy(false);
    }
  }

  async function clearOverride(p: string) {
    await api.del(`/api/admin/prices/override/${p}`);
    load();
  }

  return (
    <AdminShell title="Price Overrides">
      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-panel p-4">
          <h3 className="mb-3 text-sm font-semibold">Trigger a price override</h3>
          <form onSubmit={setOverride} className="flex flex-col gap-2">
            <input value={pair} onChange={(e) => setPair(e.target.value.toUpperCase())} placeholder="Pair (e.g. BTCUSDT)" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
            <input type="number" step="any" required value={customPrice} onChange={(e) => setCustomPrice(e.target.value)} placeholder="Custom price" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
            {message && <p className={`text-xs ${message.kind === 'ok' ? 'text-accent' : 'text-danger'}`}>{message.text}</p>}
            <button type="submit" disabled={busy} className="mt-1 rounded-lg bg-amber-500 py-2 text-sm font-semibold text-black disabled:opacity-60">
              {busy ? 'Broadcasting…' : 'Broadcast override'}
            </button>
          </form>
          <p className="mt-3 text-xs text-muted">
            Overrides immediately replace the live feed price for this pair and are broadcast to all connected clients, including the
            matching engine — useful for testing order execution at specific price levels.
          </p>
        </div>

        <div className="rounded-xl border border-border bg-panel p-4">
          <h3 className="mb-3 text-sm font-semibold">Active overrides</h3>
          <div className="flex flex-col gap-2">
            {overrides.filter((o) => o.is_active).length === 0 && <p className="text-sm text-muted">No active overrides.</p>}
            {overrides
              .filter((o) => o.is_active)
              .map((o) => (
                <div key={o.pair} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                  <span>{o.pair}</span>
                  <span className="tabular-nums text-amber-400">{parseFloat(o.custom_price).toLocaleString()}</span>
                  <button onClick={() => clearOverride(o.pair)} className="rounded border border-border px-2 py-1 text-xs">
                    Clear
                  </button>
                </div>
              ))}
          </div>
        </div>
      </div>

      <h3 className="mb-3 mt-6 text-sm font-semibold">Live resolved prices</h3>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-panel text-left text-muted">
            <tr>
              <th className="px-3 py-2">Pair</th>
              <th className="px-3 py-2">Resolved price</th>
              <th className="px-3 py-2">Source</th>
            </tr>
          </thead>
          <tbody>
            {prices.map((p) => (
              <tr key={p.pair} className="border-t border-border">
                <td className="px-3 py-2">{p.pair}</td>
                <td className="px-3 py-2 tabular-nums">{p.price.toLocaleString(undefined, { maximumFractionDigits: 6 })}</td>
                <td className="px-3 py-2">{p.source === 'override' ? <span className="text-amber-400">OVERRIDE</span> : <span className="text-muted">LIVE</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
