import { makeDeck, sameCard, shuffle, type Card, type Rng } from './cards.ts';
import { handValue, isPlayable } from './hands.ts';
import { aiArrange, aiBet, aiCallsCrash } from './ai.ts';

export const RULES = {
  pointsPerLeg: 10,
  legsPerSet: 3,
  setsToWin: 3,
  startTokens: 1000,
  /** A player whose balance reaches -debtLimit is out. */
  debtLimit: 5000,
  /** A player who calls Crash must bet at least this on every hand they play. */
  crashMinBet: 50,
  /** Crash settles at this multiple of the loser's bets for the deal. */
  crashMultiplier: 2,
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
  tokens: number;
  out: boolean;
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
  crash: boolean[];
  /** The hand currently being bet on / revealed. */
  position: number;
  /** Seats in betting order for this deal (starts left of the dealer). */
  betOrder: number[];
  /** bets[position][seat]; null = not yet decided. */
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
  version: 2;
  players: Player[];
  /** Points in the current leg. */
  points: number[];
  /** Legs won in the current set. */
  legs: number[];
  sets: number[];
  setNumber: number;
  legNumber: number;
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
  const players: Player[] = [
    { name: humanName, isHuman: true, tokens: RULES.startTokens, out: false },
    ...AI_NAMES.slice(0, playerCount - 1).map((name) => ({
      name,
      isHuman: false,
      tokens: RULES.startTokens,
      out: false,
    })),
  ];
  const zeros = () => new Array<number>(playerCount).fill(0);
  const dealer = Math.floor(rng() * playerCount);
  const shell: Match = {
    version: 2,
    players,
    points: zeros(),
    legs: zeros(),
    sets: zeros(),
    setNumber: 1,
    legNumber: 1,
    phase: 'arrange',
    deal: undefined as unknown as DealState,
    outcome: null,
    winner: null,
  };
  return { ...shell, deal: dealCards(shell, dealer, 1, rng) };
}

