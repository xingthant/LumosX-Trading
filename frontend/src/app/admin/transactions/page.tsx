'use client';

import { useEffect, useState } from 'react';
import AdminShell from '@/components/AdminShell';
import { api, ApiError } from '@/lib/api';

interface Transaction {
  id: string;
  email: string;
  type: string;
  asset_symbol: string;
  amount: string;
  status: string;
  created_at: string;
  payment_method_label: string | null;
}

interface AdminUser {
  id: string;
  email: string;
}

export default function AdminTransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [filter, setFilter] = useState<'PENDING' | 'ALL'>('PENDING');

  const [userId, setUserId] = useState('');
  const [type, setType] = useState<'DEPOSIT' | 'WITHDRAWAL'>('DEPOSIT');
  const [asset, setAsset] = useState('USDT');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    const query = filter === 'ALL' ? '' : `?status=${filter}`;
    api.get<{ transactions: Transaction[] }>(`/api/admin/transactions${query}`).then((res) => setTransactions(res.transactions)).catch(() => {});
    api.get<{ users: AdminUser[] }>('/api/admin/users').then((res) => setUsers(res.users)).catch(() => {});
  }

  useEffect(load, [filter]);

  async function act(id: string, action: 'approve' | 'reject') {
    await api.post(`/api/admin/transactions/${id}/${action}`);
    load();
  }

  async function remove(id: string) {
    await api.del(`/api/admin/transactions/${id}`);
    load();
  }

  async function recordManual(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setBusy(true);
    try {
      await api.post('/api/admin/transactions', {
        userId,
        type,
        assetSymbol: asset,
        amount: parseFloat(amount),
        reason: reason || undefined,
      });
      setMessage({ kind: 'ok', text: 'Transaction recorded and balance updated.' });
      setAmount('');
      setReason('');
      load();
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof ApiError ? err.message : 'Failed to record transaction' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminShell title="Deposits & Withdrawals">
      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2">
          <div className="mb-4 flex gap-2">
            {(['PENDING', 'ALL'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium ${f === filter ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted'}`}
              >
                {f}
              </button>
            ))}
          </div>

          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-panel text-left text-muted">
                <tr>
                  <th className="px-3 py-2">User</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Asset</th>
                  <th className="px-3 py-2">Amount</th>
                  <th className="px-3 py-2">Payout to</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Requested</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => (
                  <tr key={t.id} className="border-t border-border">
                    <td className="px-3 py-2">{t.email}</td>
                    <td className="px-3 py-2">{t.type}</td>
                    <td className="px-3 py-2">{t.asset_symbol}</td>
                    <td className="px-3 py-2 tabular-nums">{parseFloat(t.amount).toLocaleString()}</td>
                    <td className="px-3 py-2 text-xs text-muted">{t.payment_method_label || '—'}</td>
                    <td className="px-3 py-2">{t.status}</td>
                    <td className="px-3 py-2 text-xs text-muted">{new Date(t.created_at).toLocaleString()}</td>
                    <td className="px-3 py-2">
                      {t.status === 'PENDING' && (
                        <div className="flex gap-2">
                          <button onClick={() => act(t.id, 'approve')} className="rounded-lg bg-accent px-2 py-1 text-xs font-semibold text-black">
                            Approve
                          </button>
                          <button onClick={() => act(t.id, 'reject')} className="rounded-lg bg-danger px-2 py-1 text-xs font-semibold text-white">
                            Reject
                          </button>
                          <button onClick={() => remove(t.id)} className="rounded-lg border border-border px-2 py-1 text-xs text-muted">
                            Delete
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {transactions.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-3 py-6 text-center text-muted">
                      Nothing here.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-panel p-4">
          <h3 className="mb-1 text-sm font-semibold">Record a manual transaction</h3>
          <p className="mb-3 text-[11px] text-muted">
            Applies immediately as COMPLETED — use this for deposits/withdrawals confirmed outside the normal request flow.
          </p>
          <form onSubmit={recordManual} className="flex flex-col gap-2">
            <select required value={userId} onChange={(e) => setUserId(e.target.value)} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm">
              <option value="">Select user…</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.email}
                </option>
              ))}
            </select>
            <div className="flex rounded-xl bg-surface p-1">
              <button type="button" onClick={() => setType('DEPOSIT')} className={`flex-1 rounded-lg py-1.5 text-xs font-semibold ${type === 'DEPOSIT' ? 'bg-accent text-black' : 'text-muted'}`}>
                Deposit
              </button>
              <button type="button" onClick={() => setType('WITHDRAWAL')} className={`flex-1 rounded-lg py-1.5 text-xs font-semibold ${type === 'WITHDRAWAL' ? 'bg-danger text-white' : 'text-muted'}`}>
                Withdrawal
              </button>
            </div>
            <input value={asset} onChange={(e) => setAsset(e.target.value.toUpperCase())} placeholder="Asset" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
            <input required type="number" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional)" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
            {message && <p className={`text-xs ${message.kind === 'ok' ? 'text-accent' : 'text-danger'}`}>{message.text}</p>}
            <button type="submit" disabled={busy} className="mt-1 rounded-lg bg-accent py-2 text-sm font-semibold text-black disabled:opacity-60">
              {busy ? 'Recording…' : 'Record transaction'}
            </button>
          </form>
        </div>
      </div>
    </AdminShell>
  );
}
