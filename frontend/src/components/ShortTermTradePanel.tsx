'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowTrendUp, faArrowTrendDown, faTrophy, faCircleXmark, faRotateLeft, faXmark } from '@fortawesome/free-solid-svg-icons';
import { api, ApiError } from '@/lib/api';
import { getSocket } from '@/lib/socket';

interface Duration {
  id: string;
  label: string;
  seconds: number;
  payout_multiplier: string;
}

interface Trade {
  id: string;
  pair: string;
  direction: 'UP' | 'DOWN';
  duration_label: string;
  stake_amount: string;
  payout_multiplier: string;
  entry_price: string;
  settlement_price: string | null;
  outcome: 'PENDING' | 'WIN' | 'LOSE' | 'PUSH';
  payout_amount: string | null;
  created_at: string;
  expiry_at: string;
}

const OUTCOME_STYLE: Record<Trade['outcome'], string> = {
  PENDING: 'text-amber-400',
  WIN: 'text-accent',
  LOSE: 'text-danger',
  PUSH: 'text-muted',
};

interface SettledPayload {
  tradeId: string;
  pair: string;
  outcome: 'WIN' | 'LOSE' | 'PUSH';
  settlementPrice: number;
  payoutAmount: number;
}

const RESULT_POPUP_MS = 6000;

