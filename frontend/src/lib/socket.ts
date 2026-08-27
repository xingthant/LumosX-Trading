import { io, Socket } from 'socket.io-client';
import { getToken } from './api';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:4000';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(WS_URL, { transports: ['websocket'], autoConnect: true });
  }
  return socket;
}

export function subscribeToPairs(pairs: string[]) {
  getSocket().emit('subscribe', pairs);
}

export function subscribeToOrders() {
  const token = getToken();
  if (!token) return;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    getSocket().emit('subscribe:orders', payload.id);
  } catch {
    // ignore malformed token
  }
}
