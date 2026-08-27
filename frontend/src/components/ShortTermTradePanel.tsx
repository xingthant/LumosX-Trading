'use client';

import { useEffect, useMemo, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowTrendUp, faArrowTrendDown } from '@fortawesome/free-solid-svg-icons';
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

export default function ShortTermTradePanel({ pair, onSettled }: { pair: string; onSettled?: () => void }) {
  const [durations, setDurations] = useState<Duration[]>([]);
  const [durationId, setDurationId] = useState('');
  const [direction, setDirection] = useState<'UP' | 'DOWN'>('UP');
  const [stake, setStake] = useState('10');
  const [trades, setTrades] = useState<Trade[]>([]);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    api.get<{ durations: Duration[] }>('/api/market/trade-durations').then((res) => {
      setDurations(res.durations);
      if (res.durations.length) setDurationId(res.durations[0].id);
    });
    loadTrades();

    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    const socket = getSocket();
    const onSettledEvent = () => {
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
  );
}