export default function ShortTermTradePanel({ pair, onSettled }: { pair: string; onSettled?: () => void }) {
  const [durations, setDurations] = useState<Duration[]>([]);
  const [durationId, setDurationId] = useState('');
  const [direction, setDirection] = useState<'UP' | 'DOWN'>('UP');
  const [stake, setStake] = useState('10');
  const [trades, setTrades] = useState<Trade[]>([]);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [result, setResult] = useState<{ trade: Trade | null; payload: SettledPayload } | null>(null);
  const tradesRef = useRef<Trade[]>([]);

  useEffect(() => {
    tradesRef.current = trades;
  }, [trades]);

  useEffect(() => {
    api.get<{ durations: Duration[] }>('/api/market/trade-durations').then((res) => {
      setDurations(res.durations);
      if (res.durations.length) setDurationId(res.durations[0].id);
    });
    loadTrades();

    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    const socket = getSocket();
    const onSettledEvent = (payload: SettledPayload) => {
      const trade = tradesRef.current.find((t) => t.id === payload.tradeId) ?? null;
      setResult({ trade, payload });
      loadTrades();
      onSettled?.();
    };
    socket.on('trade:settled', onSettledEvent);
    return () => {
      window.clearInterval(tick);
      socket.off('trade:settled', onSettledEvent);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!result) return;
    const timer = window.setTimeout(() => setResult(null), RESULT_POPUP_MS);
    return () => window.clearTimeout(timer);
  }, [result]);

  function loadTrades() {
    api.get<{ trades: Trade[] }>('/api/trades/short-term').then((res) => setTrades(res.trades.slice(0, 8))).catch(() => {});
  }

  const selectedDuration = durations.find((d) => d.id === durationId);

  async function placeTrade() {
    setMessage(null);
    if (!durationId) return;
    setBusy(true);
    try {
      await api.post('/api/trades/short-term', { pair, direction, durationId, stakeAmount: parseFloat(stake) });
      setMessage({ kind: 'ok', text: `${direction} trade placed on ${pair}.` });
      loadTrades();
      onSettled?.();
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof ApiError ? err.message : 'Failed to place trade' });
    } finally {
      setBusy(false);
    }
  }

  function countdown(expiryAt: string) {
    const remainingMs = new Date(expiryAt).getTime() - now;
    if (remainingMs <= 0) return 'settling…';
    const totalSeconds = Math.ceil(remainingMs / 1000);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  }

  const potentialPayout = useMemo(() => {
    const stakeNum = parseFloat(stake);
    if (!selectedDuration || Number.isNaN(stakeNum)) return null;
    return stakeNum * parseFloat(selectedDuration.payout_multiplier);
  }, [stake, selectedDuration]);

  return (
    <>
    <div className="rounded-2xl border border-border bg-panel p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Short-Term Trade</h3>
        <span className="text-[11px] text-muted">Predict the price in a fixed window</span>
      </div>

      <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
        {durations.map((d) => (
          <button
            key={d.id}
            onClick={() => setDurationId(d.id)}
            className={`whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-[11px] font-medium ${
              d.id === durationId ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted'
            }`}
          >
            {d.label}
            <span className="ml-1 opacity-70">{parseFloat(d.payout_multiplier).toFixed(2)}x</span>
          </button>
        ))}
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2">
        <button
          onClick={() => setDirection('UP')}
          className={`flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold ${
            direction === 'UP' ? 'bg-accent text-black' : 'border border-border text-muted'
          }`}
        >
          <FontAwesomeIcon icon={faArrowTrendUp} /> Up / Bull
        </button>
        <button
          onClick={() => setDirection('DOWN')}
          className={`flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold ${
            direction === 'DOWN' ? 'bg-danger text-white' : 'border border-border text-muted'
          }`}
        >
          <FontAwesomeIcon icon={faArrowTrendDown} /> Down / Bear
        </button>
      </div>

      <input
        type="number"
        step="any"
        min={1}
        value={stake}
        onChange={(e) => setStake(e.target.value)}
        placeholder="Stake amount (USDT)"
        className="mb-2 w-full rounded-xl border border-border bg-surface px-4 py-3 text-base outline-none focus:border-accent"
      />

      {potentialPayout !== null && (
        <p className="mb-2 text-[11px] text-muted">
          Potential payout: <span className="font-semibold text-accent">{potentialPayout.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDT</span>
        </p>
      )}

      {message && <p className={`mb-2 text-sm ${message.kind === 'ok' ? 'text-accent' : 'text-danger'}`}>{message.text}</p>}

      <button
        onClick={placeTrade}
        disabled={busy || !durationId}
        className={`w-full rounded-xl py-3 text-base font-semibold disabled:opacity-60 ${direction === 'UP' ? 'bg-accent text-black' : 'bg-danger text-white'}`}
      >
        {busy ? 'Placing…' : `Trade ${direction === 'UP' ? 'Up' : 'Down'}`}
      </button>

      {trades.length > 0 && (
        <div className="mt-4 flex flex-col gap-1.5 border-t border-border pt-3">
          {trades.map((t) => (
            <div key={t.id} className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5">
                <FontAwesomeIcon icon={t.direction === 'UP' ? faArrowTrendUp : faArrowTrendDown} className={t.direction === 'UP' ? 'text-accent' : 'text-danger'} />
                {t.pair} · {t.duration_label} · {parseFloat(t.stake_amount).toLocaleString()} USDT
              </span>
              <span className={`font-semibold ${OUTCOME_STYLE[t.outcome]}`}>
                {t.outcome === 'PENDING' ? countdown(t.expiry_at) : t.outcome}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>

    {result && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm"
        onClick={() => setResult(null)}
      >
        <div
          className={`relative w-full max-w-xs animate-pop rounded-2xl border p-6 text-center shadow-card ${
            result.payload.outcome === 'WIN'
              ? 'border-accent/40 bg-gradient-to-b from-accent/15 to-panel'
              : result.payload.outcome === 'LOSE'
              ? 'border-danger/40 bg-gradient-to-b from-danger/15 to-panel'
              : 'border-border bg-panel'
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => setResult(null)}
            className="absolute right-3 top-3 text-muted hover:text-white"
            aria-label="Close"
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>

          <div
            className={`mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full text-2xl ${
              result.payload.outcome === 'WIN'
                ? 'bg-accent/15 text-accent'
                : result.payload.outcome === 'LOSE'
                ? 'bg-danger/15 text-danger'
                : 'bg-white/5 text-muted'
            }`}
          >
            <FontAwesomeIcon
              icon={result.payload.outcome === 'WIN' ? faTrophy : result.payload.outcome === 'LOSE' ? faCircleXmark : faRotateLeft}
            />
          </div>

          <h3
            className={`text-lg font-bold ${
              result.payload.outcome === 'WIN' ? 'text-accent' : result.payload.outcome === 'LOSE' ? 'text-danger' : 'text-white'
            }`}
          >
            {result.payload.outcome === 'WIN' ? 'You Won!' : result.payload.outcome === 'LOSE' ? 'You Lost' : 'Push — Stake Returned'}
          </h3>

          <p className="mt-1 text-xs text-muted">
            {result.payload.pair}
            {result.trade && (
              <>
                {' '}
                · {result.trade.direction === 'UP' ? 'Up / Bull' : 'Down / Bear'} · {result.trade.duration_label}
              </>
            )}
          </p>

          <div className="mt-4 rounded-xl border border-border bg-surface/60 p-3">
            {result.payload.outcome === 'WIN' && (
              <div className="text-2xl font-bold tabular-nums text-accent">
                +{result.payload.payoutAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDT
              </div>
            )}
            {result.payload.outcome === 'LOSE' && result.trade && (
              <div className="text-2xl font-bold tabular-nums text-danger">
                -{parseFloat(result.trade.stake_amount).toLocaleString(undefined, { maximumFractionDigits: 2 })} USDT
              </div>
            )}
            {result.payload.outcome === 'PUSH' && result.trade && (
              <div className="text-2xl font-bold tabular-nums text-white">
                {parseFloat(result.trade.stake_amount).toLocaleString(undefined, { maximumFractionDigits: 2 })} USDT
              </div>
            )}
            {result.trade && (
              <div className="mt-1.5 flex justify-center gap-3 text-[11px] text-muted">
                <span>Entry {parseFloat(result.trade.entry_price).toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>
                <span>→</span>
                <span>Settled {result.payload.settlementPrice.toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>
              </div>
            )}
          </div>

          <button
            onClick={() => setResult(null)}
            className={`mt-4 w-full rounded-xl py-2.5 text-sm font-semibold ${
              result.payload.outcome === 'WIN' ? 'bg-accent text-black' : result.payload.outcome === 'LOSE' ? 'bg-danger text-white' : 'bg-white/10 text-white'
            }`}
          >
            Continue
          </button>
        </div>
      </div>
    )}
    </>
  );
}