function dealCards(m: Match, dealer: number, number: number, rng: Rng): DealState {
  const n = m.players.length;
  const active = m.players.flatMap((p, i) => (p.out ? [] : [i]));
  const { cards, hands } = tableLayout(active.length);
  const deck = shuffle(makeDeck(), rng);
  const dealt: Card[][] = Array.from({ length: n }, () => []);
  active.forEach((seat, k) => {
    dealt[seat] = deck.slice(k * cards, (k + 1) * cards);
  });
  const betOrder: number[] = [];
  for (let k = 1; k <= n; k++) {
    const seat = (dealer + k) % n;
    if (!m.players[seat].out) betOrder.push(seat);
  }
  return {
    number,
    dealer,
    active,
    handCount: hands,
    dealt,
    arrangements: new Array(n).fill(null),
    crash: new Array(n).fill(false),
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

/** Human locks in hands and chooses whether to call Crash. Computer players do the same. */
export function lockIn(m: Match, arrangement: Arrangement, callCrash: boolean, rng: Rng = Math.random): Match {
  if (m.phase !== 'arrange') throw new Error('Not arranging');
  const d = m.deal;
  const err = validateArrangement(d.dealt[HUMAN], arrangement, d.handCount);
  if (err) throw new Error(err);
  if (callCrash && arrangement.hands.some((h) => h === null)) {
    throw new Error("You can't call Crash with a declined hand");
  }

  const arrangements = d.arrangements.slice();
  const crash = d.crash.slice();
  for (const seat of d.active) {
    if (seat === HUMAN) {
      arrangements[seat] = arrangement;
      crash[seat] = callCrash;
    } else {
      arrangements[seat] = aiArrange(d.dealt[seat], d.handCount);
      crash[seat] = aiCallsCrash(arrangements[seat]!, d.active.length, rng);
    }
  }
  return openBetting({ ...m, deal: { ...d, arrangements, crash } }, 0, rng);
}

// ---------- betting ----------

/** Largest bet a seat may place: everything down to the debt limit. */
export function maxBet(m: Match, seat: number): number {
  return Math.max(0, m.players[seat].tokens + RULES.debtLimit);
}

/** Smallest bet: 0, or the Crash minimum for a player who called Crash. */
export function minBet(m: Match, seat: number): number {
  const d = m.deal;
  if (d.arrangements[seat]?.hands[d.position] == null) return 0;
  return d.crash[seat] ? Math.min(RULES.crashMinBet, maxBet(m, seat)) : 0;
}

function canBet(m: Match, seat: number): boolean {
  return m.deal.arrangements[seat]?.hands[m.deal.position] != null && maxBet(m, seat) > 0;
}

function clampBet(m: Match, seat: number, amount: number): number {
  if (!canBet(m, seat)) return 0;
  return Math.max(minBet(m, seat), Math.min(maxBet(m, seat), Math.floor(amount)));
}

/** Bets in turn order until it's the human's turn (or everyone has bet). */
function runAiBets(m: Match, rng: Rng): Match {
  const d = m.deal;
  const row = d.bets[d.position].slice();
  for (const seat of d.betOrder) {
    if (row[seat] !== null) continue;
    if (seat === HUMAN) break;
    const hand = d.arrangements[seat]!.hands[d.position];
    const wanted = hand ? aiBet(m, seat, hand, row, rng) : 0;
    row[seat] = clampBet(m, seat, wanted);
  }
  const bets = d.bets.slice();
  bets[d.position] = row;
  return { ...m, deal: { ...d, bets } };
}

function openBetting(m: Match, position: number, rng: Rng): Match {
  const next = runAiBets({ ...m, phase: 'betting', deal: { ...m.deal, position } }, rng);
  return next.deal.bets[position][HUMAN] === null ? next : resolvePosition(next);
}

/** The human's bet for the current hand. Remaining computer players then bet and the hand is revealed. */
export function placeBet(m: Match, amount: number, rng: Rng = Math.random): Match {
  if (m.phase !== 'betting') throw new Error('Not betting');
  const d = m.deal;
  const amt = clampBet(m, HUMAN, amount);
  const bets = d.bets.slice();
  bets[d.position] = bets[d.position].slice();
  bets[d.position][HUMAN] = amt;
  return resolvePosition(runAiBets({ ...m, deal: { ...d, bets } }, rng));
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

// ---------- end of deal ----------

/** After a reveal: bet on the next hand, or finish the deal. */
export function advance(m: Match, rng: Rng = Math.random): Match {
  if (m.phase === 'reveal') {
    return m.deal.position + 1 < m.deal.handCount ? openBetting(m, m.deal.position + 1, rng) : finishDeal(m);
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

  // Crash: win every hand and each opponent pays double their bets; fail and you pay each opponent double yours.
  const crashResults: CrashResult[] = [];
  for (const seat of d.betOrder) {
    if (!d.crash[seat]) continue;
    const success = wonEveryHand(d, seat);
    const transfers = d.active
      .filter((o) => o !== seat)
      .map((o) =>
        success
          ? pay(o, seat, RULES.crashMultiplier * totalBets(d, o))
          : pay(seat, o, RULES.crashMultiplier * totalBets(d, seat)),
      );
    crashResults.push({ player: seat, success, transfers });
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
  const top = Math.max(...standing.map((s) => points[s]));
  if (top >= RULES.pointsPerLeg) {
    const leaders = standing.filter((s) => points[s] === top);
    if (leaders.length === 1) {
      const w = leaders[0];
      outcome.legWinner = w;
      legs[w]++;
      points = points.map(() => 0);
      legNumber++;
      if (legs[w] >= RULES.legsPerSet) {
        outcome.setWinner = w;
        sets[w]++;
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
  if (players[HUMAN].out) over = true;

  return {
    ...m,
    players,
    points,
    legs,
    sets,
    legNumber,
    setNumber,
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
  return { ...m, phase: 'arrange', outcome: null, deal: dealCards(m, dealer, m.deal.number + 1, rng) };
}

/** Plays a whole deal for the human with the computer's choices (tests and simulations). */
export function autoPlayDeal(m: Match, rng: Rng, humanCrash = false): Match {
  const arr = aiArrange(m.deal.dealt[HUMAN], m.deal.handCount);
  let x = lockIn(m, arr, humanCrash && arr.hands.every((h) => h !== null), rng);
  while (x.phase === 'betting' || x.phase === 'reveal') {
    if (x.phase === 'betting') {
      const hand = x.deal.arrangements[HUMAN]!.hands[x.deal.position];
      x = placeBet(x, hand ? aiBet(x, HUMAN, hand, x.deal.bets[x.deal.position], rng) : 0, rng);
    } else x = advance(x, rng);
  }
  return x;
}
