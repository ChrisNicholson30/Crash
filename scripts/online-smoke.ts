// End-to-end check of the online stack against `wrangler dev` (default http://localhost:8787):
// accounts, friends, messages, invites, then two people and two computer players
// playing live deals over WebSockets. Also checks nobody receives another player's cards.
//
// Run: node --experimental-transform-types --no-warnings scripts/online-smoke.ts [baseUrl] [deals]
import { aiArrange } from '../src/engine/ai.ts';
import { RULES, currentBettor, minBet, type Match } from '../src/engine/match.ts';
import type { ServerMsg } from '../src/net/protocol.ts';

const BASE = process.argv[2] ?? 'http://localhost:8787';
const DEALS = Number(process.argv[3] ?? 3);
const assert = (ok: unknown, msg: string) => {
  if (!ok) throw new Error(`FAILED: ${msg}`);
};

class Client {
  cookie = '';
  constructor(public name: string) {}
  async call<T>(path: string, method = 'GET', body?: unknown): Promise<{ status: number; data: T }> {
    const res = await fetch(BASE + path, {
      method,
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(this.cookie ? { Cookie: this.cookie } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) this.cookie = set.split(';')[0];
    return { status: res.status, data: (await res.json()) as T };
  }
}

const suffix = Math.random().toString(36).slice(2, 7);
const alice = new Client(`alice_${suffix}`);
const bob = new Client(`bob_${suffix}`);

// ---- accounts ----
for (const c of [alice, bob]) {
  const r = await c.call<{ user: { id: string } }>('/api/auth/register', 'POST', { username: c.name, password: 'correct-horse-9' });
  assert(r.status === 201, `register ${c.name}: ${JSON.stringify(r.data)}`);
}
const dup = await new Client('x').call('/api/auth/register', 'POST', { username: alice.name.toUpperCase(), password: 'another-pass-1' });
assert(dup.status === 409, 'usernames are unique regardless of case');
const bad = await new Client('x').call('/api/auth/login', 'POST', { username: alice.name, password: 'wrong-password' });
assert(bad.status === 401, 'wrong password rejected');
const relog = new Client(alice.name);
assert((await relog.call('/api/auth/login', 'POST', { username: alice.name, password: 'correct-horse-9' })).status === 200, 'login works');
const anon = await new Client('x').call('/api/friends');
assert(anon.status === 401, 'friends list needs a login');

// ---- friends, messages, invites ----
const bobMe = (await bob.call<{ user: { id: string } }>('/api/me')).data.user;
const aliceMe = (await alice.call<{ user: { id: string } }>('/api/me')).data.user;
assert((await alice.call(`/api/messages/${bobMe.id}`, 'POST', { body: 'hi' })).status === 403, 'cannot message a non-friend');
const inv = await alice.call<{ code: string; url: string }>('/api/invites', 'POST', {});
assert(inv.status === 201 && inv.data.url.includes(inv.data.code), 'invite link created');
const acc = await bob.call<{ friend: { username: string } }>(`/api/invites/${inv.data.code}/accept`, 'POST', {});
assert(acc.status === 200 && acc.data.friend.username === alice.name, 'invite accepted → friends');
await alice.call(`/api/messages/${bobMe.id}`, 'POST', { body: 'Fancy a game of Crash?' });
const unread = await bob.call<{ unread: number }>('/api/me');
assert(unread.data.unread === 1, 'bob has 1 unread message');
const thread = await bob.call<{ messages: { body: string }[] }>(`/api/messages/${aliceMe.id}`);
assert(thread.data.messages[0]?.body === 'Fancy a game of Crash?', 'bob reads the message');
assert((await bob.call<{ unread: number }>('/api/me')).data.unread === 0, 'reading marks it read');
const xsite = await fetch(BASE + '/api/tables', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Cookie: alice.cookie, Origin: 'https://evil.example' },
  body: '{"seats":4}',
});
assert(xsite.status === 403, 'cross-site POST refused');
console.log('✓ accounts, friends, invites, messages');

// ---- live table ----
const table = await alice.call<{ id: string }>('/api/tables', 'POST', { seats: 4 });
assert(table.status === 201, 'table created');
const tableId = table.data.id;

interface Seat {
  c: Client;
  ws: WebSocket;
  last: Extract<ServerMsg, { t: 'state' }> | null;
  errors: string[];
}

