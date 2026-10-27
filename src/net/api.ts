import { useEffect, useRef, useState } from 'react';
import type { ClientMsg, RoomInfo, ServerMsg } from './protocol.ts';
import type { Match } from '../engine/match.ts';
import type { Tally } from '../engine/tally.ts';

export interface User {
  id: string;
  username: string;
}

export interface Friend extends User {
  unread: number;
  last: string | null;
  /** When they last had the app open (ms), or null. */
  lastSeen: number | null;
  /** A game they're seated at right now. */
  playingAt: string | null;
}

export interface OpenTable {
  id: string;
  seats: number;
  status: 'lobby' | 'playing';
  createdAt: number;
  host: string;
  people: number;
}

export interface TableInfo {
  id: string;
  seats: number;
  status: 'lobby' | 'playing' | 'done';
  host: string;
  people: number;
  seated: boolean;
}

export interface BoardRow extends User {
  games: number;
  wins: number;
  legs: number;
  crashes: number;
  crashesWon: number;
}

/** A friend asked you to their table (an unread table message from the last hour). */
export interface TableInvite {
  id: number;
  from: string;
  tableId: string;
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
  me: () => call<{ user: User | null; unread?: number; invites?: TableInvite[] }>('/api/me'),
  register: (username: string, password: string) => call<{ user: User }>('/api/auth/register', { method: 'POST', json: { username, password } }),
  login: (username: string, password: string) => call<{ user: User }>('/api/auth/login', { method: 'POST', json: { username, password } }),
  logout: () => call<{ ok: true }>('/api/auth/logout', { method: 'POST', json: {} }),
  friends: () => call<{ friends: Friend[]; now: number }>('/api/friends'),
  myTables: () => call<{ tables: OpenTable[] }>('/api/tables'),
  tableInfo: (id: string) => call<{ table: TableInfo }>(`/api/tables/${id}`),
  myStats: () => call<{ stats: Tally }>('/api/stats/me'),
  leaderboard: () => call<{ players: BoardRow[] }>('/api/leaderboard'),
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

export type Link = 'connecting' | 'open' | 'retrying';

/**
 * Live connection to a table. Keeps trying (with back-off) while the screen
 * is open, reconnects straight away when the phone wakes or the network comes
 * back, and sends a heartbeat so a dead line is noticed.
 */
export function useRoom(tableId: string | null) {
  const [snap, setSnap] = useState<RoomSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<Link>('connecting');
  const ws = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!tableId) return;
    let stop = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let heard = Date.now();
    const snapRef = { current: null as RoomSnapshot | null };

    const connect = async () => {
      clearTimeout(timer);
      if (stop || (ws.current && ws.current.readyState <= WebSocket.OPEN)) return;
      // First time in: check the code, so a wrong one gets a clear message instead of endless retries.
      if (attempt === 0 && !snapRef.current) {
        try {
          await api.tableInfo(tableId);
        } catch (e) {
          const msg = (e as Error).message;
          if (!/offline/.test(msg)) {
            setError(msg);
            return;
          }
        }
        if (stop) return;
      }
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const sock = new WebSocket(`${proto}://${location.host}/api/tables/${tableId}/ws`);
      ws.current = sock;
      sock.onopen = () => {
        attempt = 0;
        heard = Date.now();
        setLink('open');
        setError(null);
      };
      sock.onmessage = (e) => {
        heard = Date.now();
        if (e.data === 'pong') return;
        const msg = JSON.parse(e.data as string) as ServerMsg;
        if (msg.t === 'state') {
          snapRef.current = { room: msg.room, me: msg.me, match: msg.match };
          setSnap(snapRef.current);
          setError(null);
        } else setError(msg.message);
      };
      sock.onclose = (e) => {
        if (ws.current === sock) ws.current = null;
        if (stop || e.code === 1000) return;
        setLink('retrying');
        attempt++;
        timer = setTimeout(connect, Math.min(10_000, 400 * 2 ** Math.min(attempt, 5)));
      };
    };
    // Wake-ups and network changes: try again now rather than waiting out the back-off.
    const nudge = () => {
      if (document.visibilityState !== 'visible') return;
      const sock = ws.current;
      if (!sock || sock.readyState > WebSocket.OPEN) {
        attempt = Math.min(attempt, 1);
        void connect();
      } else if (sock.readyState === WebSocket.OPEN) sock.send('ping');
    };
    const beat = setInterval(() => {
      const sock = ws.current;
      if (sock?.readyState !== WebSocket.OPEN) return;
      // Nothing heard for a while: the line is dead even if the browser hasn't noticed.
      if (Date.now() - heard > 45_000) sock.close(4000, 'No heartbeat');
      else sock.send('ping');
    }, 15_000);

    void connect();
    document.addEventListener('visibilitychange', nudge);
    window.addEventListener('online', nudge);
    window.addEventListener('focus', nudge);
    return () => {
      stop = true;
      clearTimeout(timer);
      clearInterval(beat);
      document.removeEventListener('visibilitychange', nudge);
      window.removeEventListener('online', nudge);
      window.removeEventListener('focus', nudge);
      ws.current?.close(1000);
      ws.current = null;
    };
  }, [tableId]);

  const send = (msg: ClientMsg) => {
    if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify(msg));
    else setError('Reconnecting… try again in a moment');
  };

  return { snap, error, connected: link === 'open', link, send, clearError: () => setError(null) };
}
