import { redisSub, CHANNELS } from './redis';
import { processPriceUpdate } from './engine';
import { settleDueTrades } from './shortTermTrades';
import { expireOverdueP2POrders } from './p2pExpiry';
import { checkTradingMilestones } from './bonusMilestones';

console.log('[matching-engine] starting, subscribing to', CHANNELS.MARKET_PRICES);

redisSub.subscribe(CHANNELS.MARKET_PRICES, (err) => {
  if (err) {
    console.error('[matching-engine] failed to subscribe', err);
    process.exit(1);
  }
});

redisSub.on('message', async (channel, message) => {
  if (channel !== CHANNELS.MARKET_PRICES) return;
  try {
    const { pair, price } = JSON.parse(message);
    await processPriceUpdate(pair, parseFloat(price));
  } catch (err) {
    console.error('[matching-engine] failed to process price update', err);
  }
});

// Short-term trades and P2P payment windows expire on a wall-clock schedule rather than a
// price event, so they need their own poll loop instead of piggybacking on price updates.
const settlementTimer = setInterval(() => {
  settleDueTrades().catch((err) => console.error('[matching-engine] settlement sweep failed', err));
}, 1000);

const p2pTimer = setInterval(() => {
  expireOverdueP2POrders().catch((err) => console.error('[matching-engine] P2P expiry sweep failed', err));
}, 5000);

const milestoneTimer = setInterval(() => {
  checkTradingMilestones().catch((err) => console.error('[matching-engine] milestone sweep failed', err));
}, 15000);

process.on('SIGTERM', () => {
  clearInterval(settlementTimer);
  clearInterval(p2pTimer);
  clearInterval(milestoneTimer);
  process.exit(0);
});