function connect(c: Client): Promise<Seat> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${BASE.replace('http', 'ws')}/api/tables/${tableId}/ws`, { headers: { Cookie: c.cookie } } as never);
    const seat: Seat = { c, ws, last: null, errors: [] };
    ws.onopen = () => resolve(seat);
    ws.onerror = (e) => reject(new Error(`ws error for ${c.name}: ${(e as ErrorEvent).message ?? e}`));
    ws.onmessage = (e) => {
      const msg = JSON.parse(String(e.data)) as ServerMsg;
      if (msg.t === 'error') seat.errors.push(msg.message);
      else seat.last = msg;
    };
  });
}

const A = await connect(alice);
const B = await connect(bob);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
await wait(300);
assert(A.last?.room.members.length === 2, 'both players seated in the lobby');
B.ws.send(JSON.stringify({ t: 'start' }));
await wait(200);
assert(B.errors.some((e) => /host/.test(e)), 'only the host can start');
A.ws.send(JSON.stringify({ t: 'chat', text: 'Good luck!' }));
A.ws.send(JSON.stringify({ t: 'start' }));
await wait(400);
assert(B.last?.room.chat.at(-1)?.text === 'Good luck!', 'table chat delivered');
assert(A.last?.match && B.last?.match, 'match started');

const seatsOf = (s: Seat) => s.last!.me!;
let checkedPrivacy = false;
const deadline = Date.now() + 90_000;
while (Date.now() < deadline) {
  for (const s of [A, B]) {
    const m = s.last?.match as Match | null;
    const me = s.last?.me;
    if (!m || me == null) continue;
    // Privacy: never another seat's dealt cards, never unrevealed opponent hands.
    m.deal.dealt.forEach((cards, seat) => assert(seat === me || cards.length === 0, `${s.c.name} received seat ${seat}'s cards`));
    if (m.phase === 'betting') {
      m.deal.arrangements.forEach((a, seat) => {
        if (seat !== me && a) a.hands.slice(m.deal.results.length).forEach((h) => assert(!h || h[0].rank === 0, `${s.c.name} can see an unrevealed hand of seat ${seat}`));
      });
      checkedPrivacy = true;
    }
    if (m.phase === 'arrange' && m.deal.active.includes(me) && !m.deal.submitted[me]) {
      s.ws.send(JSON.stringify({ t: 'arrange', arrangement: aiArrange(m.deal.dealt[me], m.deal.handCount), crash: false }));
    } else if (m.phase === 'betting' && currentBettor(m) === me) {
      s.ws.send(JSON.stringify({ t: 'bet', amount: Math.max(RULES.minBet, minBet(m, me)) }));
    } else if ((m.phase === 'reveal' || m.phase === 'dealEnd') && !s.last!.room.ready.includes(s.c === alice ? aliceMe.id : bobMe.id)) {
      s.ws.send(JSON.stringify({ t: 'next' }));
    }
  }
  const m = A.last?.match;
  if (m && (m.deal.number > DEALS || m.phase === 'gameOver')) break;
  await wait(150);
}
const final = A.last!.match!;
assert(final.deal.number > DEALS || final.phase === 'gameOver', `played ${DEALS} deals (got to deal ${final.deal.number}, phase ${final.phase})`);
assert(checkedPrivacy, 'privacy checked during betting');
const total = final.players.reduce((s, p) => s + p.tokens, 0);
// Tokens only move between players, except a successful Crash, which adds the set pot.
const potsPaid = RULES.setPot * (final.setNumber - 1) + (RULES.setPot - final.setPot);
assert(total === 4 * RULES.startTokens + potsPaid, `tokens conserved (${total})`);
assert(seatsOf(A) !== seatsOf(B), 'different seats');
const unexpected = [...A.errors, ...B.errors].filter((e) => !/host/.test(e));
assert(unexpected.length === 0, `no errors during play: ${unexpected.join('; ')}`);
console.log(`✓ live table ${tableId}: ${final.deal.number - 1} deals, players ${final.players.map((p) => `${p.name}${p.isHuman ? '*' : ''}=${p.tokens}`).join(', ')}`);
A.ws.close(1000);
B.ws.close(1000);
console.log('ALL ONLINE CHECKS PASSED');
process.exit(0);
