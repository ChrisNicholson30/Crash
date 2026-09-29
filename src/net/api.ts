import { useEffect, useRef, useState } from 'react';
import type { ClientMsg, RoomInfo, ServerMsg } from './protocol.ts';
import type { Match } from '../engine/match.ts';

export interface User {
  id: string;
  username: string;
}

export interface Friend extends User {
  unread: number;
  last: string | null;
}

export interface DirectMessage {
  id: number;
  fromId: string;
  body: string;
  tableId: string | null;
  at: number;
}

async function call<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(path, {
      credentials: 'same-origin',
      ...rest,
      headers: json !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  } catch {
    throw new Error('You’re offline — online play needs a connection');
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

export const api = {
  me: () => call<{ user: User | null; unread?: number }>('/api/me'),
  register: (username: string, password: string) => call<{ user: User }>('/api/auth/register', { method: 'POST', json: { username, password } }),
  login: (username: string, password: string) => call<{ user: User }>('/api/auth/login', { method: 'POST', json: { username, password } }),
  logout: () => call<{ ok: true }>('/api/auth/logout', { method: 'POST', json: {} }),
  friends: () => call<{ friends: Friend[] }>('/api/friends'),
  addFriend: (username: string) => call<{ friend: User }>('/api/friends', { method: 'POST', json: { username } }),
  createInvite: (tableId?: string) => call<{ code: string; url: string }>('/api/invites', { method: 'POST', json: { tableId } }),
  inviteInfo: (code: string) => call<{ from: string; tableId: string | null }>(`/api/invites/${code}`),
  acceptInvite: (code: string) => call<{ friend: User; tableId: string | null }>(`/api/invites/${code}/accept`, { method: 'POST', json: {} }),
  messages: (userId: string, after = 0) => call<{ messages: DirectMessage[] }>(`/api/messages/${userId}?after=${after}`),
  send: (userId: string, body: string, tableId?: string) => call<{ id: number }>(`/api/messages/${userId}`, { method: 'POST', json: { body, tableId } }),
  createTable: (seats: 3 | 4) => call<{ id: string }>('/api/tables', { method: 'POST', json: { seats } }),
};

export interface RoomSnapshot {
  room: RoomInfo;
  me: number | null;
  match: Match | null;
}

/** Live connection to a table, reconnecting with back-off if the line drops. */
export function useRoom(tableId: string | null) {
  const [snap, setSnap] = useState<RoomSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const ws = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!tableId) return;
    let stop = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout>;

    const connect = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const sock = new WebSocket(`${proto}://${location.host}/api/tables/${tableId}/ws`);
      ws.current = sock;
      sock.onopen = () => {
        attempt = 0;
        setConnected(true);
      };
      sock.onmessage = (e) => {
        const msg = JSON.parse(e.data as string) as ServerMsg;
        if (msg.t === 'state') {
          setSnap({ room: msg.room, me: msg.me, match: msg.match });
          setError(null);
        } else setError(msg.message);
      };
      sock.onclose = (e) => {
        setConnected(false);
        if (stop || e.code === 1000) return;
        attempt++;
        if (attempt > 6) {
          setError('Can’t reach the table. Check the code, or that the game hasn’t started without you.');
          return;
        }
        timer = setTimeout(connect, Math.min(8000, 500 * 2 ** attempt));
      };
    };
    connect();
    return () => {
      stop = true;
      clearTimeout(timer);
      ws.current?.close(1000);
    };
  }, [tableId]);

  const send = (msg: ClientMsg) => {
    if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify(msg));
    else setError('Reconnecting…');
  };

  return { snap, error, connected, send, clearError: () => setError(null) };
}
