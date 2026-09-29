import {
  clearCookie,
  createSession,
  currentUser,
  endSession,
  hashPassword,
  randomCode,
  safeEqual,
  sessionCookie,
  type SessionUser,
} from './auth.ts';

export { GameRoom } from './room.ts';

export interface Env {
  DB: D1Database;
  TABLES: DurableObjectNamespace;
  ASSETS: Fetcher;
}

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const json = (data: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...(init.headers ?? {}) },
  });

const USERNAME = /^[A-Za-z0-9_]{3,20}$/;

async function body<T>(req: Request): Promise<T> {
  if (!(req.headers.get('Content-Type') ?? '').includes('application/json')) throw new HttpError(415, 'Send JSON');
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, 'Bad JSON');
  }
}

async function requireUser(env: Env, req: Request): Promise<SessionUser> {
  const user = await currentUser(env.DB, req);
  if (!user) throw new HttpError(401, 'Please log in');
  return user;
}

async function areFriends(env: Env, a: string, b: string): Promise<boolean> {
  return !!(await env.DB.prepare('SELECT 1 FROM friends WHERE user_id = ? AND friend_id = ?').bind(a, b).first());
}

async function befriend(env: Env, a: string, b: string) {
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO friends (user_id, friend_id, created_at) VALUES (?, ?, ?)').bind(a, b, now),
    env.DB.prepare('INSERT OR IGNORE INTO friends (user_id, friend_id, created_at) VALUES (?, ?, ?)').bind(b, a, now),
  ]);
}

function roomStub(env: Env, tableId: string) {
  return env.TABLES.get(env.TABLES.idFromName(tableId));
}

