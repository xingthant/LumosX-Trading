'use client';

import { useEffect, useMemo, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowTrendUp, faArrowTrendDown, faCircleCheck, faCircleXmark } from '@fortawesome/free-solid-svg-icons';
import AdminShell from '@/components/AdminShell';
import { api, ApiError } from '@/lib/api';

interface AdminUser {
  id: string;
  email: string;
}

type ForcedOutcome = 'BULL' | 'BEAR' | 'WIN' | 'LOSE';

interface Override {
  id: string;
  user_id: string | null;
  user_email: string | null;
  pair: string | null;
  forced_outcome: ForcedOutcome;
  is_active: boolean;
  created_at: string;
}

const OUTCOME_DISPLAY: Record<ForcedOutcome, { label: string; icon: any; className: string }> = {
  BULL: { label: 'Bull (direction)', icon: faArrowTrendUp, className: 'text-accent' },
  BEAR: { label: 'Bear (direction)', icon: faArrowTrendDown, className: 'text-danger' },
  WIN: { label: 'Always Win', icon: faCircleCheck, className: 'text-accent' },
  LOSE: { label: 'Always Lose', icon: faCircleXmark, className: 'text-danger' },
};

export default function AdminOutcomesPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [userId, setUserId] = useState('');
  const [pair, setPair] = useState('');
  const [forcedOutcome, setForcedOutcome] = useState<ForcedOutcome>('BULL');
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    api.get<{ users: AdminUser[] }>('/api/admin/users').then((res) => setUsers(res.users)).catch(() => {});
    api.get<{ overrides: Override[] }>('/api/admin/trade-outcomes').then((res) => setOverrides(res.overrides)).catch(() => {});
  }

  useEffect(load, []);

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => u.email.toLowerCase().includes(q));
  }, [users, userSearch]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setBusy(true);
    try {
      await api.post('/api/admin/trade-outcomes', {
        userId: userId || undefined,
        pair: pair || undefined,
        forcedOutcome,
      });
      setMessage({ kind: 'ok', text: 'Outcome control applied.' });
      setPair('');
      load();
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof ApiError ? err.message : 'Failed to apply outcome control' });
    } finally {
      setBusy(false);
    }
  }

  async function toggle(o: Override) {
    await api.patch(`/api/admin/trade-outcomes/${o.id}`, { isActive: !o.is_active });
    load();
  }

  async function remove(o: Override) {
    await api.del(`/api/admin/trade-outcomes/${o.id}`);
    load();
  }

  return (
    <AdminShell title="Trade Outcome Control">
      <p className="mb-4 max-w-2xl text-sm text-muted">
        <span className="text-white">Bull / Bear</span> forces the market direction — the trade still wins or loses based on whether
        the user picked Up or Down against that direction.{' '}
        <span className="text-white">Always Win / Always Lose</span> forces the settlement result directly — whatever the user picks,
        that's the outcome, every time this rule is active. Leave user or coin blank to apply broadly; more specific rules (user +
        coin) win over broader ones.
      </p>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2 overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-panel text-left text-muted">
              <tr>
                <th className="px-3 py-2">User</th>
                <th className="px-3 py-2">Coin</th>
                <th className="px-3 py-2">Forced outcome</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {overrides.map((o) => {
                const display = OUTCOME_DISPLAY[o.forced_outcome];
                return (
                  <tr key={o.id} className="border-t border-border">
                    <td className="px-3 py-2">{o.user_email || 'All users'}</td>
                    <td className="px-3 py-2">{o.pair || 'All coins'}</td>
                    <td className="px-3 py-2">
                      <span className={`flex items-center gap-1.5 font-medium ${display.className}`}>
                        <FontAwesomeIcon icon={display.icon} />
                        {display.label}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className={o.is_active ? 'text-accent' : 'text-muted'}>{o.is_active ? 'Active' : 'Inactive'}</span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-2">
                        <button onClick={() => toggle(o)} className="rounded-lg border border-border px-2 py-1 text-xs">
                          {o.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                        <button onClick={() => remove(o)} className="rounded-lg border border-border px-2 py-1 text-xs text-danger">
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {overrides.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-muted">
                    No outcome controls configured — trades settle naturally by price movement.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="rounded-xl border border-border bg-panel p-4">
          <h3 className="mb-3 text-sm font-semibold">Add an outcome control</h3>
          <form onSubmit={submit} className="flex flex-col gap-2">
            <input
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              placeholder="Search users by email…"
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <select value={userId} onChange={(e) => setUserId(e.target.value)} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm">
              <option value="">All users</option>
              {filteredUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.email}
                </option>
              ))}
            </select>
            {userSearch && filteredUsers.length === 0 && <p className="text-xs text-muted">No users match "{userSearch}".</p>}
            <input value={pair} onChange={(e) => setPair(e.target.value.toUpperCase())} placeholder="Coin pair (e.g. BTCUSDT), blank = all" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" />

            <p className="mt-1 text-[11px] text-muted">Direction-based (depends on the user's Up/Down pick)</p>
            <div className="flex rounded-xl bg-surface p-1">
              <button type="button" onClick={() => setForcedOutcome('BULL')} className={`flex-1 rounded-lg py-1.5 text-xs font-semibold ${forcedOutcome === 'BULL' ? 'bg-accent text-black' : 'text-muted'}`}>
                Force Bull (Up)
              </button>
              <button type="button" onClick={() => setForcedOutcome('BEAR')} className={`flex-1 rounded-lg py-1.5 text-xs font-semibold ${forcedOutcome === 'BEAR' ? 'bg-danger text-white' : 'text-muted'}`}>
                Force Bear (Down)
              </button>
            </div>

            <p className="mt-1 text-[11px] text-muted">Direct result (ignores the user's pick entirely)</p>
            <div className="flex rounded-xl bg-surface p-1">
              <button type="button" onClick={() => setForcedOutcome('WIN')} className={`flex-1 rounded-lg py-1.5 text-xs font-semibold ${forcedOutcome === 'WIN' ? 'bg-accent text-black' : 'text-muted'}`}>
                Always Win
              </button>
              <button type="button" onClick={() => setForcedOutcome('LOSE')} className={`flex-1 rounded-lg py-1.5 text-xs font-semibold ${forcedOutcome === 'LOSE' ? 'bg-danger text-white' : 'text-muted'}`}>
                Always Lose
              </button>
            </div>

            {message && <p className={`text-xs ${message.kind === 'ok' ? 'text-accent' : 'text-danger'}`}>{message.text}</p>}
            <button type="submit" disabled={busy} className="mt-1 rounded-lg bg-accent py-2 text-sm font-semibold text-black disabled:opacity-60">
              {busy ? 'Applying…' : 'Apply control'}
            </button>
          </form>
        </div>
      </div>
    </AdminShell>
  );
}
