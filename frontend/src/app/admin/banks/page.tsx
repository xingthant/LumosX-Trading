'use client';

import { useEffect, useState } from 'react';
import AdminShell from '@/components/AdminShell';
import { api, ApiError } from '@/lib/api';

interface Bank {
  id: string;
  bank_name: string;
  account_holder: string;
  account_number: string;
  iban: string | null;
  swift_code: string | null;
  currency: string;
  instructions: string | null;
  is_active: boolean;
  created_at: string;
}

const emptyForm = {
  bankName: '',
  accountHolder: '',
  accountNumber: '',
  iban: '',
  swiftCode: '',
  currency: 'USDT',
  instructions: '',
};

export default function AdminBanksPage() {
  const [banks, setBanks] = useState<Bank[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    api.get<{ banks: Bank[] }>('/api/admin/banks').then((res) => setBanks(res.banks)).catch(() => {});
  }

  useEffect(load, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setBusy(true);
    try {
      await api.post('/api/admin/banks', {
        bankName: form.bankName,
        accountHolder: form.accountHolder,
        accountNumber: form.accountNumber,
        iban: form.iban || undefined,
        swiftCode: form.swiftCode || undefined,
        currency: form.currency,
        instructions: form.instructions || undefined,
      });
      setMessage({ kind: 'ok', text: 'Bank account added.' });
      setForm(emptyForm);
      load();
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof ApiError ? err.message : 'Failed to add bank' });
    } finally {
      setBusy(false);
    }
  }

  async function setActive(bank: Bank, isActive: boolean) {
    await api.patch(`/api/admin/banks/${bank.id}`, { isActive });
    load();
  }

  async function remove(bank: Bank) {
    await api.del(`/api/admin/banks/${bank.id}`);
    load();
  }

  return (
    <AdminShell title="Bank Config">
      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2 overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-panel text-left text-muted">
              <tr>
                <th className="px-3 py-2">Bank</th>
                <th className="px-3 py-2">Account holder</th>
                <th className="px-3 py-2">Account number</th>
                <th className="px-3 py-2">Currency</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {banks.map((b) => (
                <tr key={b.id} className="border-t border-border align-top">
                  <td className="px-3 py-2">{b.bank_name}</td>
                  <td className="px-3 py-2">{b.account_holder}</td>
                  <td className="px-3 py-2">{b.account_number}</td>
                  <td className="px-3 py-2">{b.currency}</td>
                  <td className="px-3 py-2">
                    <span className={b.is_active ? 'text-accent' : 'text-muted'}>{b.is_active ? 'Active' : 'Inactive'}</span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      <button onClick={() => setActive(b, !b.is_active)} className="rounded-lg border border-border px-2 py-1 text-xs">
                        {b.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button onClick={() => remove(b)} className="rounded-lg border border-border px-2 py-1 text-xs text-danger">
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {banks.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-muted">
                    No bank accounts configured yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="rounded-xl border border-border bg-panel p-4">
          <h3 className="mb-3 text-sm font-semibold">Add a depositable bank</h3>
          <form onSubmit={submit} className="flex flex-col gap-2">
            <input
              required
              value={form.bankName}
              onChange={(e) => setForm({ ...form, bankName: e.target.value })}
              placeholder="Bank name"
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            />
            <input
              required
              value={form.accountHolder}
              onChange={(e) => setForm({ ...form, accountHolder: e.target.value })}
              placeholder="Account holder name"
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            />
            <input
              required
              value={form.accountNumber}
              onChange={(e) => setForm({ ...form, accountNumber: e.target.value })}
              placeholder="Account number"
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            />
            <input
              value={form.iban}
              onChange={(e) => setForm({ ...form, iban: e.target.value })}
              placeholder="IBAN (optional)"
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            />
            <input
              value={form.swiftCode}
              onChange={(e) => setForm({ ...form, swiftCode: e.target.value })}
              placeholder="SWIFT / BIC code (optional)"
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            />
            <input
              required
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })}
              placeholder="Currency (e.g. USDT)"
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            />
            <textarea
              value={form.instructions}
              onChange={(e) => setForm({ ...form, instructions: e.target.value })}
              placeholder="Instructions shown to users (optional)"
              rows={3}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            />
            {message && <p className={`text-xs ${message.kind === 'ok' ? 'text-accent' : 'text-danger'}`}>{message.text}</p>}
            <button type="submit" disabled={busy} className="mt-1 rounded-lg bg-accent py-2 text-sm font-semibold text-black disabled:opacity-60">
              {busy ? 'Adding…' : 'Add bank account'}
            </button>
          </form>
        </div>
      </div>
    </AdminShell>
  );
}
