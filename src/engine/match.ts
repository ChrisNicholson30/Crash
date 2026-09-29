import { makeDeck, sameCard, shuffle, type Card, type Rng } from './cards.ts';
import { handValue, isPlayable } from './hands.ts';
import { aiArrange, aiBet, aiCallsCrash } from './ai.ts';

export const RULES = {
  pointsPerLeg: 10,
  legsPerSet: 3,
  setsToWin: 3,
  startTokens: 10_000,
  /** A player whose balance reaches -debtLimit is out. */
  debtLimit: 5000,
  /** The opening stake is used on every playable hand (or whatever credit is left). */
  minBet: 100,
  /** Minimum opening stake for a player who calls Crash. */
  crashMinBet: 500,
  /** Crash settles at this multiple of the loser's bets for the deal. */
  crashMultiplier: 2,
  /** Pot for each set, won by a successful Crash; refills when a new set starts. */
  setPot: 100_000,
} as const;

/** Cards dealt and hands made, by number of players still in. */
export function tableLayout(activeCount: number): { cards: number; hands: number } {
  return activeCount === 3 ? { cards: 17, hands: 5 } : { cards: 13, hands: 4 };
}

/** A hand of 3 cards, or null for a declined hand. */
export type Hand = Card[] | null;

export interface Arrangement {
  /** Hand 1 (strongest) first. Declined hands (null) can only come last. */
  hands: Hand[];
  /** Thrown away; no effect. */
  spares: Card[];
}

export interface Player {
  name: string;
  isHuman: boolean;
  /** Account id for online players. */
  id?: string;
  tokens: number;
  out: boolean;
  /** Missed a Crash: sits out the rest of the current leg. */
  sittingOut: boolean;
}

export interface PositionResult {
  position: number;
  /** Hand value per player; -1 declined; null not in this deal. */
  values: (number | null)[];
  points: number[];
  bets: number[];
  pot: number;
  potWinners: number[];
  /** Net token change per player for this hand's pot. */
  tokenDelta: number[];
}

export interface Transfer {
  from: number;
  to: number;
  amount: number;
}

export interface CrashResult {
  player: number;
  success: boolean;
  transfers: Transfer[];
  /** Set pot won (success only). */
  setPot: number;
}

export interface DealState {
  number: number;
  dealer: number;
  /** Seats playing this deal, in seat order. */
  active: number[];
  handCount: number;
  /** Cards per seat ([] for seats not playing). */
  dealt: Card[][];
  arrangements: (Arrangement | null)[];
  /** Human seats that have locked in their hands this deal. */
  submitted: boolean[];
  crash: boolean[];
  /** 0 for an opening Crash call, or null. */
  crashFrom: (number | null)[];
  /** The hand currently being bet on / revealed. */
  position: number;
  /** Seats in betting order for this deal (starts left of the dealer). */
  betOrder: number[];
  /** bets[position][seat]; row 0 is chosen at the opening, later rows reuse that stake. */
  bets: (number | null)[][];
  results: PositionResult[];
  crashResults: CrashResult[];
  pointsThisDeal: number[];
  tokensAtStart: number[];
}

export interface DealOutcome {
  legWinner: number | null;
  setWinner: number | null;
  gameWinner: number | null;
  eliminated: number[];
  /** Top score tied at or over the target, so the leg continues. */
  legTied: boolean;
}

export type Phase = 'arrange' | 'betting' | 'reveal' | 'dealEnd' | 'gameOver';

export interface Match {
  version: 3;
  players: Player[];
  /** Points in the current leg. */
  points: number[];
  /** Legs won in the current set. */
  legs: number[];
  sets: number[];
  setNumber: number;
  legNumber: number;
  /** Tokens waiting for the next successful Crash this set. */
  setPot: number;
  phase: Phase;
  deal: DealState;
  outcome: DealOutcome | null;
  /** Seat that won the match, or null (e.g. the human went out). */
  winner: number | null;
}

export const HUMAN = 0;
const AI_NAMES = ['Ava', 'Ben', 'Cal'];

// ---------- set-up ----------

