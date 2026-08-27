'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowTrendUp, faArrowTrendDown } from '@fortawesome/free-solid-svg-icons';
import MobileShell from '@/components/MobileShell';
import { useAuth } from '@/lib/AuthContext';
import { api, ApiError } from '@/lib/api';
import { getSocket } from '@/lib/socket';

interface Order {
  id: string;
  pair: string;
  type: 'MARKET' | 'LIMIT';
  side: 'BUY' | 'SELL';
  price: string | null;
  amount: string;
  filled_amount: string;
  status: string;
  created_at: string;
}

interface ShortTermTrade {
  id: string;
  pair: string;
  direction: 'UP' | 'DOWN';
  duration_label: string;
  stake_amount: string;
  entry_price: string;
  settlement_price: string | null;
  outcome: 'PENDING' | 'WIN' | 'LOSE' | 'PUSH';
  payout_amount: string | null;
  created_at: string;
  expiry_at: string;
}

interface P2POrder {
  id: string;
  merchant_id: string;
  taker_id: string;
  merchant_email: string;
  taker_email: string;
  ad_side: 'BUY' | 'SELL';
  asset_symbol: string;
  fiat_symbol: string;
  amount: string;
  total_fiat: string;
  status: 'PENDING_PAYMENT' | 'PAID' | 'COMPLETED' | 'CANCELLED' | 'DISPUTED';
  created_at: string;
}

const STATUS_COLOR: Record<string, string> = {
  OPEN: 'text-amber-400',
  PARTIALLY_FILLED: 'text-amber-400',
  FILLED: 'text-accent',
  CANCELED: 'text-muted',
  PENDING: 'text-amber-400',
  WIN: 'text-accent',
  LOSE: 'text-danger',
  PUSH: 'text-muted',
  PENDING_PAYMENT: 'text-amber-400',
  PAID: 'text-accent',
  COMPLETED: 'text-accent',
  CANCELLED: 'text-muted',
  DISPUTED: 'text-danger',
};

const P2P_STATUS_LABEL: Record<P2POrder['status'], string> = {
  PENDING_PAYMENT: 'Awaiting payment',
  PAID: 'Paid',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  DISPUTED: 'Disputed',
};

const P2P_FILTERS = ['ALL', 'PENDING_PAYMENT', 'PAID', 'COMPLETED', 'CANCELLED', 'DISPUTED'] as const;

