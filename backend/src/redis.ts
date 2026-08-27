import Redis from 'ioredis';
import { config } from './config';

export const redis = new Redis(config.redisUrl);
export const redisSub = new Redis(config.redisUrl);
export const redisPub = new Redis(config.redisUrl);

export const CHANNELS = {
  MARKET_PRICES: 'market:prices',
  ORDER_EVENTS: 'orders:events',
  TRADE_EVENTS: 'trades:events',
};

export function livePriceKey(pair: string) {
  return `price:live:${pair}`;
}

export function overridePriceKey(pair: string) {
  return `price:override:${pair}`;
}
