'use client';

import { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faXmark } from '@fortawesome/free-solid-svg-icons';
import AdminShell from '@/components/AdminShell';
import { api } from '@/lib/api';

interface Order {
  id: string;
  merchant_email: string;
  taker_email: string;
  ad_side: 'BUY' | 'SELL';
  asset_symbol: string;
  fiat_symbol: string;
  amount: string;
  total_fiat: string;
  status: string;
  created_at: string;
}

interface Receipt {
  id: string;
  file_name: string;
  mime_type: string;
  file_data: string;
  uploaded_by_email: string;
  created_at: string;
}

const STATUS_COLOR: Record<string, string> = {
  PENDING_PAYMENT: 'text-amber-400',
  PAID: 'text-accent',
  COMPLETED: 'text-accent',
  CANCELLED: 'text-muted',
  DISPUTED: 'text-danger',
};

export default function AdminP2PPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState<'ALL' | 'DISPUTED'>('DISPUTED');
  const [receiptsFor, setReceiptsFor] = useState<string | null>(null);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [viewingReceipt, setViewingReceipt] = useState<Receipt | null>(null);

  function load() {
    const query = filter === 'ALL' ? '' : `?status=${filter}`;
    api.get<{ orders: Order[] }>(`/api/admin/p2p/orders${query}`).then((res) => setOrders(res.orders)).catch(() => {});
  }

  useEffect(load, [filter]);

  async function resolve(id: string, action: 'complete' | 'cancel') {
    await api.post(`/api/admin/p2p/orders/${id}/resolve`, { action });
    load();
  }

  async function viewReceipts(orderId: string) {
    setReceiptsFor(orderId);
    const res = await api.get<{ receipts: Receipt[] }>(`/api/admin/p2p/orders/${orderId}/receipts`);
    setReceipts(res.receipts);
  }

  return (
    <AdminShell title="P2P Oversight">
      <div className="mb-4 flex gap-2">
        {(['DISPUTED', 'ALL'] as const).map((f) => (
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
              <th className="px-3 py-2">Merchant</th>
              <th className="px-3 py-2">Taker</th>
              <th className="px-3 py-2">Amount</th>
              <th className="px-3 py-2">Total</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-t border-border">
                <td className="px-3 py-2">{o.merchant_email}</td>
                <td className="px-3 py-2">{o.taker_email}</td>
                <td className="px-3 py-2 tabular-nums">
                  {parseFloat(o.amount).toLocaleString()} {o.asset_symbol}
                </td>
                <td className="px-3 py-2 tabular-nums">
                  {parseFloat(o.total_fiat).toLocaleString()} {o.fiat_symbol}
                </td>
                <td className="px-3 py-2">
                  <span className={STATUS_COLOR[o.status] || 'text-muted'}>{o.status}</span>
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => viewReceipts(o.id)} className="rounded-lg border border-border px-2 py-1 text-xs">
                      Receipts
                    </button>
                    {(o.status === 'DISPUTED' || o.status === 'PENDING_PAYMENT' || o.status === 'PAID') && (
                      <>
                        <button onClick={() => resolve(o.id, 'complete')} className="rounded-lg bg-accent px-2 py-1 text-xs font-semibold text-black">
                          Force Complete
                        </button>
                        <button onClick={() => resolve(o.id, 'cancel')} className="rounded-lg bg-danger px-2 py-1 text-xs font-semibold text-white">
                          Force Cancel
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {orders.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-muted">
                  Nothing here.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {receiptsFor && (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/60 md:items-center" onClick={() => setReceiptsFor(null)}>
          <div className="w-full max-w-md rounded-t-2xl border-t border-border bg-panel p-4 md:rounded-2xl md:border" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Payment receipts</h3>
              <button onClick={() => setReceiptsFor(null)} className="text-muted">
                <FontAwesomeIcon icon={faXmark} />
              </button>
            </div>
            {receipts.length === 0 ? (
              <p className="text-sm text-muted">No receipts uploaded for this order.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {receipts.map((r) => (
                  <button key={r.id} onClick={() => setViewingReceipt(r)} className="flex items-center gap-3 rounded-lg border border-border p-2 text-left">
                    <img src={`data:${r.mime_type};base64,${r.file_data}`} alt={r.file_name} className="h-14 w-14 rounded object-cover" />
                    <div className="text-xs">
                      <div className="font-medium">{r.uploaded_by_email}</div>
                      <div className="text-muted">{new Date(r.created_at).toLocaleString()}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {viewingReceipt && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/90 p-6" onClick={() => setViewingReceipt(null)}>
          <button onClick={() => setViewingReceipt(null)} className="absolute right-5 top-5 text-xl text-white">
            <FontAwesomeIcon icon={faXmark} />
          </button>
          <img
            src={`data:${viewingReceipt.mime_type};base64,${viewingReceipt.file_data}`}
            alt={viewingReceipt.file_name}
            className="max-h-full max-w-full rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </AdminShell>
  );
}
