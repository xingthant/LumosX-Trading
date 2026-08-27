'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPaperclip, faXmark } from '@fortawesome/free-solid-svg-icons';
import MobileShell from '@/components/MobileShell';
import { useAuth } from '@/lib/AuthContext';
import { api, ApiError } from '@/lib/api';

interface Order {
  id: string;
  merchant_id: string;
  taker_id: string;
  merchant_email: string;
  taker_email: string;
  ad_side: 'BUY' | 'SELL';
  asset_symbol: string;
  fiat_symbol: string;
  amount: string;
  price: string;
  total_fiat: string;
  payment_method: string | null;
  bank_name: string | null;
  bank_account_holder: string | null;
  bank_account_number: string | null;
  bank_note: string | null;
  status: 'PENDING_PAYMENT' | 'PAID' | 'COMPLETED' | 'CANCELLED' | 'DISPUTED';
  disputed_by: string | null;
  payment_deadline: string;
  created_at: string;
}

interface Message {
  id: string;
  sender_id: string;
  sender_email: string;
  message: string;
  created_at: string;
}

interface Receipt {
  id: string;
  uploaded_by: string;
  file_name: string;
  mime_type: string;
  file_data: string;
  created_at: string;
}

const STATUS_LABEL: Record<Order['status'], string> = {
  PENDING_PAYMENT: 'Awaiting payment',
  PAID: 'Marked as paid',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  DISPUTED: 'Disputed — admin reviewing',
};

const STATUS_COLOR: Record<Order['status'], string> = {
  PENDING_PAYMENT: 'text-amber-400',
  PAID: 'text-accent',
  COMPLETED: 'text-accent',
  CANCELLED: 'text-muted',
  DISPUTED: 'text-danger',
};

const MAX_RECEIPT_BYTES = 4 * 1024 * 1024;