export default function OrdersPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<'SPOT' | 'SHORT_TERM' | 'P2P'>('SPOT');
  const [orders, setOrders] = useState<Order[]>([]);
  const [trades, setTrades] = useState<ShortTermTrade[]>([]);
  const [p2pOrders, setP2pOrders] = useState<P2POrder[]>([]);
  const [p2pFilter, setP2pFilter] = useState<(typeof P2P_FILTERS)[number]>('ALL');
  const [filter, setFilter] = useState<'ALL' | 'OPEN' | 'FILLED' | 'CANCELED'>('ALL');
  const [error, setError] = useState<string | null>(null);

  function loadOrders() {
    const query = filter === 'ALL' ? '' : `?status=${filter}`;
    api.get<{ orders: Order[] }>(`/api/orders${query}`).then((res) => setOrders(res.orders)).catch(() => {});
  }

  function loadTrades() {
    api.get<{ trades: ShortTermTrade[] }>('/api/trades/short-term').then((res) => setTrades(res.trades)).catch(() => {});
  }

  useEffect(() => {
    loadOrders();
    const socket = getSocket();
    socket.on('order:update', loadOrders);
    return () => {
      socket.off('order:update', loadOrders);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  useEffect(() => {
    loadTrades();
    const socket = getSocket();
    socket.on('trade:settled', loadTrades);
    return () => {
      socket.off('trade:settled', loadTrades);
    };
  }, []);

  function loadP2POrders() {
    api.get<{ orders: P2POrder[] }>('/api/p2p/orders').then((res) => setP2pOrders(res.orders)).catch(() => {});
  }

  useEffect(() => {
    if (tab === 'P2P') loadP2POrders();
  }, [tab]);

  const filteredP2POrders = p2pOrders.filter((o) => p2pFilter === 'ALL' || o.status === p2pFilter);

  async function cancel(id: string) {
    setError(null);
    try {
      await api.del(`/api/orders/${id}`);
      loadOrders();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to cancel order');
    }
  }

  return (
    <MobileShell title="Orders">
      <div className="mb-3 flex rounded-xl border border-border bg-panel p-1">
        <button onClick={() => setTab('SPOT')} className={`flex-1 rounded-lg py-2 text-sm font-semibold ${tab === 'SPOT' ? 'bg-accent text-black' : 'text-muted'}`}>
          Spot Orders
        </button>
        <button onClick={() => setTab('SHORT_TERM')} className={`flex-1 rounded-lg py-2 text-sm font-semibold ${tab === 'SHORT_TERM' ? 'bg-accent text-black' : 'text-muted'}`}>
          Short-Term
        </button>
        <button onClick={() => setTab('P2P')} className={`flex-1 rounded-lg py-2 text-sm font-semibold ${tab === 'P2P' ? 'bg-accent text-black' : 'text-muted'}`}>
          P2P
        </button>
      </div>

      {tab === 'SPOT' && (
        <>
          <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
            {(['ALL', 'OPEN', 'FILLED', 'CANCELED'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium ${
                  f === filter ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted'
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          {error && <p className="mb-2 text-sm text-danger">{error}</p>}

          <div className="flex flex-col gap-2">
            {orders.length === 0 && <p className="mt-8 text-center text-sm text-muted">No orders yet.</p>}
            {orders.map((o) => (
              <div key={o.id} className="rounded-xl border border-border bg-panel p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-semibold ${o.side === 'BUY' ? 'text-accent' : 'text-danger'}`}>{o.side}</span>
                    <span className="text-sm font-medium">{o.pair}</span>
                    <span className="rounded bg-surface px-1.5 py-0.5 text-[10px] text-muted">{o.type}</span>
                  </div>
                  <span className={`text-xs font-medium ${STATUS_COLOR[o.status] || 'text-muted'}`}>{o.status}</span>
                </div>
                <div className="mt-1.5 flex items-center justify-between text-xs text-muted">
                  <span>
                    {o.filled_amount}/{o.amount} {o.price ? `@ ${o.price}` : '@ market'}
                  </span>
                  <span>{new Date(o.created_at).toLocaleString()}</span>
                </div>
                {(o.status === 'OPEN' || o.status === 'PARTIALLY_FILLED') && (
                  <button onClick={() => cancel(o.id)} className="mt-2 w-full rounded-lg border border-border py-1.5 text-xs text-danger">
                    Cancel order
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'SHORT_TERM' && (
        <div className="flex flex-col gap-2">
          {trades.length === 0 && <p className="mt-8 text-center text-sm text-muted">No short-term trades yet.</p>}
          {trades.map((t) => (
            <div key={t.id} className="rounded-xl border border-border bg-panel p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FontAwesomeIcon icon={t.direction === 'UP' ? faArrowTrendUp : faArrowTrendDown} className={t.direction === 'UP' ? 'text-accent' : 'text-danger'} />
                  <span className="text-sm font-medium">{t.pair}</span>
                  <span className="rounded bg-surface px-1.5 py-0.5 text-[10px] text-muted">{t.duration_label}</span>
                </div>
                <span className={`text-xs font-medium ${STATUS_COLOR[t.outcome]}`}>{t.outcome}</span>
              </div>
              <div className="mt-1.5 flex items-center justify-between text-xs text-muted">
                <span>
                  Stake {parseFloat(t.stake_amount).toLocaleString()} USDT · Entry {parseFloat(t.entry_price).toLocaleString()}
                  {t.settlement_price && ` → ${parseFloat(t.settlement_price).toLocaleString()}`}
                </span>
                <span>{new Date(t.created_at).toLocaleString()}</span>
              </div>
              {t.outcome === 'WIN' && t.payout_amount && (
                <div className="mt-1 text-xs font-semibold text-accent">+{parseFloat(t.payout_amount).toLocaleString()} USDT</div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'P2P' && (
        <>
          <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
            {P2P_FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setP2pFilter(f)}
                className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium ${
                  f === p2pFilter ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted'
                }`}
              >
                {f === 'ALL' ? 'ALL' : P2P_STATUS_LABEL[f]}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2">
            {filteredP2POrders.length === 0 && <p className="mt-8 text-center text-sm text-muted">No P2P orders yet.</p>}
            {filteredP2POrders.map((o) => {
              const isBuyer = o.ad_side === 'SELL' ? user?.id === o.taker_id : user?.id === o.merchant_id;
              const counterparty = user?.id === o.merchant_id ? o.taker_email : o.merchant_email;
              return (
                <Link key={o.id} href={`/p2p/orders/${o.id}`} className="block rounded-xl border border-border bg-panel p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-semibold ${isBuyer ? 'text-accent' : 'text-danger'}`}>{isBuyer ? 'Buy' : 'Sell'}</span>
                      <span className="text-sm font-medium">{o.asset_symbol}</span>
                    </div>
                    <span className={`text-xs font-medium ${STATUS_COLOR[o.status]}`}>{P2P_STATUS_LABEL[o.status]}</span>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between text-xs text-muted">
                    <span>
                      {parseFloat(o.amount).toLocaleString()} {o.asset_symbol} · {parseFloat(o.total_fiat).toLocaleString()} {o.fiat_symbol}
                    </span>
                    <span>{new Date(o.created_at).toLocaleString()}</span>
                  </div>
                  <div className="mt-1 text-[11px] text-muted">with {counterparty}</div>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </MobileShell>
  );
}
