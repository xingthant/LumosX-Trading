'use client';

import { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faGift } from '@fortawesome/free-solid-svg-icons';
import MobileShell from '@/components/MobileShell';
import { api } from '@/lib/api';

interface Promotion {
  id: string;
  title: string;
  description: string | null;
  badge_text: string | null;
  created_at: string;
}

export default function ExplorePage() {
  const [promotions, setPromotions] = useState<Promotion[]>([]);

  useEffect(() => {
    api.get<{ promotions: Promotion[] }>('/api/market/promotions').then((res) => setPromotions(res.promotions)).catch(() => {});
  }, []);

  return (
    <MobileShell title="Explore">
      <div className="flex flex-col gap-3">
        {promotions.length === 0 && (
          <div className="rounded-2xl border border-border bg-panel p-6 text-center text-sm text-muted">
            No promotions or events right now — check back later.
          </div>
        )}
        {promotions.map((p) => (
          <div key={p.id} className="rounded-2xl border border-border bg-panel p-4 shadow-card transition-transform hover:-translate-y-0.5">
            <div className="mb-2 flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent2 text-black">
                <FontAwesomeIcon icon={faGift} />
              </span>
              <div className="flex-1">
                <div className="text-sm font-semibold">{p.title}</div>
                <div className="text-[11px] text-muted">{new Date(p.created_at).toLocaleDateString()}</div>
              </div>
              {p.badge_text && (
                <span className="rounded-full bg-amber-500/15 px-2 py-1 text-[10px] font-semibold text-amber-400">{p.badge_text}</span>
              )}
            </div>
            {p.description && <p className="text-sm text-muted">{p.description}</p>}
          </div>
        ))}
      </div>
    </MobileShell>
  );
}
