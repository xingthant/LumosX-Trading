'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import MobileShell from '@/components/MobileShell';
import { api, ApiError } from '@/lib/api';

interface Balance {
  asset_symbol: string;
  available_balance: string;
  locked_balance: string;
}

interface Transaction {
  id: string;
  type: string;
  asset_symbol: string;
  amount: string;
  status: string;
  created_at: string;
  payment_method_label: string | null;
}

interface DepositBank {
  id: string;
  bank_name: string;
  account_holder: string;
  account_number: string;
  iban: string | null;
  swift_code: string | null;
  currency: string;
  instructions: string | null;
}

interface PaymentMethod {
  id: string;
  type: 'CRYPTO_WALLET' | 'BANK_ACCOUNT';
  label: string;
  asset_symbol: string | null;
}

const STATUS_COLOR: Record<string, string> = {
  PENDING: 'text-amber-400',
  COMPLETED: 'text-accent',
  APPROVED: 'text-accent',
  REJECTED: 'text-danger',
};

export default function WalletPage() {
  return (
    <Suspense fallback={null}>
      <WalletPageInner />
    </Suspense>
  );
}

function WalletPageInner() {
  const searchParams = useSearchParams();
  const initialMode = searchParams.get('mode') === 'withdraw' ? 'withdraw' : 'deposit';
  const [balances, setBalances] = useState<Balance[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [banks, setBanks] = useState<DepositBank[]>([]);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [mode, setMode] = useState<'deposit' | 'withdraw'>(initialMode);
  const [asset, setAsset] = useState('USDT');
  const [amount, setAmount] = useState('');
  const [paymentMethodId, setPaymentMethodId] = useState('');
  const [withdrawalPassword, setWithdrawalPassword] = useState('');
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  function load() {
    api.get<{ balances: Balance[] }>('/api/wallet/balances').then((res) => setBalances(res.balances)).catch(() => {});
    api.get<{ transactions: Transaction[] }>('/api/wallet/transactions').then((res) => setTransactions(res.transactions)).catch(() => {});
    api.get<{ banks: DepositBank[] }>('/api/wallet/deposit-banks').then((res) => setBanks(res.banks)).catch(() => {});
    api.get<{ methods: PaymentMethod[] }>('/api/wallet/payment-methods').then((res) => {
      setMethods(res.methods);
      if (res.methods.length && !paymentMethodId) setPaymentMethodId(res.methods[0].id);
    });
  }

  function copy(text: string, key: string) {
    navigator.clipboard?.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  }

  useEffect(load, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setBusy(true);
    try {
      if (mode === 'deposit') {
        await api.post('/api/wallet/deposit', { assetSymbol: asset, amount: parseFloat(amount) });
      } else {
        await api.post('/api/wallet/withdraw', {
          assetSymbol: asset,
          amount: parseFloat(amount),
          paymentMethodId,
          withdrawalPassword,
        });
      }
      setMessage({ kind: 'ok', text: `${mode === 'deposit' ? 'Deposit' : 'Withdrawal'} request submitted for admin review.` });
      setAmount('');
      setWithdrawalPassword('');
      load();
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof ApiError ? err.message : 'Request failed' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <MobileShell title="Wallet">
      <div className="mb-4 flex flex-col gap-2">
        {balances.length === 0 && <p className="text-sm text-muted">No balances yet.</p>}
        {balances.map((b) => (
          <div key={b.asset_symbol} className="flex items-center justify-between rounded-xl border border-border bg-panel p-3 shadow-card">
            <span className="font-medium">{b.asset_symbol}</span>
            <div className="text-right">
              <div className="font-semibold tabular-nums">{parseFloat(b.available_balance).toLocaleString()}</div>
              {parseFloat(b.locked_balance) > 0 && (
                <div className="text-[11px] text-muted">{parseFloat(b.locked_balance).toLocaleString()} locked</div>
              )}
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={submit} className="mb-4 rounded-2xl border border-border bg-panel p-4">
        <div className="mb-3 flex rounded-xl bg-surface p-1">
          <button type="button" onClick={() => setMode('deposit')} className={`flex-1 rounded-lg py-2 text-sm font-semibold ${mode === 'deposit' ? 'bg-accent text-black' : 'text-muted'}`}>
            Deposit
          </button>
          <button type="button" onClick={() => setMode('withdraw')} className={`flex-1 rounded-lg py-2 text-sm font-semibold ${mode === 'withdraw' ? 'bg-accent text-black' : 'text-muted'}`}>
            Withdraw
          </button>
        </div>

        {mode === 'deposit' && (
          <div className="mb-3 flex flex-col gap-2">
            {banks.length === 0 && (
              <p className="rounded-lg border border-border bg-surface px-3 py-2 text-xs text-muted">
                No deposit bank accounts have been configured yet. Contact support before sending funds.
              </p>
            )}
            {banks.map((bank) => (
              <div key={bank.id} className="rounded-xl border border-border bg-surface p-3 text-xs">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-sm font-semibold">{bank.bank_name}</span>
                  <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold text-accent">{bank.currency}</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-muted">Account holder</span>
                  <span>{bank.account_holder}</span>
                </div>
                <button
                  type="button"
                  onClick={() => copy(bank.account_number, bank.id + '-acc')}
                  className="flex w-full justify-between py-0.5 text-left"
                >
                  <span className="text-muted">Account number</span>
                  <span>{copied === bank.id + '-acc' ? 'Copied!' : bank.account_number}</span>
                </button>
                {bank.iban && (
                  <div className="flex justify-between py-0.5">
                    <span className="text-muted">IBAN</span>
                    <span>{bank.iban}</span>
                  </div>
                )}
                {bank.swift_code && (
                  <div className="flex justify-between py-0.5">
                    <span className="text-muted">SWIFT/BIC</span>
                    <span>{bank.swift_code}</span>
                  </div>
                )}
                {bank.instructions && <p className="mt-1.5 border-t border-border pt-1.5 text-muted">{bank.instructions}</p>}
              </div>
            ))}
            <p className="text-[11px] text-muted">
              Send funds to one of the accounts above, then submit a deposit request below so an admin can confirm and credit it.
            </p>
          </div>
        )}

        {mode === 'withdraw' && methods.length === 0 && (
          <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
            You need to bind a payout method (crypto wallet or bank account) before withdrawing.{' '}
            <Link href="/settings" className="underline underline-offset-2">
              Add one in Settings
            </Link>
            .
          </div>
        )}

        {mode === 'withdraw' && methods.length > 0 && (
          <select
            value={paymentMethodId}
            onChange={(e) => setPaymentMethodId(e.target.value)}
            className="mb-2 w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-accent"
          >
            {methods.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} ({m.type === 'CRYPTO_WALLET' ? m.asset_symbol : 'Bank'})
              </option>
            ))}
          </select>
        )}

        <div className="mb-2 flex gap-2">
          <input
            value={asset}
            onChange={(e) => setAsset(e.target.value.toUpperCase())}
            placeholder="Asset (e.g. USDT)"
            className="w-28 rounded-xl border border-border bg-surface px-3 py-3 text-sm outline-none focus:border-accent"
          />
          <input
            type="number"
            step="any"
            required
            placeholder="Amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="flex-1 rounded-xl border border-border bg-surface px-4 py-3 text-base outline-none focus:border-accent"
          />
        </div>

        {mode === 'withdraw' && methods.length > 0 && (
          <input
            type="password"
            required
            placeholder="Withdrawal password"
            value={withdrawalPassword}
            onChange={(e) => setWithdrawalPassword(e.target.value)}
            className="mb-2 w-full rounded-xl border border-border bg-surface px-4 py-3 text-base outline-none focus:border-accent"
          />
        )}

        {message && <p className={`mb-2 text-sm ${message.kind === 'ok' ? 'text-accent' : 'text-danger'}`}>{message.text}</p>}

        <button
          type="submit"
          disabled={busy || (mode === 'withdraw' && methods.length === 0)}
          className="w-full rounded-xl bg-accent py-3 text-base font-semibold text-black disabled:opacity-60"
        >
          {busy ? 'Submitting…' : `Request ${mode === 'deposit' ? 'deposit' : 'withdrawal'}`}
        </button>
        <p className="mt-2 text-[11px] text-muted">All deposit and withdrawal requests require admin approval.</p>
      </form>

      <h2 className="mb-2 text-sm font-semibold text-muted">Recent activity</h2>
      <div className="flex flex-col gap-2">
        {transactions.map((t) => (
          <div key={t.id} className="flex items-center justify-between rounded-xl border border-border bg-panel p-3 text-sm">
            <div>
              <div className="font-medium">
                {t.type} · {t.asset_symbol}
              </div>
              <div className="text-[11px] text-muted">
                {new Date(t.created_at).toLocaleString()}
                {t.payment_method_label && ` · ${t.payment_method_label}`}
              </div>
            </div>
            <div className="text-right">
              <div className="tabular-nums">{parseFloat(t.amount).toLocaleString()}</div>
              <div className={`text-[11px] font-medium ${STATUS_COLOR[t.status] || 'text-muted'}`}>{t.status}</div>
            </div>
          </div>
        ))}
      </div>
    </MobileShell>
  );
}
