// Must be imported before any routes are registered: patches Express so a rejected
// promise inside an async route handler is forwarded to the error middleware below
// instead of becoming an unhandled rejection that crashes the whole process.
import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { config } from './config';
import { redisSub, CHANNELS } from './redis';
import { startBinanceFeed } from './services/priceFeed';

import authRoutes from './routes/auth';
import marketRoutes from './routes/market';
import orderRoutes from './routes/orders';
import walletRoutes from './routes/wallet';
import adminRoutes from './routes/admin';
import tradeRoutes from './routes/trades';
import p2pRoutes from './routes/p2p';
import bonusRoutes from './routes/bonus';
import publicRoutes from './routes/public';

const app = express();
app.use(cors({ origin: config.corsOrigin }));
// Raised from the default 100kb so base64-encoded P2P payment receipt images fit through.
app.use(express.json({ limit: '6mb' }));

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', authRoutes);
app.use('/api/market', marketRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/trades', tradeRoutes);
app.use('/api/p2p', p2pRoutes);
app.use('/api/bonus', bonusRoutes);
app.use('/api/public', publicRoutes);

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[unhandled]', err);
  if (err?.code === '23503') {
    return res.status(400).json({ error: 'This action is blocked by related records that still reference it.' });
  }
  res.status(500).json({ error: 'Internal server error' });
});

// Last line of defense: log instead of letting the process die if something outside the
// request/response cycle (a stray timer, a client library callback) throws unexpectedly.
process.on('unhandledRejection', (reason) => console.error('[unhandledRejection]', reason));
process.on('uncaughtException', (err) => console.error('[uncaughtException]', err));

const server = http.createServer(app);
const io = new SocketIOServer(server, { cors: { origin: config.corsOrigin } });

io.on('connection', (socket) => {
  socket.on('subscribe', (pairs: string[]) => {
    if (Array.isArray(pairs)) {
      pairs.forEach((p) => socket.join(`pair:${p.toUpperCase()}`));
    }
  });
  socket.on('subscribe:orders', (userId: string) => {
    if (typeof userId === 'string') socket.join(`user:${userId}`);
  });
});

// Forward Redis pub/sub events onto connected WebSocket clients.
redisSub.subscribe(CHANNELS.MARKET_PRICES, CHANNELS.ORDER_EVENTS, CHANNELS.TRADE_EVENTS);
redisSub.on('message', (channel, message) => {
  try {
    const payload = JSON.parse(message);
    if (channel === CHANNELS.MARKET_PRICES) {
      io.to(`pair:${payload.pair}`).emit('price', payload);
      io.emit('price', payload); // also broadcast globally for simple dashboards
    } else if (channel === CHANNELS.ORDER_EVENTS) {
      io.to(`user:${payload.userId}`).emit('order:update', payload);
    } else if (channel === CHANNELS.TRADE_EVENTS) {
      io.to(`user:${payload.userId}`).emit('trade:settled', payload);
    }
  } catch (err) {
    console.error('[ws] failed to forward message', err);
  }
});

startBinanceFeed();

server.listen(config.port, () => {
  console.log(`[backend-api] listening on port ${config.port}`);
});