export function newMatch(playerCount: 3 | 4, humanName = 'You', rng: Rng = Math.random): Match {
  return newMatchWith(
    [{ name: humanName, isHuman: true }, ...AI_NAMES.slice(0, playerCount - 1).map((name) => ({ name, isHuman: false }))],
    rng,
  );
}

/** Computer players' names, skipping any already taken at the table. */
export function botNames(taken: string[], count: number): string[] {
  const pool = [...AI_NAMES, 'Dot', 'Eli', 'Fay'].filter((n) => !taken.some((t) => t.toLowerCase() === n.toLowerCase()));
  return pool.slice(0, count);
}

/** A match for any mix of people and computer players (3 or 4 seats). Tokens start fresh every game. */
export function newMatchWith(seats: { name: string; isHuman: boolean; id?: string }[], rng: Rng = Math.random): Match {
  if (seats.length < 3 || seats.length > 4) throw new Error('Crash needs 3 or 4 players');
  const playerCount = seats.length;
  const players: Player[] = seats.map((p) => ({ ...p, tokens: RULES.startTokens, out: false, sittingOut: false }));
  const zeros = () => new Array<number>(playerCount).fill(0);
  const dealer = Math.floor(rng() * playerCount);
  const shell: Match = {
    version: 3,
    players,
    points: zeros(),
    legs: zeros(),
    sets: zeros(),
    setNumber: 1,
    legNumber: 1,
    setPot: RULES.setPot,
    phase: 'arrange',
    deal: undefined as unknown as DealState,
    outcome: null,
    winner: null,
  };
  return { ...shell, deal: dealCards(shell, dealer, 1, rng) };
}

function dealCards(m: Match, dealer: number, number: number, rng: Rng): DealState {
  const n = m.players.length;
  const active = m.players.flatMap((p, i) => (p.out || p.sittingOut ? [] : [i]));
  const { cards, hands } = tableLayout(active.length);
  const deck = shuffle(makeDeck(), rng);
  const dealt: Card[][] = Array.from({ length: n }, () => []);
  active.forEach((seat, k) => {
    dealt[seat] = deck.slice(k * cards, (k + 1) * cards);
  });
  const betOrder: number[] = [];
  for (let k = 1; k <= n; k++) {
    const seat = (dealer + k) % n;
    if (active.includes(seat)) betOrder.push(seat);
  }
  return {
    number,
    dealer,
    active,
    handCount: hands,
    dealt,
    arrangements: new Array(n).fill(null),
    submitted: new Array(n).fill(false),
    crash: new Array(n).fill(false),
    crashFrom: new Array(n).fill(null),
    position: 0,
    betOrder,
    bets: Array.from({ length: hands }, () => new Array(n).fill(null)),
    results: [],
    crashResults: [],
    pointsThisDeal: new Array(n).fill(0),
    tokensAtStart: m.players.map((p) => p.tokens),
  };
}

// ---------- arranging ----------

/** Returns an error message, or null if legal for these dealt cards. */
export function validateArrangement(dealt: readonly Card[], arr: Arrangement, handCount: number): string | null {
  if (arr.hands.length !== handCount) return `Set out exactly ${handCount} hands`;
  let declined = false;
  for (let i = 0; i < arr.hands.length; i++) {
    const h = arr.hands[i];
    if (h === null) {
      declined = true;
      continue;
    }
    if (declined) return 'Declined hands must come last';
    if (h.length !== 3) return `Hand ${i + 1} needs 3 cards`;
    if (!isPlayable(h)) return `Hand ${i + 1} is not a Prile, Stiff, Run or Flush`;
    if (i > 0 && arr.hands[i - 1] && handValue(h) > handValue(arr.hands[i - 1])) {
      return 'Hands must go strongest first, weakest last';
    }
  }
  const all = [...arr.hands.flatMap((h) => h ?? []), ...arr.spares];
  if (all.length !== dealt.length) return 'Every dealt card must be used once';
  for (const card of dealt) {
    if (all.filter((c) => sameCard(c, card)).length !== 1) return 'Every dealt card must be used once';
  }
  return null;
}

