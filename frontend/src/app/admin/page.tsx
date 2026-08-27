'use client';

import { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCoins, faKey, faShieldHalved, faSnowflake, faSun, faTrash } from '@fortawesome/free-solid-svg-icons';
import AdminShell from '@/components/AdminShell';
import { api, ApiError } from '@/lib/api';

interface UserBalance {
  asset: string;
  available: string;
  locked: string;
}

interface AdminUser {
  id: string;
  email: string;
  role: string;
  is_merchant: boolean;
  is_frozen: boolean;
  created_at: string;
  balances: UserBalance[];
}

type PanelMode = 'adjust' | 'create' | 'password' | 'withdrawal-password';

function Notice({ message }: { message: { kind: 'ok' | 'error'; text: string } | null }) {
  if (!message) return null;
  return <p className={`text-xs ${message.kind === 'ok' ? 'text-accent' : 'text-danger'}`}>{message.text}</p>;
}

function IconButton({
  title,
  icon,
  onClick,
  tone = 'default',
}: {
  title: string;
  icon: any;
  onClick: () => void;
  tone?: 'default' | 'warn' | 'danger' | 'active';
}) {
  const toneClasses =
    tone === 'danger'
      ? 'border-danger/40 text-danger hover:bg-danger/10'
      : tone === 'warn'
        ? 'border-amber-500/40 text-amber-400 hover:bg-amber-500/10'
        : tone === 'active'
          ? 'border-accent/50 text-accent hover:bg-accent/10'
          : 'border-border text-muted hover:border-accent hover:text-accent';

  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-sm transition-colors ${toneClasses}`}
    >
      <FontAwesomeIcon icon={icon} />
    </button>
  );
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [panel, setPanel] = useState<PanelMode>('adjust');
  const [listMessage, setListMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  // Balance adjustment form
  const [asset, setAsset] = useState('USDT');
  const [amount, setAmount] = useState('');
  const [direction, setDirection] = useState<'CREDIT' | 'DEBIT'>('CREDIT');
  const [reason, setReason] = useState('');

  // Create user form
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'USER' | 'ADMIN'>('USER');

  // Password reset forms
  const [resetPassword, setResetPassword] = useState('');
  const [resetWithdrawalPassword, setResetWithdrawalPassword] = useState('');

  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  function load(q = search) {
    const query = q ? `?search=${encodeURIComponent(q)}` : '';
    api.get<{ users: AdminUser[] }>(`/api/admin/users${query}`).then((res) => setUsers(res.users)).catch(() => {});
  }

  useEffect(() => {
    const timer = setTimeout(() => load(search), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  function selectUser(u: AdminUser, mode: PanelMode) {
    setSelected(u);
    setPanel(mode);
    setMessage(null);
    setListMessage(null);
  }

  async function adjust(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setMessage(null);
    setBusy(true);
    try {
      await api.post('/api/admin/balances/adjust', {
        userId: selected.id,
        assetSymbol: asset,
        amount: parseFloat(amount),
        direction,
        reason: reason || undefined,
      });
      setMessage({ kind: 'ok', text: 'Balance adjusted.' });
      setAmount('');
      setReason('');
      load();
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof ApiError ? err.message : 'Adjustment failed' });
    } finally {
      setBusy(false);
    }
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setBusy(true);
    try {
      await api.post('/api/admin/users', { email: newEmail, password: newPassword, role: newRole });
      setMessage({ kind: 'ok', text: 'User created.' });
      setNewEmail('');
      setNewPassword('');
      load();
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof ApiError ? err.message : 'Failed to create user' });
    } finally {
      setBusy(false);
    }
  }

  async function submitResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setMessage(null);
    setBusy(true);
    try {
      await api.post(`/api/admin/users/${selected.id}/reset-password`, { newPassword: resetPassword });
      setMessage({ kind: 'ok', text: `Login password updated for ${selected.email}.` });
      setResetPassword('');
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof ApiError ? err.message : 'Failed to reset password' });
    } finally {
      setBusy(false);
    }
  }

  async function submitResetWithdrawalPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setMessage(null);
    setBusy(true);
    try {
      await api.post(`/api/admin/users/${selected.id}/reset-withdrawal-password`, { newWithdrawalPassword: resetWithdrawalPassword });
      setMessage({ kind: 'ok', text: `Withdrawal password updated for ${selected.email}.` });
      setResetWithdrawalPassword('');
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof ApiError ? err.message : 'Failed to reset withdrawal password' });
    } finally {
      setBusy(false);
    }
  }

  async function toggleFrozen(u: AdminUser) {
    setListMessage(null);
    try {
      await api.patch(`/api/admin/users/${u.id}/status`, { isFrozen: !u.is_frozen });
      setListMessage({ kind: 'ok', text: `${u.email} ${u.is_frozen ? 'unfrozen' : 'frozen'}.` });
      load();
    } catch (err) {
      setListMessage({ kind: 'error', text: err instanceof ApiError ? err.message : 'Failed to update account status' });
    }
  }

  async function deleteUser(u: AdminUser) {
    setListMessage(null);
    try {
      await api.del(`/api/admin/users/${u.id}`);
      setListMessage({ kind: 'ok', text: `${u.email} deleted.` });
      load();
    } catch (err) {
      setListMessage({ kind: 'error', text: err instanceof ApiError ? err.message : 'Failed to delete user' });
    }
  }

  return (
    <AdminShell title="Users & Balances">
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by email…"
        className="mb-3 w-full max-w-sm rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
      />

      {listMessage && (
        <p className={`mb-3 text-sm ${listMessage.kind === 'ok' ? 'text-accent' : 'text-danger'}`}>{listMessage.text}</p>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="overflow-x-auto rounded-xl border border-border shadow-card lg:col-span-2">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-panel text-left text-muted">
              <tr>
                <th className="sticky left-0 z-10 whitespace-nowrap bg-panel px-3 py-2.5">Email</th>
                <th className="whitespace-nowrap px-3 py-2.5">Role</th>
                <th className="whitespace-nowrap px-3 py-2.5">Status</th>
                <th className="whitespace-nowrap px-3 py-2.5">Balances</th>
                <th className="whitespace-nowrap px-3 py-2.5">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="group border-t border-border transition-colors hover:bg-panel2">
                  <td className="sticky left-0 z-10 whitespace-nowrap bg-panel px-3 py-2.5 transition-colors group-hover:bg-panel2">
                    {u.email}
                    {u.is_merchant && <span className="ml-1.5 rounded bg-accent/15 px-1.5 py-0.5 text-[10px] text-accent">Merchant</span>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">{u.role}</td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <span className={u.is_frozen ? 'text-danger' : 'text-accent'}>{u.is_frozen ? 'Frozen' : 'Active'}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    {u.balances.length === 0
                      ? '—'
                      : u.balances.map((b) => `${b.asset}: ${parseFloat(b.available).toLocaleString()}`).join(', ')}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <div className="flex flex-nowrap gap-1.5">
                      <IconButton title="Adjust balance" icon={faCoins} onClick={() => selectUser(u, 'adjust')} />
                      <IconButton title="Reset login password" icon={faKey} onClick={() => selectUser(u, 'password')} />
                      <IconButton title="Reset withdrawal password" icon={faShieldHalved} onClick={() => selectUser(u, 'withdrawal-password')} />
                      <IconButton
                        title={u.is_frozen ? 'Unfreeze account' : 'Freeze account'}
                        icon={u.is_frozen ? faSun : faSnowflake}
                        tone={u.is_frozen ? 'active' : 'warn'}
                        onClick={() => toggleFrozen(u)}
                      />
                      <IconButton title="Delete user" icon={faTrash} tone="danger" onClick={() => deleteUser(u)} />
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-muted">
                    No users match.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="h-fit rounded-xl border border-border bg-panel p-4 shadow-card lg:sticky lg:top-20">
          <div className="mb-3 flex gap-1 overflow-x-auto text-xs">
            <button onClick={() => setPanel('create')} className={`rounded-lg px-2 py-1 ${panel === 'create' ? 'bg-accent text-black' : 'border border-border text-muted'}`}>
              + New user
            </button>
          </div>

          {panel === 'create' ? (
            <form onSubmit={createUser} className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold">Create a user</h3>
              <input required type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="Email" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
              <input required type="password" minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Password (min 8 chars)" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
              <select value={newRole} onChange={(e) => setNewRole(e.target.value as 'USER' | 'ADMIN')} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm">
                <option value="USER">USER</option>
                <option value="ADMIN">ADMIN</option>
              </select>
              <Notice message={message} />
              <button type="submit" disabled={busy} className="mt-1 rounded-lg bg-accent py-2 text-sm font-semibold text-black disabled:opacity-60">
                {busy ? 'Creating…' : 'Create user'}
              </button>
            </form>
          ) : !selected ? (
            <p className="text-sm text-muted">Select a user's icon actions to manage them.</p>
          ) : panel === 'adjust' ? (
            <form onSubmit={adjust} className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold">Direct balance adjustment</h3>
              <p className="text-xs text-muted">
                Target: <span className="text-white">{selected.email}</span>
              </p>
              <div className="flex rounded-xl bg-surface p-1">
                <button type="button" onClick={() => setDirection('CREDIT')} className={`flex-1 rounded-lg py-1.5 text-xs font-semibold ${direction === 'CREDIT' ? 'bg-accent text-black' : 'text-muted'}`}>
                  Credit
                </button>
                <button type="button" onClick={() => setDirection('DEBIT')} className={`flex-1 rounded-lg py-1.5 text-xs font-semibold ${direction === 'DEBIT' ? 'bg-danger text-white' : 'text-muted'}`}>
                  Debit
                </button>
              </div>
              <input value={asset} onChange={(e) => setAsset(e.target.value.toUpperCase())} placeholder="Asset" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
              <input type="number" step="any" required value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional)" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
              <Notice message={message} />
              <button type="submit" disabled={busy} className="mt-1 rounded-lg bg-accent py-2 text-sm font-semibold text-black disabled:opacity-60">
                {busy ? 'Applying…' : 'Apply adjustment'}
              </button>
            </form>
          ) : panel === 'password' ? (
            <form onSubmit={submitResetPassword} className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold">Reset login password</h3>
              <p className="text-xs text-muted">
                Target: <span className="text-white">{selected.email}</span>
              </p>
              <input required type="password" minLength={8} value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} placeholder="New login password" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
              <Notice message={message} />
              <button type="submit" disabled={busy} className="mt-1 rounded-lg bg-accent py-2 text-sm font-semibold text-black disabled:opacity-60">
                {busy ? 'Updating…' : 'Set new password'}
              </button>
            </form>
          ) : (
            <form onSubmit={submitResetWithdrawalPassword} className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold">Reset withdrawal password</h3>
              <p className="text-xs text-muted">
                Target: <span className="text-white">{selected.email}</span>
              </p>
              <input required type="password" minLength={6} value={resetWithdrawalPassword} onChange={(e) => setResetWithdrawalPassword(e.target.value)} placeholder="New withdrawal password" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
              <Notice message={message} />
              <button type="submit" disabled={busy} className="mt-1 rounded-lg bg-accent py-2 text-sm font-semibold text-black disabled:opacity-60">
                {busy ? 'Updating…' : 'Set new withdrawal password'}
              </button>
            </form>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
