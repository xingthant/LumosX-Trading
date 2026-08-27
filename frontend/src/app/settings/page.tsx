'use client';

import { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faWallet, faBuildingColumns, faTrash, faKey, faShieldHalved } from '@fortawesome/free-solid-svg-icons';
import MobileShell from '@/components/MobileShell';
import { api, ApiError } from '@/lib/api';

interface Me {
  has_withdrawal_password: boolean;
}

interface PaymentMethod {
  id: string;
  type: 'CRYPTO_WALLET' | 'BANK_ACCOUNT';
  label: string;
  asset_symbol: string | null;
  wallet_address: string | null;
  network: string | null;
  bank_name: string | null;
  account_holder: string | null;
  account_number: string | null;
  note: string | null;
}

const MAX_BANK_ACCOUNTS = 7;

function Notice({ message }: { message: { kind: 'ok' | 'error'; text: string } | null }) {
  if (!message) return null;
  return <p className={`text-sm ${message.kind === 'ok' ? 'text-accent' : 'text-danger'}`}>{message.text}</p>;
}

export default function SettingsPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);

  // Change login password
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pwMessage, setPwMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [pwBusy, setPwBusy] = useState(false);

  // Withdrawal password
  const [wCurrentPassword, setWCurrentPassword] = useState('');
  const [withdrawalPassword, setWithdrawalPassword] = useState('');
  const [wMessage, setWMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [wBusy, setWBusy] = useState(false);

  // New payment method
  const [methodType, setMethodType] = useState<'CRYPTO_WALLET' | 'BANK_ACCOUNT'>('CRYPTO_WALLET');
  const [label, setLabel] = useState('');
  const [assetSymbol, setAssetSymbol] = useState('USDT');
  const [walletAddress, setWalletAddress] = useState('');
  const [network, setNetwork] = useState('TRC20');
  const [bankName, setBankName] = useState('');
  const [accountHolder, setAccountHolder] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [iban, setIban] = useState('');
  const [swiftCode, setSwiftCode] = useState('');
  const [note, setNote] = useState('');
  const [methodMessage, setMethodMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [methodBusy, setMethodBusy] = useState(false);

  function load() {
    api.get<{ user: Me }>('/api/auth/me').then((res) => setMe(res.user)).catch(() => {});
    api.get<{ methods: PaymentMethod[] }>('/api/wallet/payment-methods').then((res) => setMethods(res.methods)).catch(() => {});
  }

  const bankAccountCount = methods.filter((m) => m.type === 'BANK_ACCOUNT').length;
  const bankAccountLimitReached = methodType === 'BANK_ACCOUNT' && bankAccountCount >= MAX_BANK_ACCOUNTS;

  useEffect(load, []);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwMessage(null);
    setPwBusy(true);
    try {
      await api.patch('/api/auth/password', { currentPassword, newPassword });
      setPwMessage({ kind: 'ok', text: 'Login password updated.' });
      setCurrentPassword('');
      setNewPassword('');
    } catch (err) {
      setPwMessage({ kind: 'error', text: err instanceof ApiError ? err.message : 'Failed to update password' });
    } finally {
      setPwBusy(false);
    }
  }

  async function setWithdrawalPw(e: React.FormEvent) {
    e.preventDefault();
    setWMessage(null);
    setWBusy(true);
    try {
      await api.post('/api/auth/withdrawal-password', { currentPassword: wCurrentPassword, withdrawalPassword });
      setWMessage({ kind: 'ok', text: 'Withdrawal password saved.' });
      setWCurrentPassword('');
      setWithdrawalPassword('');
      load();
    } catch (err) {
      setWMessage({ kind: 'error', text: err instanceof ApiError ? err.message : 'Failed to set withdrawal password' });
    } finally {
      setWBusy(false);
    }
  }

  async function addMethod(e: React.FormEvent) {
    e.preventDefault();
    setMethodMessage(null);
    setMethodBusy(true);
    try {
      await api.post('/api/wallet/payment-methods', {
        type: methodType,
        label,
        ...(methodType === 'CRYPTO_WALLET'
          ? { assetSymbol, walletAddress, network }
          : { bankName, accountHolder, accountNumber, iban: iban || undefined, swiftCode: swiftCode || undefined, note: note || undefined }),
      });
      setMethodMessage({ kind: 'ok', text: 'Payout method saved.' });
      setLabel('');
      setWalletAddress('');
      setBankName('');
      setAccountHolder('');
      setAccountNumber('');
      setIban('');
      setSwiftCode('');
      setNote('');
      load();
    } catch (err) {
      setMethodMessage({ kind: 'error', text: err instanceof ApiError ? err.message : 'Failed to save payout method' });
    } finally {
      setMethodBusy(false);
    }
  }

  async function removeMethod(id: string) {
    await api.del(`/api/wallet/payment-methods/${id}`);
    load();
  }

  return (
    <MobileShell title="Settings">
      <div className="flex flex-col gap-4">
        <section className="rounded-2xl border border-border bg-panel p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <FontAwesomeIcon icon={faKey} className="text-muted" /> Change Login Password
          </div>
          <form onSubmit={changePassword} className="flex flex-col gap-2">
            <input
              type="password"
              required
              placeholder="Current password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="rounded-xl border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-accent"
            />
            <input
              type="password"
              required
              minLength={8}
              placeholder="New password (min 8 characters)"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="rounded-xl border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-accent"
            />
            <Notice message={pwMessage} />
            <button type="submit" disabled={pwBusy} className="mt-1 rounded-xl bg-accent py-2.5 text-sm font-semibold text-black disabled:opacity-60">
              {pwBusy ? 'Updating…' : 'Update login password'}
            </button>
          </form>
        </section>

        <section className="rounded-2xl border border-border bg-panel p-4">
          <div className="mb-1 flex items-center gap-2 text-sm font-semibold">
            <FontAwesomeIcon icon={faShieldHalved} className="text-muted" /> Withdrawal Password
          </div>
          <p className="mb-3 text-[11px] text-muted">
            A separate password required to authorize withdrawals, kept apart from your login password.
            {me && (
              <span className={me.has_withdrawal_password ? 'ml-1 text-accent' : 'ml-1 text-amber-400'}>
                {me.has_withdrawal_password ? 'Currently set.' : 'Not set yet — required before you can withdraw.'}
              </span>
            )}
          </p>
          <form onSubmit={setWithdrawalPw} className="flex flex-col gap-2">
            <input
              type="password"
              required
              placeholder="Current login password"
              value={wCurrentPassword}
              onChange={(e) => setWCurrentPassword(e.target.value)}
              className="rounded-xl border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-accent"
            />
            <input
              type="password"
              required
              minLength={6}
              placeholder="New withdrawal password (min 6 characters)"
              value={withdrawalPassword}
              onChange={(e) => setWithdrawalPassword(e.target.value)}
              className="rounded-xl border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-accent"
            />
            <Notice message={wMessage} />
            <button type="submit" disabled={wBusy} className="mt-1 rounded-xl bg-accent py-2.5 text-sm font-semibold text-black disabled:opacity-60">
              {wBusy ? 'Saving…' : me?.has_withdrawal_password ? 'Update withdrawal password' : 'Set withdrawal password'}
            </button>
          </form>
        </section>

        <section className="rounded-2xl border border-border bg-panel p-4">
          <div className="mb-3 flex items-center justify-between text-sm font-semibold">
            <span>My Payout Methods</span>
            <span className="text-[11px] font-normal text-muted">
              {bankAccountCount}/{MAX_BANK_ACCOUNTS} bank accounts
            </span>
          </div>

          <div className="mb-3 flex flex-col gap-2">
            {methods.length === 0 && <p className="text-xs text-muted">No payout methods bound yet. Add one below to enable withdrawals.</p>}
            {methods.map((m) => (
              <div key={m.id} className="flex items-start justify-between rounded-xl border border-border bg-surface p-3 text-xs">
                <div className="flex items-start gap-2">
                  <FontAwesomeIcon icon={m.type === 'CRYPTO_WALLET' ? faWallet : faBuildingColumns} className="mt-0.5 text-muted" />
                  <div>
                    <div className="font-medium">{m.label}</div>
                    {m.type === 'CRYPTO_WALLET' ? (
                      <div className="text-muted">
                        {m.asset_symbol} · {m.network} · {m.wallet_address}
                      </div>
                    ) : (
                      <div className="text-muted">
                        {m.bank_name} · {m.account_holder} · {m.account_number}
                        {m.note && <div className="mt-0.5 italic text-muted/80">Note: {m.note}</div>}
                      </div>
                    )}
                  </div>
                </div>
                <button onClick={() => removeMethod(m.id)} className="text-danger">
                  <FontAwesomeIcon icon={faTrash} />
                </button>
              </div>
            ))}
          </div>

          <div className="mb-3 flex rounded-xl bg-surface p-1">
            <button
              type="button"
              onClick={() => setMethodType('CRYPTO_WALLET')}
              className={`flex-1 rounded-lg py-2 text-xs font-semibold ${methodType === 'CRYPTO_WALLET' ? 'bg-accent text-black' : 'text-muted'}`}
            >
              Crypto Wallet
            </button>
            <button
              type="button"
              onClick={() => setMethodType('BANK_ACCOUNT')}
              className={`flex-1 rounded-lg py-2 text-xs font-semibold ${methodType === 'BANK_ACCOUNT' ? 'bg-accent text-black' : 'text-muted'}`}
            >
              Bank Account
            </button>
          </div>

          <form onSubmit={addMethod} className="flex flex-col gap-2">
            <input
              required
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Label (e.g. My main USDT wallet)"
              className="rounded-xl border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-accent"
            />
            {methodType === 'CRYPTO_WALLET' ? (
              <>
                <div className="flex gap-2">
                  <input
                    required
                    value={assetSymbol}
                    onChange={(e) => setAssetSymbol(e.target.value.toUpperCase())}
                    placeholder="Asset (USDT)"
                    className="w-24 rounded-xl border border-border bg-surface px-3 py-3 text-sm outline-none focus:border-accent"
                  />
                  <input
                    required
                    value={network}
                    onChange={(e) => setNetwork(e.target.value.toUpperCase())}
                    placeholder="Network (TRC20)"
                    className="flex-1 rounded-xl border border-border bg-surface px-3 py-3 text-sm outline-none focus:border-accent"
                  />
                </div>
                <input
                  required
                  value={walletAddress}
                  onChange={(e) => setWalletAddress(e.target.value)}
                  placeholder="Wallet address"
                  className="rounded-xl border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-accent"
                />
              </>
            ) : (
              <>
                <input
                  required
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  placeholder="Bank name"
                  className="rounded-xl border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-accent"
                />
                <input
                  required
                  value={accountHolder}
                  onChange={(e) => setAccountHolder(e.target.value)}
                  placeholder="Account holder name"
                  className="rounded-xl border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-accent"
                />
                <input
                  required
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  placeholder="Account number"
                  className="rounded-xl border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-accent"
                />
                <input
                  value={iban}
                  onChange={(e) => setIban(e.target.value)}
                  placeholder="IBAN (optional)"
                  className="rounded-xl border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-accent"
                />
                <input
                  value={swiftCode}
                  onChange={(e) => setSwiftCode(e.target.value)}
                  placeholder="SWIFT / BIC (optional)"
                  className="rounded-xl border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-accent"
                />
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Note (optional) — e.g. only accept transfers from same-name accounts"
                  rows={2}
                  className="rounded-xl border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-accent"
                />
              </>
            )}
            {bankAccountLimitReached && (
              <p className="text-xs text-amber-400">
                You've reached the maximum of {MAX_BANK_ACCOUNTS} bank accounts — remove one to add another.
              </p>
            )}
            <Notice message={methodMessage} />
            <button
              type="submit"
              disabled={methodBusy || bankAccountLimitReached}
              className="mt-1 rounded-xl bg-accent py-2.5 text-sm font-semibold text-black disabled:opacity-60"
            >
              {methodBusy ? 'Saving…' : 'Add payout method'}
            </button>
          </form>
        </section>
      </div>
    </MobileShell>
  );
}
