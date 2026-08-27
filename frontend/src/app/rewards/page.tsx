'use client';

import { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCopy, faGift, faUsers, faTrophy } from '@fortawesome/free-solid-svg-icons';
import MobileShell from '@/components/MobileShell';
import { api } from '@/lib/api';

interface ReferredUser {
  email: string;
  referrer_bonus_amount: string | null;
  asset_symbol: string | null;
  created_at: string;
}

interface Milestone {
  id: string;
  label: string;
  target_volume: string;
  bonus_amount: string;
  bonus_asset: string;
  is_repeatable: boolean;
  claimed_count: number;
  total_claimed: number;
}

interface BonusMe {
  referralCode: string;
  referredUsers: ReferredUser[];
  referralEarned: number;
  tradingVolume: number;
  milestones: Milestone[];
}

export default function RewardsPage() {
  const [data, setData] = useState<BonusMe | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.get<BonusMe>('/api/bonus/me').then(setData).catch(() => {});
  }, []);

  function copyLink() {
    if (!data) return;
    const link = `${window.location.origin}/login?ref=${data.referralCode}`;
    navigator.clipboard?.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <MobileShell title="Rewards">
      {!data ? (
        <p className="mt-8 text-center text-sm text-muted">Loading…</p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border border-border bg-panel p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <FontAwesomeIcon icon={faUsers} className="text-accent" /> Refer & Earn
            </div>
            <p className="mb-3 text-xs text-muted">Share your code — you and your friend both get a bonus when they sign up.</p>
            <div className="mb-2 flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3">
              <span className="font-mono text-lg tracking-wider">{data.referralCode}</span>
              <button onClick={copyLink} className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-black">
                <FontAwesomeIcon icon={faCopy} /> {copied ? 'Copied!' : 'Copy link'}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="rounded-lg bg-surface p-3">
                <div className="text-lg font-bold">{data.referredUsers.length}</div>
                <div className="text-[11px] text-muted">People referred</div>
              </div>
              <div className="rounded-lg bg-surface p-3">
                <div className="text-lg font-bold text-accent">{data.referralEarned.toLocaleString()}</div>
                <div className="text-[11px] text-muted">Earned from referrals</div>
              </div>
            </div>
            {data.referredUsers.length > 0 && (
              <div className="mt-3 flex flex-col gap-1.5 border-t border-border pt-3 text-xs">
                {data.referredUsers.map((r, i) => (
                  <div key={i} className="flex justify-between">
                    <span>{r.email}</span>
                    <span className="text-accent">
                      +{r.referrer_bonus_amount ? parseFloat(r.referrer_bonus_amount).toLocaleString() : 0} {r.asset_symbol}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-panel p-4">
            <div className="mb-1 flex items-center gap-2 text-sm font-semibold">
              <FontAwesomeIcon icon={faTrophy} className="text-amber-400" /> Trading Milestones
            </div>
            <p className="mb-3 text-xs text-muted">
              Your trading volume: <span className="font-semibold text-white">{data.tradingVolume.toLocaleString()} USDT</span>
            </p>
            <div className="flex flex-col gap-3">
              {data.milestones.length === 0 && <p className="text-xs text-muted">No milestones available right now.</p>}
              {data.milestones.map((m) => {
                const target = parseFloat(m.target_volume);
                const progressWithinTier = m.is_repeatable ? data.tradingVolume % target : Math.min(data.tradingVolume, target);
                const pct = Math.min(100, (progressWithinTier / target) * 100);
                const reached = m.is_repeatable ? Math.floor(data.tradingVolume / target) : data.tradingVolume >= target;
                return (
                  <div key={m.id}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="font-medium">
                        {m.label}
                        {m.is_repeatable && m.claimed_count > 0 && (
                          <span className="ml-1.5 rounded bg-accent/15 px-1.5 py-0.5 text-[10px] text-accent">x{m.claimed_count} earned</span>
                        )}
                        {!m.is_repeatable && m.claimed_count > 0 && (
                          <span className="ml-1.5 rounded bg-accent/15 px-1.5 py-0.5 text-[10px] text-accent">Earned</span>
                        )}
                      </span>
                      <span className="text-muted">
                        {parseFloat(m.bonus_amount).toLocaleString()} {m.bonus_asset}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-surface">
                      <div
                        className={`h-full rounded-full ${reached ? 'bg-accent' : 'bg-amber-400'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="mt-0.5 text-[10px] text-muted">Target: {target.toLocaleString()} USDT traded</div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-xl border border-border bg-panel p-3 text-xs text-muted">
            <FontAwesomeIcon icon={faGift} /> Registration bonuses (if active) are credited automatically when you sign up.
          </div>
        </div>
      )}
    </MobileShell>
  );
}
