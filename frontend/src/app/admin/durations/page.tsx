'use client';

import { useEffect, useState } from 'react';
import AdminShell from '@/components/AdminShell';
import { api, ApiError } from '@/lib/api';

interface Duration {
  id: string;
  label: string;
  seconds: number;
  payout_multiplier: string;
  is_active: boolean;
}

export default function AdminDurationsPage() {
  const [durations, setDurations] = useState<Duration[]>([]);
  const [label, setLabel] = useState('');
  const [seconds, setSeconds] = useState('30');
  const [multiplier, setMultiplier] = useState('1.8');
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    api.get<{ durations: Duration[] }>('/api/admin/trade-durations').then((res) => setDurations(res.durations)).catch(() => {});
  }

  useEffect(load, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setBusy(true);
    try {
      await api.post('/api/admin/trade-durations', { label, seconds: parseInt(seconds, 10), payoutMultiplier: parseFloat(multiplier) });
      setMessage({ kind: 'ok', text: 'Duration added.' });
      setLabel('');
      load();
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof ApiError ? err.message : 'Failed to add duration' });
    } finally {
      setBusy(false);
    }
  }

  async function toggle(d: Duration) {
    await api.patch(`/api/admin/trade-durations/${d.id}`, { isActive: !d.is_active });
    load();
  }

  async function remove(d: Duration) {
    await api.del(`/api/admin/trade-durations/${d.id}`);
    load();
  }

  return (
    <AdminShell title="Trade Durations">
      <p className="mb-4 text-sm text-muted">
        These are the fixed time windows users can pick when placing a short-term Up/Down trade on the Market tab.
      </p>
      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2 overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-panel text-left text-muted">
              <tr>
                <th className="px-3 py-2">Label</th>
                <th className="px-3 py-2">Seconds</th>
                <th className="px-3 py-2">Payout</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {durations.map((d) => (
                <tr key={d.id} className="border-t border-border">
                  <td className="px-3 py-2">{d.label}</td>
                  <td className="px-3 py-2 tabular-nums">{d.seconds}</td>
                  <td className="px-3 py-2 tabular-nums">{parseFloat(d.payout_multiplier).toFixed(2)}x</td>
                  <td className="px-3 py-2">
                    <span className={d.is_active ? 'text-accent' : 'text-muted'}>{d.is_active ? 'Active' : 'Inactive'}</span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      <button onClick={() => toggle(d)} className="rounded-lg border border-border px-2 py-1 text-xs">
                        {d.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button onClick={() => remove(d)} className="rounded-lg border border-border px-2 py-1 text-xs text-danger">
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-xl border border-border bg-panel p-4">
          <h3 className="mb-3 text-sm font-semibold">Add a duration</h3>
          <form onSubmit={submit} className="flex flex-col gap-2">
            <input required value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (e.g. 2 Minutes)" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
            <input required type="number" min={1} value={seconds} onChange={(e) => setSeconds(e.target.value)} placeholder="Seconds" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
            <input required type="number" step="0.01" min={1.01} value={multiplier} onChange={(e) => setMultiplier(e.target.value)} placeholder="Payout multiplier (e.g. 1.8)" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
            {message && <p className={`text-xs ${message.kind === 'ok' ? 'text-accent' : 'text-danger'}`}>{message.text}</p>}
            <button type="submit" disabled={busy} className="mt-1 rounded-lg bg-accent py-2 text-sm font-semibold text-black disabled:opacity-60">
              {busy ? 'Adding…' : 'Add duration'}
            </button>
          </form>
        </div>
      </div>
    </AdminShell>
  );
}
