'use client';

import { useEffect, useState } from 'react';
import AdminShell from '@/components/AdminShell';
import { api, ApiError } from '@/lib/api';

interface RegistrationConfig {
  asset_symbol: string;
  amount: string;
  is_active: boolean;
}

interface ReferralConfig {
  referrer_bonus_amount: string;
  referee_bonus_amount: string;
  asset_symbol: string;
  is_active: boolean;
}

interface Milestone {
  id: string;
  label: string;
  target_volume: string;
  bonus_amount: string;
  bonus_asset: string;
  is_repeatable: boolean;
  is_active: boolean;
}

interface Referral {
  id: string;
  referrer_email: string;
  referred_email: string;
  referrer_bonus_amount: string | null;
  referee_bonus_amount: string | null;
  asset_symbol: string | null;
  created_at: string;
}

function Notice({ message }: { message: { kind: 'ok' | 'error'; text: string } | null }) {
  if (!message) return null;
  return <p className={`text-xs ${message.kind === 'ok' ? 'text-accent' : 'text-danger'}`}>{message.text}</p>;
}

export default function AdminBonusesPage() {
  // Registration bonus
  const [regAsset, setRegAsset] = useState('USDT');
  const [regAmount, setRegAmount] = useState('');
  const [regActive, setRegActive] = useState(true);
  const [regMessage, setRegMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [regBusy, setRegBusy] = useState(false);

  // Referral program
  const [refAsset, setRefAsset] = useState('USDT');
  const [referrerAmount, setReferrerAmount] = useState('');
  const [refereeAmount, setRefereeAmount] = useState('');
  const [refActive, setRefActive] = useState(true);
  const [refMessage, setRefMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [refBusy, setRefBusy] = useState(false);
  const [referrals, setReferrals] = useState<Referral[]>([]);

  // Milestones
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [mLabel, setMLabel] = useState('');
  const [mTarget, setMTarget] = useState('');
  const [mBonus, setMBonus] = useState('');
  const [mAsset, setMAsset] = useState('USDT');
  const [mRepeatable, setMRepeatable] = useState(false);
  const [mMessage, setMMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [mBusy, setMBusy] = useState(false);

  function load() {
    api.get<{ config: RegistrationConfig | null }>('/api/admin/bonus/registration').then((res) => {
      if (res.config) {
        setRegAsset(res.config.asset_symbol);
        setRegAmount(res.config.amount);
        setRegActive(res.config.is_active);
      }
    });
    api.get<{ config: ReferralConfig | null }>('/api/admin/bonus/referral').then((res) => {
      if (res.config) {
        setRefAsset(res.config.asset_symbol);
        setReferrerAmount(res.config.referrer_bonus_amount);
        setRefereeAmount(res.config.referee_bonus_amount);
        setRefActive(res.config.is_active);
      }
    });
    api.get<{ referrals: Referral[] }>('/api/admin/bonus/referrals').then((res) => setReferrals(res.referrals.slice(0, 10)));
    api.get<{ milestones: Milestone[] }>('/api/admin/bonus/milestones').then((res) => setMilestones(res.milestones));
  }

  useEffect(load, []);

  async function saveRegistration(e: React.FormEvent) {
    e.preventDefault();
    setRegMessage(null);
    setRegBusy(true);
    try {
      await api.put('/api/admin/bonus/registration', { assetSymbol: regAsset, amount: parseFloat(regAmount), isActive: regActive });
      setRegMessage({ kind: 'ok', text: 'Registration bonus saved.' });
      load();
    } catch (err) {
      setRegMessage({ kind: 'error', text: err instanceof ApiError ? err.message : 'Failed to save' });
    } finally {
      setRegBusy(false);
    }
  }

  async function saveReferral(e: React.FormEvent) {
    e.preventDefault();
    setRefMessage(null);
    setRefBusy(true);
    try {
      await api.put('/api/admin/bonus/referral', {
        assetSymbol: refAsset,
        referrerBonusAmount: parseFloat(referrerAmount),
        refereeBonusAmount: parseFloat(refereeAmount),
        isActive: refActive,
      });
      setRefMessage({ kind: 'ok', text: 'Referral program saved.' });
      load();
    } catch (err) {
      setRefMessage({ kind: 'error', text: err instanceof ApiError ? err.message : 'Failed to save' });
    } finally {
      setRefBusy(false);
    }
  }

  async function addMilestone(e: React.FormEvent) {
    e.preventDefault();
    setMMessage(null);
    setMBusy(true);
    try {
      await api.post('/api/admin/bonus/milestones', {
        label: mLabel,
        targetVolume: parseFloat(mTarget),
        bonusAmount: parseFloat(mBonus),
        bonusAsset: mAsset,
        isRepeatable: mRepeatable,
      });
      setMMessage({ kind: 'ok', text: 'Milestone added.' });
      setMLabel('');
      setMTarget('');
      setMBonus('');
      load();
    } catch (err) {
      setMMessage({ kind: 'error', text: err instanceof ApiError ? err.message : 'Failed to add milestone' });
    } finally {
      setMBusy(false);
    }
  }

  async function toggleMilestone(m: Milestone) {
    await api.patch(`/api/admin/bonus/milestones/${m.id}`, { isActive: !m.is_active });
    load();
  }

  async function deleteMilestone(m: Milestone) {
    await api.del(`/api/admin/bonus/milestones/${m.id}`);
    load();
  }

  return (
    <AdminShell title="Bonuses">
      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-xl border border-border bg-panel p-4">
          <h3 className="mb-1 text-sm font-semibold">Registration Bonus</h3>
          <p className="mb-3 text-[11px] text-muted">Credited automatically the moment a new account is created.</p>
          <form onSubmit={saveRegistration} className="flex flex-col gap-2">
            <div className="flex gap-2">
              <input value={regAsset} onChange={(e) => setRegAsset(e.target.value.toUpperCase())} placeholder="Asset" className="w-24 rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
              <input required type="number" step="any" value={regAmount} onChange={(e) => setRegAmount(e.target.value)} placeholder="Amount" className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
            </div>
            <label className="flex items-center gap-2 text-xs text-muted">
              <input type="checkbox" checked={regActive} onChange={(e) => setRegActive(e.target.checked)} /> Active
            </label>
            <Notice message={regMessage} />
            <button type="submit" disabled={regBusy} className="mt-1 rounded-lg bg-accent py-2 text-sm font-semibold text-black disabled:opacity-60">
              {regBusy ? 'Saving…' : 'Save registration bonus'}
            </button>
          </form>
        </section>

        <section className="rounded-xl border border-border bg-panel p-4">
          <h3 className="mb-1 text-sm font-semibold">Referral Program</h3>
          <p className="mb-3 text-[11px] text-muted">Paid to both sides the moment a referred user registers with a valid code.</p>
          <form onSubmit={saveReferral} className="flex flex-col gap-2">
            <input value={refAsset} onChange={(e) => setRefAsset(e.target.value.toUpperCase())} placeholder="Asset" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
            <input required type="number" step="any" value={referrerAmount} onChange={(e) => setReferrerAmount(e.target.value)} placeholder="Bonus to the referrer" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
            <input required type="number" step="any" value={refereeAmount} onChange={(e) => setRefereeAmount(e.target.value)} placeholder="Bonus to the new user" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
            <label className="flex items-center gap-2 text-xs text-muted">
              <input type="checkbox" checked={refActive} onChange={(e) => setRefActive(e.target.checked)} /> Active
            </label>
            <Notice message={refMessage} />
            <button type="submit" disabled={refBusy} className="mt-1 rounded-lg bg-accent py-2 text-sm font-semibold text-black disabled:opacity-60">
              {refBusy ? 'Saving…' : 'Save referral program'}
            </button>
          </form>

          {referrals.length > 0 && (
            <div className="mt-4 border-t border-border pt-3">
              <p className="mb-2 text-[11px] font-semibold text-muted">Recent referrals</p>
              <div className="flex flex-col gap-1.5 text-xs">
                {referrals.map((r) => (
                  <div key={r.id} className="flex justify-between">
                    <span>
                      {r.referrer_email} → {r.referred_email}
                    </span>
                    <span className="text-muted">{new Date(r.created_at).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-border bg-panel p-4 md:col-span-2">
          <h3 className="mb-1 text-sm font-semibold">Trading Milestones</h3>
          <p className="mb-3 text-[11px] text-muted">
            Auto-credited once a user's cumulative trading volume (spot fills + short-term trade stakes) reaches the target.
            Repeatable milestones pay out again every time volume crosses another multiple of the target.
          </p>

          <div className="mb-4 overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-surface text-left text-muted">
                <tr>
                  <th className="px-3 py-2">Label</th>
                  <th className="px-3 py-2">Target volume</th>
                  <th className="px-3 py-2">Bonus</th>
                  <th className="px-3 py-2">Repeatable</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {milestones.map((m) => (
                  <tr key={m.id} className="border-t border-border">
                    <td className="px-3 py-2">{m.label}</td>
                    <td className="px-3 py-2 tabular-nums">{parseFloat(m.target_volume).toLocaleString()}</td>
                    <td className="px-3 py-2 tabular-nums">
                      {parseFloat(m.bonus_amount).toLocaleString()} {m.bonus_asset}
                    </td>
                    <td className="px-3 py-2">{m.is_repeatable ? 'Yes' : 'No'}</td>
                    <td className="px-3 py-2">
                      <span className={m.is_active ? 'text-accent' : 'text-muted'}>{m.is_active ? 'Active' : 'Inactive'}</span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-2">
                        <button onClick={() => toggleMilestone(m)} className="rounded-lg border border-border px-2 py-1 text-xs">
                          {m.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                        <button onClick={() => deleteMilestone(m)} className="rounded-lg border border-border px-2 py-1 text-xs text-danger">
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {milestones.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-muted">
                      No milestones configured yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <form onSubmit={addMilestone} className="grid gap-2 md:grid-cols-5">
            <input required value={mLabel} onChange={(e) => setMLabel(e.target.value)} placeholder="Label (e.g. Bronze Trader)" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm md:col-span-2" />
            <input required type="number" step="any" value={mTarget} onChange={(e) => setMTarget(e.target.value)} placeholder="Target volume (USDT)" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
            <input required type="number" step="any" value={mBonus} onChange={(e) => setMBonus(e.target.value)} placeholder="Bonus amount" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
            <input value={mAsset} onChange={(e) => setMAsset(e.target.value.toUpperCase())} placeholder="Asset" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
            <label className="flex items-center gap-2 text-xs text-muted md:col-span-4">
              <input type="checkbox" checked={mRepeatable} onChange={(e) => setMRepeatable(e.target.checked)} /> Repeatable (pays again every multiple of the target)
            </label>
            <button type="submit" disabled={mBusy} className="rounded-lg bg-accent py-2 text-sm font-semibold text-black disabled:opacity-60">
              {mBusy ? 'Adding…' : 'Add milestone'}
            </button>
            <Notice message={mMessage} />
          </form>
        </section>
      </div>
    </AdminShell>
  );
}
