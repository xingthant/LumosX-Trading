import { Router } from 'express';
import { config } from '../config';
import { pool } from '../db';
import { resolveAllPrices, resolvePrice } from '../services/priceResolver';

const router = Router();

const ALLOWED_INTERVALS = ['1m', '5m', '15m', '1h', '4h', '1d'];

function assertSupportedPair(pair: string): string {
  const upper = pair.toUpperCase();
  if (!config.supportedPairs.includes(upper)) {
    throw Object.assign(new Error(`Unsupported pair ${upper}`), { status: 400 });
  }
  return upper;
}

router.get('/pairs', (_req, res) => {
  res.json({ pairs: config.supportedPairs });
});

router.get('/prices', async (_req, res) => {
  const prices = await resolveAllPrices(config.supportedPairs);
  res.json({ prices });
});

router.get('/prices/:pair', async (req, res) => {
  const resolved = await resolvePrice(req.params.pair.toUpperCase());
  if (!resolved) return res.status(404).json({ error: 'No price available for this pair' });
  res.json(resolved);
});

// Proxies Binance's public candlestick data so the frontend can seed historical charts
// without hitting a third-party API directly (avoids CORS/rate-limit exposure client-side).
router.get('/klines/:pair', async (req, res) => {
  try {
    const pair = assertSupportedPair(req.params.pair);
    const interval = ALLOWED_INTERVALS.includes(String(req.query.interval)) ? String(req.query.interval) : '1m';
    const limit = Math.min(Math.max(parseInt(String(req.query.limit || '300'), 10) || 300, 1), 1000);

    const url = `https://api.binance.com/api/v3/klines?symbol=${pair}&interval=${interval}&limit=${limit}`;
    const upstream = await fetch(url);
    if (!upstream.ok) throw new Error(`Binance klines request failed with ${upstream.status}`);
    const raw = (await upstream.json()) as any[];

    const candles = raw.map((k) => ({
      time: Math.floor(k[0] / 1000),
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
    }));

    res.json({ pair, interval, candles });
  } catch (err: any) {
    console.error('[market] klines proxy failed', err.message);
    res.status(err.status || 502).json({ error: 'Failed to load candlestick data' });
  }
});

function mapTicker(data: any) {
  return {
    pair: data.symbol,
    lastPrice: parseFloat(data.lastPrice),
    priceChangePercent: parseFloat(data.priceChangePercent),
    highPrice: parseFloat(data.highPrice),
    lowPrice: parseFloat(data.lowPrice),
    volume: parseFloat(data.volume),
    quoteVolume: parseFloat(data.quoteVolume),
  };
}

// Proxies Binance's 24h ticker statistics for every supported pair in a single upstream call,
// used for the market list badges and the per-pair stats bar.
router.get('/stats', async (_req, res) => {
  try {
    const symbols = encodeURIComponent(JSON.stringify(config.supportedPairs));
    const url = `https://api.binance.com/api/v3/ticker/24hr?symbols=${symbols}`;
    const upstream = await fetch(url);
    if (!upstream.ok) throw new Error(`Binance ticker request failed with ${upstream.status}`);
    const data = (await upstream.json()) as any[];
    res.json({ stats: data.map(mapTicker) });
  } catch (err: any) {
    console.error('[market] bulk stats proxy failed', err.message);
    res.status(502).json({ error: 'Failed to load market stats' });
  }
});

router.get('/stats/:pair', async (req, res) => {
  try {
    const pair = assertSupportedPair(req.params.pair);
    const url = `https://api.binance.com/api/v3/ticker/24hr?symbol=${pair}`;
    const upstream = await fetch(url);
    if (!upstream.ok) throw new Error(`Binance ticker request failed with ${upstream.status}`);
    const data: any = await upstream.json();
    res.json(mapTicker(data));
  } catch (err: any) {
    console.error('[market] stats proxy failed', err.message);
    res.status(err.status || 502).json({ error: 'Failed to load market stats' });
  }
});

// Active short-term trade durations, configured by admins, that users can pick from.
router.get('/trade-durations', async (_req, res) => {
  const result = await pool.query(
    `SELECT id, label, seconds, payout_multiplier FROM trade_durations WHERE is_active = true ORDER BY sort_order ASC`
  );
  res.json({ durations: result.rows });
});

// Active Explore-tab promotions.
router.get('/promotions', async (_req, res) => {
  const result = await pool.query(
    `SELECT id, title, description, badge_text, created_at FROM promotions WHERE is_active = true ORDER BY created_at DESC`
  );
  res.json({ promotions: result.rows });
});

export default router;