/** Sorts playable hands strongest first and moves declined hands to the end. */
export function orderHands(hands: Hand[]): Hand[] {
  const played = hands.filter((h): h is Card[] => h !== null).sort((a, b) => handValue(b) - handValue(a));
  return [...played, ...hands.filter((h) => h === null)];
}

/** A person locks in their hands and chooses whether to call Crash. */
export function submitArrangement(
  m: Match,
  seat: number,
  arrangement: Arrangement,
  callCrash: boolean,
  rng: Rng = Math.random,
): Match {
  if (m.phase !== 'arrange' || m.deal.position !== 0 || m.deal.results.length > 0) throw new Error('Not arranging');
  const d = m.deal;
  if (!d.active.includes(seat) || !m.players[seat].isHuman) throw new Error('Not your seat');
  if (d.submitted[seat]) throw new Error('Hands already locked in');
  const err = validateArrangement(d.dealt[seat], arrangement, d.handCount);
  if (err) throw new Error(err);
  if (callCrash && arrangement.hands.some((h) => h === null)) {
    throw new Error("You can't call Crash with a declined hand");
  }

  const arrangements = d.arrangements.slice();
  const crash = d.crash.slice();
  const submitted = d.submitted.slice();
  arrangements[seat] = arrangement;
  crash[seat] = callCrash;
  submitted[seat] = true;
  const crashFrom = d.crashFrom.slice();
  if (callCrash) crashFrom[seat] = 0;
  return beginIfReady({ ...m, deal: { ...d, arrangements, crash, crashFrom, submitted } }, rng);
}

/** Once every person at the table has locked in, computer players arrange and betting opens on hand 1. */
function beginIfReady(m: Match, rng: Rng): Match {
  const d = m.deal;
  if (m.phase !== 'arrange' || d.active.some((s) => m.players[s].isHuman && !d.submitted[s])) return m;
  const arrangements = d.arrangements.slice();
  const crash = d.crash.slice();
  const crashFrom = d.crashFrom.slice();
  for (const s of d.active) {
    if (m.players[s].isHuman) continue;
    arrangements[s] = aiArrange(d.dealt[s], d.handCount);
    crash[s] = aiCallsCrash(arrangements[s]!, d.active.length, rng);
    if (crash[s]) crashFrom[s] = 0;
  }
  return openBetting({ ...m, deal: { ...d, arrangements, crash, crashFrom } }, rng);
}

/** Crash is an opening decision, made on your betting turn before any hand is revealed. */
export function canCallCrash(m: Match, seat: number): boolean {
  const d = m.deal;
  if (currentBettor(m) !== seat || !d.active.includes(seat) || d.crash[seat]) return false;
  const arr = d.arrangements[seat];
  return !!arr && arr.hands.every((h) => h !== null);
}

/** Calls Crash at the opening: the caller must win every hand in the deal. */
export function callCrash(m: Match, seat: number): Match {
  if (!canCallCrash(m, seat)) throw new Error("You can't call Crash now");
  const d = m.deal;
  const crash = d.crash.slice();
  const crashFrom = d.crashFrom.slice();
  crash[seat] = true;
  crashFrom[seat] = 0;
  return { ...m, deal: { ...d, crash, crashFrom } };
}

/** Single-player shortcut: seat 0 locks in. */
export function lockIn(m: Match, arrangement: Arrangement, callCrash: boolean, rng: Rng = Math.random): Match {
  return submitArrangement(m, HUMAN, arrangement, callCrash, rng);
}

// ---------- betting ----------

/** Largest bet a seat may place: everything down to the debt limit. */
export function maxBet(m: Match, seat: number): number {
  return Math.max(0, m.players[seat].tokens + RULES.debtLimit);
}

/** Smallest bet on a hand you play: the table minimum, or the Crash minimum for a player who called Crash. */
export function minBet(m: Match, seat: number): number {
  const d = m.deal;
  if (d.arrangements[seat]?.hands[d.position] == null) return 0;
  return Math.min(d.crash[seat] ? RULES.crashMinBet : RULES.minBet, maxBet(m, seat));
}

function canBet(m: Match, seat: number): boolean {
  return m.deal.arrangements[seat]?.hands[m.deal.position] != null && maxBet(m, seat) > 0;
}

