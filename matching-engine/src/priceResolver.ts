import { redis, livePriceKey, overridePriceKey } from './redis';

export interface ResolvedPrice {
  pair: string;
  price: number;
  source: 'override' | 'live';
}

/** Mirrors backend/src/services/priceResolver.ts: an admin override beats the live feed. */
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
    return { pair, price: parseFloat(live.price), source: 'live' };
  }

  return null;
}
