import { redis, livePriceKey, overridePriceKey } from '../redis';

export interface ResolvedPrice {
  pair: string;
  price: number;
  source: 'override' | 'live';
  /** Trade quantity for this tick, when sourced from the live feed (used to build volume candles). */
  volume?: number;
}

/**
 * Resolves the effective trading price for a pair: an active admin override
 * takes precedence over the live market feed.
 */
export async function resolvePrice(pair: string): Promise<ResolvedPrice | null> {
  const overrideRaw = await redis.get(overridePriceKey(pair));
  if (overrideRaw) {
    const override = JSON.parse(overrideRaw);
    if (override.isActive) {
      return { pair, price: parseFloat(override.price), source: 'override' };
    }
  }

  const liveRaw = await redis.get(livePriceKey(pair));
  if (liveRaw) {
    const live = JSON.parse(liveRaw);
    return { pair, price: parseFloat(live.price), source: 'live', volume: parseFloat(live.volume || 0) };
  }

  return null;
}

export async function resolveAllPrices(pairs: string[]): Promise<ResolvedPrice[]> {
  const results = await Promise.all(pairs.map((p) => resolvePrice(p)));
  return results.filter((r): r is ResolvedPrice => r !== null);
}
