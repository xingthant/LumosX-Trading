'use client';

import { useState } from 'react';

// A small, well-known open-source crypto icon set — reliable and permanent, but not
// guaranteed to cover every symbol, so we fall back to a colored initial badge on error
// instead of showing a broken image.
function logoUrl(symbol: string) {
  return `https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/${symbol.toLowerCase()}.png`;
}

// A handful of well-known coins get a hand-picked fallback gradient; everything else falls
// back to a deterministic hue derived from the symbol so the list stays colorful and
// distinct even for coins outside that hand-picked set.
const KNOWN_GRADIENTS: Record<string, string> = {
  BTC: 'from-amber-400 to-orange-500',
  ETH: 'from-indigo-400 to-violet-500',
  SOL: 'from-fuchsia-400 to-purple-500',
  BNB: 'from-yellow-300 to-amber-500',
  XRP: 'from-slate-300 to-slate-500',
  USDT: 'from-accent to-accent2',
};

function hashHue(symbol: string): number {
  let hash = 0;
  for (let i = 0; i < symbol.length; i++) hash = symbol.charCodeAt(i) + ((hash << 5) - hash);
  return Math.abs(hash) % 360;
}

function fallbackStyle(symbol: string): { className: string; style?: React.CSSProperties } {
  if (KNOWN_GRADIENTS[symbol]) return { className: `bg-gradient-to-br ${KNOWN_GRADIENTS[symbol]}` };
  const hue = hashHue(symbol);
  return { className: '', style: { background: `linear-gradient(135deg, hsl(${hue} 75% 60%), hsl(${(hue + 45) % 360} 70% 45%))` } };
}

export default function CoinAvatar({ symbol, size = 36 }: { symbol: string; size?: number }) {
  const [failed, setFailed] = useState(false);

  if (!failed) {
    return (
      <img
        src={logoUrl(symbol)}
        alt={symbol}
        width={size}
        height={size}
        className="shrink-0 rounded-full bg-white/5 object-cover"
        style={{ width: size, height: size }}
        onError={() => setFailed(true)}
      />
    );
  }

  const fallback = fallbackStyle(symbol);
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full text-xs font-bold text-black ${fallback.className}`}
      style={{ width: size, height: size, ...fallback.style }}
    >
      {symbol.slice(0, 1)}
    </span>
  );
}