function clampBet(m: Match, seat: number, amount: number): number {
  if (!canBet(m, seat)) return 0;
  return Math.max(minBet(m, seat), Math.min(maxBet(m, seat), Math.floor(amount)));
}

/** Seat whose turn it is to choose an opening stake, or null once betting is closed. */
export function currentBettor(m: Match): number | null {
  if (m.phase !== 'betting' || m.deal.position !== 0 || m.deal.results.length > 0) return null;
  const row = m.deal.bets[0];
  return m.deal.betOrder.find((s) => row[s] === null) ?? null;
}

/**
 * Takes bets in turn order: computer players decide, seats that can't bet
 * (declined hand, no credit) check automatically, and it stops at the first
 * person who needs to choose.
 */
function runAiBets(m: Match, rng: Rng): Match {
  const d = m.deal;
  const row = d.bets[d.position].slice();
  for (const seat of d.betOrder) {
    if (row[seat] !== null) continue;
    if (!canBet(m, seat)) {
      row[seat] = 0;
      continue;
    }
    if (m.players[seat].isHuman) break;
    const hand = d.arrangements[seat]!.hands[d.position]!;
    row[seat] = clampBet(m, seat, aiBet(m, seat, hand, row, rng));
  }
  const bets = m.deal.bets.slice();
  bets[d.position] = row;
  return { ...m, deal: { ...m.deal, bets } };
}

function openBetting(m: Match, rng: Rng): Match {
  const next = runAiBets({ ...m, phase: 'betting' }, rng);
  return currentBettor(next) !== null ? next : resolvePosition(next);
}

/** Choose a stake once, before hand 1; later hands use it automatically. */
export function placeBetFor(m: Match, seat: number, amount: number, rng: Rng = Math.random): Match {
  if (m.phase !== 'betting' || m.deal.position !== 0 || m.deal.results.length > 0) {
    throw new Error('Betting is only allowed at the beginning of the deal');
  }
  if (currentBettor(m) !== seat) throw new Error('Not your turn to bet');
  const d = m.deal;
  const amt = clampBet(m, seat, amount);
  const bets = d.bets.slice();
  bets[d.position] = bets[d.position].slice();
  bets[d.position][seat] = amt;
  const next = runAiBets({ ...m, deal: { ...d, bets } }, rng);
  return currentBettor(next) === null ? resolvePosition(next) : next;
}

/** Single-player shortcut: seat 0 bets. */
export function placeBet(m: Match, amount: number, rng: Rng = Math.random): Match {
  return placeBetFor(m, HUMAN, amount, rng);
}

/** Acts for a person who has run out of time: computer arranging and betting. */
export function actForSeat(m: Match, seat: number, rng: Rng = Math.random): Match {
  if (m.phase === 'arrange' && m.deal.active.includes(seat) && !m.deal.submitted[seat]) {
    return submitArrangement(m, seat, aiArrange(m.deal.dealt[seat], m.deal.handCount), false, rng);
  }
  if (m.phase === 'betting' && currentBettor(m) === seat) {
    const hand = m.deal.arrangements[seat]!.hands[m.deal.position];
    return placeBetFor(m, seat, hand ? aiBet(m, seat, hand, m.deal.bets[m.deal.position], rng) : 0, rng);
  }
  return m;
}

