import type { Arrangement, Match } from '../engine/match.ts';

export interface Member {
  id: string;
  username: string;
}

export interface ChatLine {
  id: number;
  from: string;
  name: string;
  text: string;
  at: number;
}

export interface RoomInfo {
  id: string;
  host: Member;
  seats: 3 | 4;
  status: 'lobby' | 'playing' | 'done';
  members: Member[];
  /** Member ids with an open connection. */
  online: string[];
  /** Member ids who have tapped "next" on the current reveal / summary. */
  ready: string[];
  /** When the server will act for anyone still deciding (ms since epoch). */
  deadline: number | null;
  chat: ChatLine[];
}

/** Server → client. */
export type ServerMsg =
  | { t: 'state'; room: RoomInfo; me: number | null; match: Match | null }
  | { t: 'error'; message: string };

/** Client → server. */
export type ClientMsg =
  | { t: 'start' }
  | { t: 'arrange'; arrangement: Arrangement }
  | { t: 'bet'; amount: number }
  | { t: 'crash'; amount: number }
  | { t: 'next' }
  | { t: 'chat'; text: string }
  | { t: 'leave' }
  | { t: 'rematch' };