async function route(req: Request, env: Env, url: URL): Promise<Response> {
  const path = url.pathname.replace(/\/+$/, '');
  const method = req.method;
  const secure = url.protocol === 'https:';

  // Block cross-site writes: browsers always send Origin on POST.
  if (method !== 'GET' && method !== 'HEAD') {
    const origin = req.headers.get('Origin');
    if (origin && new URL(origin).host !== url.host) throw new HttpError(403, 'Cross-site request refused');
  }

  // ---- auth ----
  if (path === '/api/auth/register' && method === 'POST') {
    const { username, password } = await body<{ username?: string; password?: string }>(req);
    if (!username || !USERNAME.test(username)) throw new HttpError(400, 'Username: 3–20 letters, numbers or _');
    if (!password || password.length < 8 || password.length > 200) throw new HttpError(400, 'Password: at least 8 characters');
    const taken = await env.DB.prepare('SELECT 1 FROM users WHERE username = ?').bind(username).first();
    if (taken) throw new HttpError(409, 'That username is taken');
    const id = crypto.randomUUID();
    const { hash, salt } = await hashPassword(password);
    await env.DB.prepare('INSERT INTO users (id, username, pass_hash, salt, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(id, username, hash, salt, Date.now())
      .run();
    const token = await createSession(env.DB, id);
    return json({ user: { id, username } }, { status: 201, headers: { 'Set-Cookie': sessionCookie(token, secure) } });
  }

  if (path === '/api/auth/login' && method === 'POST') {
    const { username, password } = await body<{ username?: string; password?: string }>(req);
    const row = await env.DB.prepare('SELECT id, username, pass_hash, salt FROM users WHERE username = ?')
      .bind(username ?? '')
      .first<{ id: string; username: string; pass_hash: string; salt: string }>();
    // Hash even for unknown users so response time doesn't reveal which usernames exist.
    const { hash } = await hashPassword(password ?? '', row?.salt);
    if (!row || !safeEqual(hash, row.pass_hash)) throw new HttpError(401, 'Wrong username or password');
    const token = await createSession(env.DB, row.id);
    return json({ user: { id: row.id, username: row.username } }, { headers: { 'Set-Cookie': sessionCookie(token, secure) } });
  }

  if (path === '/api/auth/logout' && method === 'POST') {
    await endSession(env.DB, req);
    return json({ ok: true }, { headers: { 'Set-Cookie': clearCookie(secure) } });
  }

  if (path === '/api/me' && method === 'GET') {
    const user = await currentUser(env.DB, req);
    if (!user) return json({ user: null });
    const unread = await env.DB.prepare('SELECT COUNT(*) AS n FROM messages WHERE to_user = ? AND read_at IS NULL')
      .bind(user.id)
      .first<{ n: number }>();
    return json({ user, unread: unread?.n ?? 0 });
  }

  // Everything below needs a signed-in player.
  const me = await requireUser(env, req);

  // ---- friends ----
  if (path === '/api/friends' && method === 'GET') {
    const { results } = await env.DB.prepare(
      `SELECT u.id, u.username,
         (SELECT COUNT(*) FROM messages m WHERE m.from_user = u.id AND m.to_user = ?1 AND m.read_at IS NULL) AS unread,
         (SELECT body FROM messages m WHERE (m.from_user = u.id AND m.to_user = ?1) OR (m.from_user = ?1 AND m.to_user = u.id) ORDER BY m.id DESC LIMIT 1) AS last,
         (SELECT MAX(id) FROM messages m WHERE (m.from_user = u.id AND m.to_user = ?1) OR (m.from_user = ?1 AND m.to_user = u.id)) AS last_id
       FROM friends f JOIN users u ON u.id = f.friend_id
       WHERE f.user_id = ?1
       ORDER BY last_id IS NULL, last_id DESC, u.username`,
    )
      .bind(me.id)
      .all();
    return json({ friends: results });
  }

  if (path === '/api/friends' && method === 'POST') {
    const { username } = await body<{ username?: string }>(req);
    const other = await env.DB.prepare('SELECT id, username FROM users WHERE username = ?').bind(username ?? '').first<SessionUser>();
    if (!other) throw new HttpError(404, 'No player with that username');
    if (other.id === me.id) throw new HttpError(400, "That's you!");
    await befriend(env, me.id, other.id);
    return json({ friend: other }, { status: 201 });
  }

  // ---- invites ----
  if (path === '/api/invites' && method === 'POST') {
    const { tableId } = await body<{ tableId?: string }>(req);
    const code = randomCode(8);
    await env.DB.prepare('INSERT INTO invites (code, from_user, table_id, created_at) VALUES (?, ?, ?, ?)')
      .bind(code, me.id, tableId ?? null, Date.now())
      .run();
    return json({ code, url: `${url.origin}/?invite=${code}` }, { status: 201 });
  }

  const invite = path.match(/^\/api\/invites\/([A-Z0-9]{8})(\/accept)?$/);
  if (invite) {
    const row = await env.DB.prepare(
      'SELECT i.code, i.table_id AS tableId, u.id AS fromId, u.username AS fromName FROM invites i JOIN users u ON u.id = i.from_user WHERE i.code = ?',
    )
      .bind(invite[1])
      .first<{ code: string; tableId: string | null; fromId: string; fromName: string }>();
    if (!row) throw new HttpError(404, 'That invite link has expired');
    if (!invite[2] && method === 'GET') return json({ from: row.fromName, tableId: row.tableId });
    if (invite[2] && method === 'POST') {
      if (row.fromId !== me.id) {
        await befriend(env, me.id, row.fromId);
        await env.DB.prepare('UPDATE invites SET uses = uses + 1 WHERE code = ?').bind(row.code).run();
      }
      return json({ friend: { id: row.fromId, username: row.fromName }, tableId: row.tableId });
    }
  }

  // ---- messages ----
  const thread = path.match(/^\/api\/messages\/([0-9a-f-]{36})$/);
  if (thread) {
    const other = thread[1];
    if (!(await areFriends(env, me.id, other))) throw new HttpError(403, 'You can only message friends');
    if (method === 'GET') {
      const after = Number(url.searchParams.get('after') ?? 0) || 0;
      const { results } = await env.DB.prepare(
        `SELECT id, from_user AS fromId, body, table_id AS tableId, created_at AS at FROM messages
         WHERE id > ?3 AND ((from_user = ?1 AND to_user = ?2) OR (from_user = ?2 AND to_user = ?1))
         ORDER BY id DESC LIMIT 100`,
      )
        .bind(me.id, other, after)
        .all();
      await env.DB.prepare('UPDATE messages SET read_at = ? WHERE from_user = ? AND to_user = ? AND read_at IS NULL').bind(Date.now(), other, me.id).run();
      return json({ messages: results.reverse() });
    }
    if (method === 'POST') {
      const { body: text, tableId } = await body<{ body?: string; tableId?: string }>(req);
      const clean = (text ?? '').trim().slice(0, 1000);
      if (!clean) throw new HttpError(400, 'Message is empty');
      const res = await env.DB.prepare('INSERT INTO messages (from_user, to_user, body, table_id, created_at) VALUES (?, ?, ?, ?, ?)')
        .bind(me.id, other, clean, tableId ?? null, Date.now())
        .run();
      return json({ id: res.meta.last_row_id }, { status: 201 });
    }
  }

  // ---- tables (live games) ----
  if (path === '/api/tables' && method === 'POST') {
    const { seats } = await body<{ seats?: number }>(req);
    if (seats !== 3 && seats !== 4) throw new HttpError(400, 'Tables have 3 or 4 seats');
    // Pairing code: 6 characters from 32 (≈1 billion combinations); retry on the rare clash.
    let id = randomCode(6);
    for (let tries = 0; await env.DB.prepare('SELECT 1 FROM game_tables WHERE id = ?').bind(id).first(); tries++) {
      if (tries > 5) throw new HttpError(503, 'Could not find a free table code — try again');
      id = randomCode(6);
    }
    const res = await roomStub(env, id).fetch('https://room/init', {
      method: 'POST',
      body: JSON.stringify({ id, host: me, seats }),
    });
    if (!res.ok) throw new HttpError(500, 'Could not open a table');
    await env.DB.prepare('INSERT INTO game_tables (id, host, seats, status, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(id, me.id, seats, 'lobby', Date.now())
      .run();
    return json({ id }, { status: 201 });
  }

  const ws = path.match(/^\/api\/tables\/([A-Z0-9]{6})\/ws$/);
  if (ws && method === 'GET') {
    if (req.headers.get('Upgrade')?.toLowerCase() !== 'websocket') throw new HttpError(426, 'Expected a WebSocket');
    const exists = await env.DB.prepare('SELECT 1 FROM game_tables WHERE id = ?').bind(ws[1]).first();
    if (!exists) throw new HttpError(404, 'No table with that code');
    const headers = new Headers(req.headers);
    headers.set('X-User-Id', me.id);
    headers.set('X-Username', me.username);
    return roomStub(env, ws[1]).fetch(new Request(req.url, { headers }));
  }

  throw new HttpError(404, 'Not found');
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    try {
      return await route(req, env, url);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, { status: e.status });
      console.error(e);
      return json({ error: 'Something went wrong' }, { status: 500 });
    }
  },
} satisfies ExportedHandler<Env>;