function resolvePosition(m: Match): Match {
  const d = m.deal;
  const n = m.players.length;
  const p = d.position;
  const values: (number | null)[] = new Array(n).fill(null);
  for (const seat of d.active) values[seat] = handValue(d.arrangements[seat]!.hands[p]);

  // Points: every pair of players compares this hand; the better one scores 1.
  const points = new Array<number>(n).fill(0);
  for (let i = 0; i < d.active.length; i++) {
    for (let j = i + 1; j < d.active.length; j++) {
      const a = d.active[i];
      const b = d.active[j];
      if (values[a]! > values[b]!) points[a]++;
      else if (values[b]! > values[a]!) points[b]++;
    }
  }

  // Pot: the best hand among players who bet takes it; ties split it.
  const bets = d.bets[p].map((b) => b ?? 0);
  const pot = bets.reduce((s, b) => s + b, 0);
  const bettors = d.active.filter((s) => bets[s] > 0 && values[s]! >= 0);
  const best = Math.max(-1, ...bettors.map((s) => values[s]!));
  const potWinners = bettors.filter((s) => values[s] === best);
  const tokenDelta = bets.map((b) => -b);
  if (potWinners.length) {
    const share = Math.floor(pot / potWinners.length);
    potWinners.forEach((s) => (tokenDelta[s] += share));
    // Odd tokens go to the first winner in betting order.
    const first = d.betOrder.find((s) => potWinners.includes(s))!;
    tokenDelta[first] += pot - share * potWinners.length;
  } else {
    bets.forEach((b, s) => (tokenDelta[s] += b)); // nobody eligible: refund
  }

  const players = m.players.map((pl, s) => ({ ...pl, tokens: pl.tokens + tokenDelta[s] }));
  const result: PositionResult = { position: p, values, points, bets, pot, potWinners, tokenDelta };
  return {
    ...m,
    players,
    phase: 'reveal',
    deal: {
      ...d,
      results: [...d.results, result],
      pointsThisDeal: d.pointsThisDeal.map((v, s) => v + points[s]),
    },
  };
}

/** Reveal a later hand using the stakes already chosen at the opening. */
function revealWithOpeningBets(m: Match, position: number): Match {
  const next = { ...m, deal: { ...m.deal, position } };
  const bets = m.deal.bets.slice();
  // No new decision: declined hands check, and the stake never exceeds remaining credit.
  bets[position] = m.players.map((_, seat) =>
    m.deal.active.includes(seat) ? clampBet(next, seat, m.deal.bets[0][seat] ?? 0) : 0,
  );
  return resolvePosition({ ...next, deal: { ...next.deal, bets } });
}

/** Old saved games may be waiting for a later-hand bet; resume without reopening betting. */
export function resumeMatch(m: Match): Match {
  if (m.phase === 'betting' && m.deal.position > 0) {
    return revealWithOpeningBets(m, m.deal.position);
  }
  return m;
}

// ---------- end of deal ----------

/** After a reveal: play the next hand with the opening stakes, or finish the deal. */
export function advance(m: Match, rng: Rng = Math.random): Match {
  if (m.phase === 'reveal') {
    if (m.deal.position + 1 >= m.deal.handCount) return finishDeal(m);
    return revealWithOpeningBets(m, m.deal.position + 1);
  }
  if (m.phase === 'dealEnd') return startNextDeal(m, rng);
  throw new Error(`Nothing to advance in phase ${m.phase}`);
}

/** Did `seat` beat every other player on every hand this deal? */
export function wonEveryHand(d: DealState, seat: number): boolean {
  return d.results.every((r) => d.active.every((o) => o === seat || r.values[seat]! > r.values[o]!));
}

function totalBets(d: DealState, seat: number): number {
  return d.results.reduce((s, r) => s + r.bets[seat], 0);
}

