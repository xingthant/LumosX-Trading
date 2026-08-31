import { io, Socket } from 'socket.io-client';
import { API_URL } from './config';
import { getStoredUser } from './api';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(API_URL, { transports: ['websocket'], autoConnect: true });
  }
  return socket;
}

export function subscribeToPairs(pairs: string[]) {
  getSocket().emit('subscribe', pairs);
}

export async function subscribeToOrders() {
  const user = await getStoredUser<{ id: string }>();
  if (user?.id) getSocket().emit('subscribe:orders', user.id);
}
