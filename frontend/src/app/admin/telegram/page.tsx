'use client';

import { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPaperPlane } from '@fortawesome/free-solid-svg-icons';
import AdminShell from '@/components/AdminShell';
import { api, ApiError } from '@/lib/api';

interface TelegramConfig {
  telegram_url: string;
  popup_title: string;
  popup_message: string;
  button_text: string;
  is_active: boolean;
  show_popup: boolean;
}

export default function AdminTelegramPage() {
  const [form, setForm] = useState<TelegramConfig>({
    telegram_url: 'https://t.me/',
    popup_title: 'Join our Telegram!',
    popup_message: 'Get live updates, announcements, and support in our official Telegram channel.',
    button_text: 'Join Channel',
    is_active: false,
    show_popup: true,
  });
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    api.get<{ config: TelegramConfig | null }>('/api/admin/telegram-promo').then((res) => {
      if (res.config) setForm(res.config);
    });
  }

  useEffect(load, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setBusy(true);
    try {
      await api.put('/api/admin/telegram-promo', {
        telegramUrl: form.telegram_url,
        popupTitle: form.popup_title,
        popupMessage: form.popup_message,
        buttonText: form.button_text,
        isActive: form.is_active,
        showPopup: form.show_popup,
      });
      setMessage({ kind: 'ok', text: 'Telegram promo saved.' });
      load();
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof ApiError ? err.message : 'Failed to save' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminShell title="Telegram Promo">
      <p className="mb-4 max-w-xl text-sm text-muted">
        When active, a pinned Telegram button appears on every page for logged-in users, and — if enabled — a join popup shows once
        per browser session.
      </p>

      <div className="grid gap-6 lg:grid-cols-2">
        <form onSubmit={save} className="flex flex-col gap-3 rounded-xl border border-border bg-panel p-4 shadow-card">
          <label className="flex items-center justify-between text-sm">
            <span>Enable Telegram promo</span>
            <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
          </label>
          <label className="flex items-center justify-between text-sm">
            <span>Show join popup once per session</span>
            <input type="checkbox" checked={form.show_popup} onChange={(e) => setForm({ ...form, show_popup: e.target.checked })} />
          </label>

          <div>
            <label className="mb-1 block text-xs text-muted">Telegram URL</label>
            <input
              required
              type="url"
              value={form.telegram_url}
              onChange={(e) => setForm({ ...form, telegram_url: e.target.value })}
              placeholder="https://t.me/your_channel"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">Popup title</label>
            <input required value={form.popup_title} onChange={(e) => setForm({ ...form, popup_title: e.target.value })} className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">Popup message</label>
            <textarea
              required
              rows={3}
              value={form.popup_message}
              onChange={(e) => setForm({ ...form, popup_message: e.target.value })}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">Button text</label>
            <input required value={form.button_text} onChange={(e) => setForm({ ...form, button_text: e.target.value })} className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
          </div>

          {message && <p className={`text-xs ${message.kind === 'ok' ? 'text-accent' : 'text-danger'}`}>{message.text}</p>}
          <button type="submit" disabled={busy} className="mt-1 rounded-lg bg-accent py-2 text-sm font-semibold text-black disabled:opacity-60">
            {busy ? 'Saving…' : 'Save'}
          </button>
        </form>

        <div className="rounded-xl border border-border bg-panel p-4 shadow-card">
          <h3 className="mb-3 text-sm font-semibold text-muted">Preview</h3>
          <div className="rounded-2xl border border-border bg-surface p-4">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#26A5E4] text-white">
                <FontAwesomeIcon icon={faPaperPlane} />
              </span>
              <h4 className="text-sm font-semibold">{form.popup_title || 'Popup title'}</h4>
            </div>
            <p className="mb-4 text-xs text-muted">{form.popup_message || 'Popup message'}</p>
            <button type="button" className="w-full rounded-xl bg-[#26A5E4] py-2.5 text-sm font-semibold text-white">
              {form.button_text || 'Join Channel'}
            </button>
          </div>
          <p className="mt-3 text-[11px] text-muted">
            The pinned button (paper-plane icon, bottom-right) appears whenever "Enable Telegram promo" is on, regardless of the popup
            setting.
          </p>
        </div>
      </div>
    </AdminShell>
  );
}