function finishDeal(m: Match): Match {
  const d = m.deal;
  const players = m.players.map((p) => ({ ...p }));
  const pay = (from: number, to: number, amount: number): Transfer => {
    const paid = Math.max(0, Math.min(amount, players[from].tokens + RULES.debtLimit));
    players[from].tokens -= paid;
    players[to].tokens += paid;
    return { from, to, amount: paid };
  };

  // Crash: win every hand and you take the set pot, and each opponent pays double their bets.
  // Miss and you lose half your tokens (half your remaining credit if in debt), shared among
  // your opponents — and you sit out the rest of the leg.
  let setPot = m.setPot;
  const crashResults: CrashResult[] = [];
  for (const seat of d.betOrder) {
    if (!d.crash[seat]) continue;
    const success = wonEveryHand(d, seat);
    const opponents = d.active.filter((o) => o !== seat);
    let transfers: Transfer[];
    let won = 0;
    if (success) {
      transfers = opponents.map((o) => pay(o, seat, RULES.crashMultiplier * totalBets(d, o)));
      won = setPot;
      players[seat].tokens += won;
      setPot = 0;
    } else {
      const t = players[seat].tokens;
      const loss = Math.floor((t > 0 ? t : t + RULES.debtLimit) / 2);
      const share = Math.floor(loss / opponents.length);
      transfers = opponents.map((o, i) => pay(seat, o, share + (i === 0 ? loss - share * opponents.length : 0)));
      players[seat].sittingOut = true;
    }
    crashResults.push({ player: seat, success, transfers, setPot: won });
  }

  const eliminated: number[] = [];
  for (const seat of d.active) {
    if (players[seat].tokens <= -RULES.debtLimit) {
      players[seat].tokens = -RULES.debtLimit;
      players[seat].out = true;
      eliminated.push(seat);
    }
  }

  let points = m.points.map((v, s) => v + d.pointsThisDeal[s]);
  let legs = m.legs.slice();
  const sets = m.sets.slice();
  let { legNumber, setNumber } = m;
  const outcome: DealOutcome = { legWinner: null, setWinner: null, gameWinner: null, eliminated, legTied: false };

  const standing = players.flatMap((p, s) => (p.out ? [] : [s]));
  // Players sitting out can't win this leg; if only one player is left in it, they take it.
  let inLeg = standing.filter((s) => !players[s].sittingOut);
  if (inLeg.length === 0) {
    // Everyone left in the leg missed a Crash at once: nobody sits out, the leg carries on.
    standing.forEach((s) => (players[s].sittingOut = false));
    inLeg = standing;
  }
  const top = Math.max(-1, ...inLeg.map((s) => points[s]));
  const leaders = inLeg.filter((s) => points[s] === top);
  const legOver = (top >= RULES.pointsPerLeg || inLeg.length === 1) && standing.length > 1;
  if (legOver) {
    if (leaders.length === 1 || inLeg.length === 1) {
      const w = inLeg.length === 1 ? inLeg[0] : leaders[0];
      outcome.legWinner = w;
      legs[w]++;
      points = points.map(() => 0);
      legNumber++;
      players.forEach((p) => (p.sittingOut = false));
      if (legs[w] >= RULES.legsPerSet) {
        outcome.setWinner = w;
        sets[w]++;
        setPot = RULES.setPot;
        legs = legs.map(() => 0);
        setNumber++;
        legNumber = 1;
        if (sets[w] >= RULES.setsToWin) outcome.gameWinner = w;
      }
    } else {
      outcome.legTied = true;
    }
  }

  let winner: number | null = outcome.gameWinner;
  let over = winner !== null;
  if (!over && standing.length === 1) {
    winner = standing[0];
    outcome.gameWinner = winner;
    over = true;
  }
  // The game also ends once no people are left in it.
  if (!players.some((p) => p.isHuman && !p.out)) over = true;

  return {
    ...m,
    players,
    points,
    legs,
    sets,
    legNumber,
    setNumber,
    setPot,
    outcome,
    winner,
    phase: over ? 'gameOver' : 'dealEnd',
    deal: { ...d, crashResults },
  };
}

function startNextDeal(m: Match, rng: Rng): Match {
  const n = m.players.length;
  let dealer = m.deal.dealer;
  do dealer = (dealer + 1) % n;
  while (m.players[dealer].out);
  return beginIfReady({ ...m, phase: 'arrange', outcome: null, deal: dealCards(m, dealer, m.deal.number + 1, rng) }, rng);
}

/** Plays a whole deal with the computer choosing for every person (tests and simulations). */
export function autoPlayDeal(m: Match, rng: Rng, humanCrash = false): Match {
  let x = m;
  for (const seat of x.deal.active) {
    if (!x.players[seat].isHuman) continue;
    const arr = aiArrange(x.deal.dealt[seat], x.deal.handCount);
    x = submitArrangement(x, seat, arr, humanCrash && arr.hands.every((h) => h !== null), rng);
  }
  while (x.phase === 'betting' || x.phase === 'reveal') {
    x = x.phase === 'betting' ? actForSeat(x, currentBettor(x)!, rng) : advance(x, rng);
  }
  return x;
}
