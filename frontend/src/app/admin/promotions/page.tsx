'use client';

import { useEffect, useState } from 'react';
import AdminShell from '@/components/AdminShell';
import { api, ApiError } from '@/lib/api';

interface Promotion {
  id: string;
  title: string;
  description: string | null;
  badge_text: string | null;
  is_active: boolean;
  created_at: string;
}

export default function AdminPromotionsPage() {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [badgeText, setBadgeText] = useState('');
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    api.get<{ promotions: Promotion[] }>('/api/admin/promotions').then((res) => setPromotions(res.promotions)).catch(() => {});
  }

  useEffect(load, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setBusy(true);
    try {
      await api.post('/api/admin/promotions', { title, description: description || undefined, badgeText: badgeText || undefined });
      setMessage({ kind: 'ok', text: 'Promotion added.' });
      setTitle('');
      setDescription('');
      setBadgeText('');
      load();
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof ApiError ? err.message : 'Failed to add promotion' });
    } finally {
      setBusy(false);
    }
  }

  async function toggle(p: Promotion) {
    await api.patch(`/api/admin/promotions/${p.id}`, { isActive: !p.is_active });
    load();
  }

  async function remove(p: Promotion) {
    await api.del(`/api/admin/promotions/${p.id}`);
    load();
  }

  return (
    <AdminShell title="Promotions">
      <p className="mb-4 text-sm text-muted">These appear on the user-facing Explore tab.</p>
      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2 flex flex-col gap-2">
          {promotions.map((p) => (
            <div key={p.id} className="rounded-xl border border-border bg-panel p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{p.title}</span>
                  {p.badge_text && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-400">{p.badge_text}</span>}
                </div>
                <span className={p.is_active ? 'text-accent text-xs' : 'text-muted text-xs'}>{p.is_active ? 'Active' : 'Inactive'}</span>
              </div>
              {p.description && <p className="mt-1 text-xs text-muted">{p.description}</p>}
              <div className="mt-2 flex gap-2">
                <button onClick={() => toggle(p)} className="rounded-lg border border-border px-2 py-1 text-xs">
                  {p.is_active ? 'Deactivate' : 'Activate'}
                </button>
                <button onClick={() => remove(p)} className="rounded-lg border border-border px-2 py-1 text-xs text-danger">
                  Delete
                </button>
              </div>
            </div>
          ))}
          {promotions.length === 0 && <p className="rounded-xl border border-border bg-panel p-6 text-center text-sm text-muted">No promotions yet.</p>}
        </div>

        <div className="rounded-xl border border-border bg-panel p-4">
          <h3 className="mb-3 text-sm font-semibold">Add a promotion</h3>
          <form onSubmit={submit} className="flex flex-col gap-2">
            <input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (optional)" rows={3} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
            <input value={badgeText} onChange={(e) => setBadgeText(e.target.value)} placeholder="Badge text (e.g. NEW, 20% OFF)" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
            {message && <p className={`text-xs ${message.kind === 'ok' ? 'text-accent' : 'text-danger'}`}>{message.text}</p>}
            <button type="submit" disabled={busy} className="mt-1 rounded-lg bg-accent py-2 text-sm font-semibold text-black disabled:opacity-60">
              {busy ? 'Adding…' : 'Add promotion'}
            </button>
          </form>
        </div>
      </div>
    </AdminShell>
  );
}
