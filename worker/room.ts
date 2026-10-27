import { DurableObject } from 'cloudflare:workers';
import {
  actForSeat,
  advance,
  botNames,
  currentBettor,
  newMatchWith,
  placeBetFor,
  placeCrashFor,
  resumeMatch,
  submitArrangement,
  DEFAULT_OPTIONS,
  LENGTHS,
  SKILLS,
  type Match,
  type MatchOptions,
} from '../src/engine/match.ts';
import { viewFor } from '../src/engine/view.ts';
import { dealTally } from '../src/engine/tally.ts';
import { handValue } from '../src/engine/hands.ts';
import type { ChatLine, ClientMsg, Member, RoomInfo, ServerMsg } from '../src/net/protocol.ts';
import type { Env } from './index.ts';

interface RoomState {
  id: string;
  host: Member;
  seats: 3 | 4;
  status: RoomInfo['status'];
  members: Member[];
  match: Match | null;
  ready: string[];
  deadline: number | null;
  chat: ChatLine[];
  recorded: boolean;
  /** Identifies what the current deadline is waiting for. */
  waitKey: string | null;
  /** Missing on tables opened before options existed. */
  options?: MatchOptions;
  /** Connected people who aren't seated. */
  watchers?: Member[];
  /** Last finished deal counted towards players' records. */
  tallied?: string;
}

/** Seconds the server waits before acting for someone. */
const TIMEOUT = { arrange: 120, betting: 45, reveal: 25, dealEnd: 40, away: 8 };

/**
 * One live Crash table. Holds the authoritative match, talks to each player
 * over a hibernating WebSocket, and sends each of them only what their seat
 * is allowed to see.
 */
