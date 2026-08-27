import WebSocket from 'ws';
import { redis, redisPub, livePriceKey, CHANNELS } from '../redis';
import { config } from './../config';
import { resolvePrice } from './priceResolver';

/**
 * Connects to Binance's combined ticker stream for the configured pairs, caches live
 * prices in Redis, and republishes the platform-resolved price (override-aware) so
 * clients always see the effective trading price.
 */
export function startBinanceFeed() {
  const streams = config.supportedPairs.map((p) => `${p.toLowerCase()}@trade`).join('/');
  const url = `${config.binanceWsUrl}?streams=${streams}`;
  connect(url);
}

function connect(url: string) {
  const ws = new WebSocket(url);

  ws.on('open', () => console.log('[price-feed] connected to Binance stream'));

  ws.on('message', async (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      const data = msg.data;
      if (!data || !data.s || !data.p) return;
      const pair = data.s as string;
      const price = parseFloat(data.p);
      const volume = parseFloat(data.q || '0');

      await redis.set(livePriceKey(pair), JSON.stringify({ price, volume, ts: Date.now() }));

      const resolved = await resolvePrice(pair);
      if (resolved) {
        await redisPub.publish(CHANNELS.MARKET_PRICES, JSON.stringify(resolved));
      }
    } catch (err) {
      console.error('[price-feed] failed to process message', err);
    }
  });

  ws.on('close', () => {
    console.warn('[price-feed] connection closed, reconnecting in 3s');
    setTimeout(() => connect(url), 3000);
  });

  ws.on('error', (err) => {
    console.error('[price-feed] websocket error', err.message);
    ws.close();
  });
}