export default function P2POrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [viewingReceipt, setViewingReceipt] = useState<Receipt | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function load() {
    api.get<{ order: Order }>(`/api/p2p/orders/${id}`).then((res) => setOrder(res.order)).catch(() => router.push('/p2p'));
    api.get<{ messages: Message[] }>(`/api/p2p/orders/${id}/messages`).then((res) => setMessages(res.messages)).catch(() => {});
    api.get<{ receipts: Receipt[] }>(`/api/p2p/orders/${id}/receipts`).then((res) => setReceipts(res.receipts)).catch(() => {});
  }

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 4000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  if (!order || !user) {
    return (
      <MobileShell title="P2P Order">
        <p className="mt-8 text-center text-sm text-muted">Loading…</p>
      </MobileShell>
    );
  }

  const isBuyer = order.ad_side === 'SELL' ? user.id === order.taker_id : user.id === order.merchant_id;
  const isSeller = !isBuyer;
  const counterpartyEmail = user.id === order.merchant_id ? order.taker_email : order.merchant_email;
  const canUploadReceipt = ['PENDING_PAYMENT', 'PAID', 'DISPUTED'].includes(order.status);

  async function act(action: 'mark-paid' | 'release' | 'cancel' | 'dispute' | 'dispute/cancel') {
    setError(null);
    setBusy(true);
    try {
      await api.post(`/api/p2p/orders/${id}/${action}`);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    const body = text;
    setText('');
    try {
      await api.post(`/api/p2p/orders/${id}/messages`, { message: body });
      load();
    } catch {
      setText(body);
    }
  }

  function pickReceipt() {
    fileInputRef.current?.click();
  }

  async function onReceiptSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setUploadError(null);
    if (!file.type.startsWith('image/')) {
      setUploadError('Only image files are supported.');
      return;
    }
    if (file.size > MAX_RECEIPT_BYTES) {
      setUploadError('Image must be under 4MB.');
      return;
    }

    setUploading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const base64 = dataUrl.split(',')[1];
      await api.post(`/api/p2p/orders/${id}/receipt`, { fileName: file.name, mimeType: file.type, fileData: base64 });
      load();
    } catch (err) {
      setUploadError(err instanceof ApiError ? err.message : 'Failed to upload receipt');
    } finally {
      setUploading(false);
    }
  }

  return (
    <MobileShell title="P2P Order">
      <div className="mb-3 rounded-2xl border border-border bg-panel p-4 shadow-card">
        <div className="mb-2 flex items-center justify-between">
          <span className={`text-sm font-semibold ${STATUS_COLOR[order.status]}`}>{STATUS_LABEL[order.status]}</span>
          <span className="text-xs text-muted">with {counterpartyEmail}</span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <div className="text-[11px] text-muted">Amount</div>
            <div className="font-semibold tabular-nums">
              {parseFloat(order.amount).toLocaleString()} {order.asset_symbol}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-muted">Total</div>
            <div className="font-semibold tabular-nums">
              {parseFloat(order.total_fiat).toLocaleString()} {order.fiat_symbol}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-muted">Price</div>
            <div className="tabular-nums">
              {parseFloat(order.price).toLocaleString()} {order.fiat_symbol}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-muted">Payment method</div>
            <div>{order.bank_name || order.payment_method || '—'}</div>
          </div>
        </div>
        {order.status === 'PENDING_PAYMENT' && (
          <p className="mt-2 text-[11px] text-amber-400">
            Pay by {new Date(order.payment_deadline).toLocaleTimeString()} or the order auto-cancels.
          </p>
        )}
      </div>

      {order.bank_name && (
        <div className="mb-3 rounded-2xl border border-accent/30 bg-accent/5 p-4 shadow-card">
          <div className="mb-2 text-xs font-semibold text-accent">
            {isBuyer ? 'Pay into this bank account' : 'Buyer will pay into this account'}
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <div className="text-[11px] text-muted">Bank</div>
              <div className="font-medium">{order.bank_name}</div>
            </div>
            <div>
              <div className="text-[11px] text-muted">Account holder</div>
              <div className="font-medium">{order.bank_account_holder}</div>
            </div>
            <div className="col-span-2">
              <div className="text-[11px] text-muted">Account number</div>
              <div className="font-medium tabular-nums">{order.bank_account_number}</div>
            </div>
          </div>
          {order.bank_note && <div className="mt-2 text-xs italic text-muted">Note: {order.bank_note}</div>}
        </div>
      )}

      {error && <p className="mb-2 text-sm text-danger">{error}</p>}

      <div className="mb-3 flex flex-col gap-2">
        {isBuyer && order.status === 'PENDING_PAYMENT' && (
          <button onClick={() => act('mark-paid')} disabled={busy} className="w-full rounded-xl bg-accent py-3 text-sm font-semibold text-black disabled:opacity-60">
            I've Paid — Notify {counterpartyEmail?.split('@')[0]}
          </button>
        )}
        {isSeller && order.status === 'PAID' && (
          <button onClick={() => act('release')} disabled={busy} className="w-full rounded-xl bg-accent py-3 text-sm font-semibold text-black disabled:opacity-60">
            Release {order.asset_symbol} to Buyer
          </button>
        )}
        {order.status === 'PENDING_PAYMENT' && (
          <button onClick={() => act('cancel')} disabled={busy} className="w-full rounded-xl border border-border py-2.5 text-sm text-muted">
            Cancel Order
          </button>
        )}
        {(order.status === 'PENDING_PAYMENT' || order.status === 'PAID') && (
          <button onClick={() => act('dispute')} disabled={busy} className="w-full rounded-xl border border-danger/40 py-2.5 text-sm text-danger">
            Open Dispute — Complain to Admin
          </button>
        )}
        {order.status === 'DISPUTED' && order.disputed_by === user.id && (
          <button onClick={() => act('dispute/cancel')} disabled={busy} className="w-full rounded-xl border border-border py-2.5 text-sm text-muted">
            Cancel My Dispute
          </button>
        )}
        {order.status === 'DISPUTED' && order.disputed_by !== user.id && (
          <p className="text-center text-[11px] text-muted">
            {counterpartyEmail?.split('@')[0]} opened this dispute — an admin will review it. Add details in the chat below if needed.
          </p>
        )}
      </div>

      <div className="mb-3 rounded-2xl border border-border bg-panel p-3 shadow-card">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold text-muted">Payment receipt</span>
          {canUploadReceipt && (
            <button
              onClick={pickReceipt}
              disabled={uploading}
              className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs disabled:opacity-60"
            >
              <FontAwesomeIcon icon={faPaperclip} /> {uploading ? 'Uploading…' : 'Upload'}
            </button>
          )}
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onReceiptSelected} />
        </div>
        {uploadError && <p className="mb-2 text-xs text-danger">{uploadError}</p>}
        {receipts.length === 0 ? (
          <p className="text-xs text-muted">
            {isBuyer ? 'Upload proof of payment once you\'ve paid.' : 'No receipt uploaded yet.'}
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {receipts.map((r) => (
              <button
                key={r.id}
                onClick={() => setViewingReceipt(r)}
                className="h-16 w-16 overflow-hidden rounded-lg border border-border"
              >
                <img src={`data:${r.mime_type};base64,${r.file_data}`} alt={r.file_name} className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col rounded-2xl border border-border bg-panel shadow-card">
        <div className="max-h-72 overflow-y-auto p-3">
          {messages.length === 0 && <p className="py-4 text-center text-xs text-muted">No messages yet — coordinate payment details here.</p>}
          {messages.map((m) => (
            <div key={m.id} className={`mb-2 flex ${m.sender_id === user.id ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-xl px-3 py-2 text-xs ${m.sender_id === user.id ? 'bg-accent text-black' : 'bg-surface'}`}>
                {m.message}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
        <form onSubmit={sendMessage} className="flex gap-2 border-t border-border p-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type a message…"
            className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <button type="submit" className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black">
            Send
          </button>
        </form>
      </div>

      {viewingReceipt && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/80 p-6" onClick={() => setViewingReceipt(null)}>
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
    </MobileShell>
  );
}