export class GameRoom extends DurableObject<Env> {
  private room: RoomState | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Heartbeats are answered without waking the table.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    ctx.blockConcurrencyWhile(async () => {
      this.room = (await ctx.storage.get<RoomState>('room')) ?? null;
      if (this.room?.match) {
        const resumed = resumeMatch(this.room.match);
        if (resumed !== this.room.match) {
          this.room.match = resumed;
          this.room.ready = [];
          await this.afterChange();
        }
      }
    });
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/init' && req.method === 'POST') {
      if (!this.room) {
        const { id, host, seats } = (await req.json()) as { id: string; host: Member; seats: 3 | 4 };
        this.room = { id, host, seats, status: 'lobby', members: [host], match: null, ready: [], deadline: null, chat: [], recorded: false, waitKey: null };
        await this.save();
      }
      return new Response('ok');
    }

    const room = this.room;
    const userId = req.headers.get('X-User-Id');
    const username = req.headers.get('X-Username');
    if (!room || !userId || !username) return new Response('No such table', { status: 404 });

    // Anyone with the code can sit down while there's a seat in the lobby; otherwise they watch.
    if (!room.members.some((m) => m.id === userId)) {
      if (room.status === 'lobby' && room.members.length < room.seats) {
        room.members.push({ id: userId, username });
        await this.env.DB.prepare('INSERT OR IGNORE INTO table_members (table_id, user_id, joined_at) VALUES (?, ?, ?)')
          .bind(room.id, userId, Date.now())
          .run();
      } else {
        const watchers = room.watchers ?? [];
        if (!watchers.some((w) => w.id === userId)) room.watchers = [...watchers, { id: userId, username }];
      }
    }

    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1], [userId]);
    await this.save();
    this.broadcast();
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    const userId = this.ctx.getTags(ws)[0];
    const room = this.room;
    if (!room || !userId) return;
    try {
      const msg = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw)) as ClientMsg;
      this.handle(room, userId, msg);
      await this.afterChange();
    } catch (e) {
      this.send(ws, { t: 'error', message: (e as Error).message || 'Something went wrong' });
    }
  }

  async webSocketClose(ws: WebSocket) {
    ws.close();
    const room = this.room;
    if (room?.watchers) {
      const online = this.onlineIds(ws);
      room.watchers = room.watchers.filter((w) => online.includes(w.id));
    }
    await this.afterChange();
  }

  async alarm() {
    const room = this.room;
    if (!room?.match || !room.deadline) return;
    if (Date.now() + 500 < room.deadline) {
      await this.schedule();
      return;
    }
    room.match = this.timeout(room.match);
    room.ready = [];
    await this.afterChange();
  }

  // ---------- game actions ----------

  private seatOf(userId: string): number {
    return this.room?.match?.players.findIndex((p) => p.id === userId) ?? -1;
  }

  private handle(room: RoomState, userId: string, msg: ClientMsg) {
    const seat = this.seatOf(userId);
    switch (msg.t) {
      case 'chat': {
        const text = String(msg.text ?? '').trim().slice(0, 300);
        if (!text) return;
        const name = [...room.members, ...(room.watchers ?? [])].find((m) => m.id === userId)?.username ?? '?';
        const last = room.chat.at(-1)?.id ?? 0;
        room.chat = [...room.chat, { id: last + 1, from: userId, name, text, at: Date.now() }].slice(-60);
        return;
      }
      case 'leave':
        if (room.status !== 'lobby') throw new Error('The game is under way');
        room.members = room.members.filter((m) => m.id !== userId);
        room.watchers = (room.watchers ?? []).filter((m) => m.id !== userId);
        if (room.host.id === userId && room.members[0]) room.host = room.members[0];
        void this.env.DB.prepare('DELETE FROM table_members WHERE table_id = ? AND user_id = ?').bind(room.id, userId).run();
        for (const ws of this.ctx.getWebSockets(userId)) ws.close(1000, 'Left the table');
        return;
      case 'options': {
        if (room.host.id !== userId) throw new Error('Only the host can change the game');
        if (room.status !== 'lobby') throw new Error('The game has started');
        const { length, skill } = msg.options ?? {};
        if (!(length in LENGTHS) || !(skill in SKILLS)) throw new Error('Unknown game option');
        room.options = { length, skill };
        return;
      }
      case 'start':
      case 'rematch': {
        if (room.host.id !== userId) throw new Error('Only the host can start');
        if (msg.t === 'start' && room.status !== 'lobby') throw new Error('Already started');
        if (msg.t === 'rematch' && room.status !== 'done') throw new Error('The game is still going');
        const people = room.members.slice(0, room.seats);
        const bots = botNames(
          people.map((p) => p.username),
          room.seats - people.length,
        ).map((name) => ({ name, isHuman: false }));
        room.match = newMatchWith(
          [...people.map((p) => ({ name: p.username, isHuman: true, id: p.id })), ...bots],
          Math.random,
          room.options ?? DEFAULT_OPTIONS,
        );
        room.tallied = undefined;
        room.status = 'playing';
        room.recorded = false;
        room.ready = [];
        void this.env.DB.prepare('UPDATE game_tables SET status = ? WHERE id = ?').bind('playing', room.id).run();
        return;
      }
    }

    const m = room.match;
    if (!m || room.status !== 'playing') throw new Error('The game has not started');
    if (seat < 0) throw new Error('You are not seated at this table');
    switch (msg.t) {
      case 'arrange':
        room.match = submitArrangement(m, seat, msg.arrangement, false);
        return;
      case 'bet':
        room.match = placeBetFor(m, seat, Number(msg.amount) || 0);
        return;
      case 'crash':
        room.match = placeCrashFor(m, seat, Number(msg.amount) || 0);
        return;
      case 'next': {
        if (m.phase !== 'reveal' && m.phase !== 'dealEnd') return;
        if (!room.ready.includes(userId)) room.ready.push(userId);
        const online = this.onlineIds();
        const waiting = m.players.filter((p) => p.isHuman && p.id && online.includes(p.id) && !room.ready.includes(p.id));
        if (!waiting.length) {
          room.match = advance(m);
          room.ready = [];
        }
        return;
      }
    }
  }

  /** Acts for whoever the table is waiting on once their time is up. */
  private timeout(m: Match): Match {
    if (m.phase === 'arrange') {
      let x = m;
      for (const s of m.deal.active) if (x.players[s].isHuman && !x.deal.submitted[s]) x = actForSeat(x, s);
      return x;
    }
    if (m.phase === 'betting') {
      const s = currentBettor(m);
      return s === null ? m : actForSeat(m, s);
    }
    if (m.phase === 'reveal' || m.phase === 'dealEnd') return advance(m);
    return m;
  }

  // ---------- plumbing ----------

  /** People with an open connection (leaving out a socket that is closing). */
  private onlineIds(closing?: WebSocket): string[] {
    return [...new Set(this.ctx.getWebSockets().flatMap((ws) => (ws === closing ? [] : this.ctx.getTags(ws))))];
  }

  /** Adds each finished deal (and game) to the seated people's online records, once. */
  private async tally(room: RoomState, m: Match) {
    if (m.phase !== 'dealEnd' && m.phase !== 'gameOver') return;
    const key = `${m.id ?? room.id}:${m.deal.number}`;
    if (room.tallied === key) return;
    room.tallied = key;
    const over = m.phase === 'gameOver';
    const now = Date.now();
    const rows = m.players.flatMap((p, seat) => {
      if (!p.isHuman || !p.id) return [];
      const t = dealTally(m, seat);
      const won = over && m.winner === seat ? 1 : 0;
      return [
        this.env.DB.prepare(
          `INSERT INTO player_stats (user_id, games, wins, deals, points, legs, sets, crashes, crashes_won, pots, streak, best_streak, best_value, best_cards, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?3, ?3, ?11, ?12, ?13)
           ON CONFLICT (user_id) DO UPDATE SET
             games = games + ?2, wins = wins + ?3, deals = deals + ?4, points = points + ?5, legs = legs + ?6, sets = sets + ?7,
             crashes = crashes + ?8, crashes_won = crashes_won + ?9, pots = pots + ?10,
             streak = CASE WHEN ?2 = 0 THEN streak WHEN ?3 > 0 THEN streak + 1 ELSE 0 END,
             best_streak = MAX(best_streak, CASE WHEN ?2 = 0 THEN streak WHEN ?3 > 0 THEN streak + 1 ELSE 0 END),
             best_cards = CASE WHEN ?11 > best_value THEN ?12 ELSE best_cards END,
             best_value = MAX(best_value, ?11),
             updated_at = ?13`,
        ).bind(
          p.id,
          over ? 1 : 0,
          won,
          t.deals ?? 0,
          t.points ?? 0,
          t.legs ?? 0,
          t.sets ?? 0,
          t.crashes ?? 0,
          t.crashesWon ?? 0,
          t.pots ?? 0,
          handValue(t.best ?? null),
          t.best ? JSON.stringify(t.best) : null,
          now,
        ),
      ];
    });
    if (rows.length) await this.env.DB.batch(rows).catch((e) => console.error('tally failed', e));
  }

  private async afterChange() {
    const room = this.room!;
    const m = room.match;
    if (m) await this.tally(room, m);
    if (m?.phase === 'gameOver' && !room.recorded) {
      room.status = 'done';
      room.recorded = true;
      const winner = m.winner !== null ? m.players[m.winner].name : null;
      await this.env.DB.prepare('UPDATE game_tables SET status = ?, finished_at = ?, winner = ? WHERE id = ?')
        .bind('done', Date.now(), winner, room.id)
        .run();
    }
    await this.schedule();
    await this.save();
    this.broadcast();
  }

  /**
   * Sets the next deadline. The clock restarts whenever what we're waiting for
   * changes; it shortens to a few seconds when everyone we're waiting on has left.
   */
  private async schedule() {
    const room = this.room!;
    const m = room.match;
    let secs: number | null = null;
    let waitingOn: string[] = [];
    if (m && room.status === 'playing') {
      if (m.phase === 'arrange') {
        secs = TIMEOUT.arrange;
        waitingOn = m.deal.active.filter((s) => m.players[s].isHuman && !m.deal.submitted[s]).map((s) => m.players[s].id!);
      } else if (m.phase === 'betting') {
        secs = TIMEOUT.betting;
        const s = currentBettor(m);
        waitingOn = s === null ? [] : [m.players[s].id!];
      } else if (m.phase === 'reveal' || m.phase === 'dealEnd') {
        secs = m.phase === 'reveal' ? TIMEOUT.reveal : TIMEOUT.dealEnd;
        waitingOn = m.players.filter((p) => p.isHuman && p.id && !room.ready.includes(p.id)).map((p) => p.id!);
      }
    }
    if (secs === null || !m) {
      room.deadline = null;
      room.waitKey = null;
      await this.ctx.storage.deleteAlarm();
      return;
    }
    const key = `${m.deal.number}:${m.phase}:${m.deal.position}:${waitingOn.join(',')}`;
    const now = Date.now();
    if (key !== room.waitKey || !room.deadline) {
      room.waitKey = key;
      room.deadline = now + secs * 1000;
    }
    const online = this.onlineIds();
    if (!waitingOn.some((id) => online.includes(id))) room.deadline = Math.min(room.deadline, now + TIMEOUT.away * 1000);
    await this.ctx.storage.setAlarm(room.deadline);
  }

  private async save() {
    await this.ctx.storage.put('room', this.room);
  }

  private send(ws: WebSocket, msg: ServerMsg) {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      /* socket already closed */
    }
  }

  private broadcast() {
    const room = this.room;
    if (!room) return;
    const info: RoomInfo = {
      id: room.id,
      host: room.host,
      seats: room.seats,
      status: room.status,
      members: room.members,
      online: this.onlineIds(),
      ready: room.ready,
      deadline: room.deadline,
      chat: room.chat,
      options: room.options ?? DEFAULT_OPTIONS,
      watchers: room.watchers ?? [],
    };
    for (const ws of this.ctx.getWebSockets()) {
      const seat = this.seatOf(this.ctx.getTags(ws)[0]);
      this.send(ws, {
        t: 'state',
        room: info,
        me: seat >= 0 ? seat : null,
        match: room.match ? viewFor(room.match, seat) : null,
      });
    }
  }
}
