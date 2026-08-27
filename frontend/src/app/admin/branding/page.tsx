'use client';

import { useEffect, useRef, useState } from 'react';
import AdminShell from '@/components/AdminShell';
import { api, ApiError } from '@/lib/api';

interface BrandingConfig {
  site_name: string;
  tagline: string;
  logo_data: string | null;
  logo_mime_type: string | null;
}

const MAX_LOGO_BYTES = 1.5 * 1024 * 1024;
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];

export default function AdminBrandingPage() {
  const [siteName, setSiteName] = useState('PaperTrade');
  const [tagline, setTagline] = useState('');
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [pendingLogo, setPendingLogo] = useState<{ data: string; mimeType: string } | null>(null);
  const [clearLogo, setClearLogo] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function load() {
    api.get<{ config: BrandingConfig | null }>('/api/admin/branding').then((res) => {
      if (res.config) {
        setSiteName(res.config.site_name);
        setTagline(res.config.tagline);
        setLogoPreview(res.config.logo_data ? `data:${res.config.logo_mime_type};base64,${res.config.logo_data}` : null);
      }
    });
  }

  useEffect(load, []);

  function pickLogo() {
    fileInputRef.current?.click();
  }

  async function onLogoSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setMessage(null);

    if (!ALLOWED_TYPES.includes(file.type)) {
      setMessage({ kind: 'error', text: 'Use PNG, JPEG, WEBP, or SVG.' });
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setMessage({ kind: 'error', text: 'Logo must be under 1.5MB.' });
      return;
    }

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const base64 = dataUrl.split(',')[1];
    setPendingLogo({ data: base64, mimeType: file.type });
    setLogoPreview(dataUrl);
    setClearLogo(false);
  }

  function removeLogo() {
    setPendingLogo(null);
    setLogoPreview(null);
    setClearLogo(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setBusy(true);
    try {
      await api.put('/api/admin/branding', {
        siteName,
        tagline,
        ...(pendingLogo ? { logoData: pendingLogo.data, logoMimeType: pendingLogo.mimeType } : {}),
        ...(clearLogo ? { clearLogo: true } : {}),
      });
      setMessage({ kind: 'ok', text: 'Branding updated — reflected across the app immediately.' });
      setPendingLogo(null);
      setClearLogo(false);
      load();
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof ApiError ? err.message : 'Failed to save branding' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminShell title="Branding">
      <p className="mb-4 max-w-xl text-sm text-muted">
        Controls the app name, tagline, and logo shown on the login screen, browser tab, and admin console header.
      </p>

      <div className="max-w-md rounded-xl border border-border bg-panel p-4 shadow-card">
        <form onSubmit={save} className="flex flex-col gap-3">
          <div>
            <label className="mb-1 block text-xs text-muted">Logo</label>
            <div className="flex items-center gap-3">
              {logoPreview ? (
                <img src={logoPreview} alt="Logo preview" className="h-14 w-14 rounded-2xl border border-border object-cover" />
              ) : (
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-accent2 text-xl font-black text-black">
                  {siteName.charAt(0).toUpperCase() || '?'}
                </span>
              )}
              <div className="flex gap-2">
                <button type="button" onClick={pickLogo} className="rounded-lg border border-border px-3 py-1.5 text-xs">
                  Upload logo
                </button>
                {logoPreview && (
                  <button type="button" onClick={removeLogo} className="rounded-lg border border-border px-3 py-1.5 text-xs text-danger">
                    Remove
                  </button>
                )}
              </div>
              <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={onLogoSelected} />
            </div>
            <p className="mt-1 text-[11px] text-muted">Falls back to a colored initial badge if no logo is set. PNG/JPEG/WEBP/SVG, max 1.5MB.</p>
          </div>

          <div>
            <label className="mb-1 block text-xs text-muted">Site name</label>
            <input required value={siteName} onChange={(e) => setSiteName(e.target.value)} className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
          </div>

          <div>
            <label className="mb-1 block text-xs text-muted">Tagline</label>
            <input value={tagline} onChange={(e) => setTagline(e.target.value)} className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
          </div>

          {message && <p className={`text-xs ${message.kind === 'ok' ? 'text-accent' : 'text-danger'}`}>{message.text}</p>}

          <button type="submit" disabled={busy} className="mt-1 rounded-lg bg-accent py-2 text-sm font-semibold text-black disabled:opacity-60">
            {busy ? 'Saving…' : 'Save branding'}
          </button>
        </form>
      </div>
    </AdminShell>
  );
}
