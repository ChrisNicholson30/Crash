import { describe, expect, it } from 'vitest';
import { makeDeck, mulberry32, sameCard, shuffle, type Card, type Suit } from './cards.ts';
import { Category, compareHands, evaluate, isPlayable } from './hands.ts';
import { bestPartition } from './partition.ts';
import { aiArrange, positionWinChance } from './ai.ts';
import { HIDDEN, viewFor } from './view.ts';
import {
  HUMAN,
  RULES,
  actForSeat,
  callCrash,
  canCallCrash,
  currentBettor,
  newMatchWith,
  placeBetFor,
  submitArrangement,
  advance,
  autoPlayDeal,
  lockIn,
  maxBet,
  minBet,
  newMatch,
  orderHands,
  placeBet,
  placeCrashFor,
  resumeMatch,
  tableLayout,
  validateArrangement,
  type Match,
} from './match.ts';

const RANK: Record<string, number> = { J: 11, Q: 12, K: 13, A: 14 };
/** "AS KH 10D" → cards */
function h(spec: string): Card[] {
  return spec.split(' ').map((s) => ({
    rank: RANK[s.slice(0, -1)] ?? Number(s.slice(0, -1)),
    suit: s.slice(-1) as Suit,
  }));
}

/** Gives the human exactly `cards` and deals the rest of the deck to the others. */
function rig(m: Match, cards: Card[], rng = mulberry32(99)): Match {
  const rest = shuffle(
    makeDeck().filter((c) => !cards.some((x) => sameCard(x, c))),
    rng,
  );
  const per = m.deal.dealt[1].length;
  const dealt = m.deal.dealt.map((_, s) => (s === HUMAN ? cards : rest.splice(0, per)));
  return { ...m, deal: { ...m.deal, dealt } };
}

/** Plays every hand of the current deal with a fixed human bet. */
function playOut(m: Match, humanBet: number, rng = mulberry32(5)): Match {
  let x = m;
  while (x.phase === 'betting' || x.phase === 'reveal') {
    x = x.phase === 'betting' ? placeBet(x, humanBet, rng) : advance(x, rng);
  }
  return x;
}

const totalTokens = (m: Match) => m.players.reduce((s, p) => s + p.tokens, 0);

describe('hand strength (card rules)', () => {
  it.each([
    ['KS KH KD', Category.Prile],
    ['2D 3D 4D', Category.Stiff],
    ['AH 2H 3H', Category.Stiff],
    ['QC KC AC', Category.Stiff],
    ['2C 3D 4S', Category.Run],
    ['AS 2D 3C', Category.Run],
    ['QS KD AC', Category.Run],
    ['KH 5H 3H', Category.Flush],
    ['KS AD 2C', Category.None], // runs don't wrap
    ['9S 9D 2C', Category.None], // a pair is not a hand in Crash
    ['7S 4D 2C', Category.None],
  ])('%s is category %i', (spec, cat) => {
    expect(evaluate(h(spec)).category).toBe(cat);
  });

  it('ranks Prile > Stiff > Run > Flush', () => {
    const ordered = ['2S 2H 2D', 'AS 2S 3S', '2S 3H 4D', 'KH 5H 3H'];
    for (let i = 0; i < ordered.length - 1; i++) expect(compareHands(h(ordered[i]), h(ordered[i + 1]))).toBe(1);
  });

  it('breaks ties by the highest card, then the next', () => {
    expect(compareHands(h('AS AH AD'), h('KS KH KD'))).toBe(1);
    expect(compareHands(h('AS 2D 3C'), h('2S 3D 4C'))).toBe(-1); // A-2-3 is the lowest run
    expect(compareHands(h('QS KD AC'), h('JS QD KC'))).toBe(1);
    expect(compareHands(h('KH 6H 2H'), h('KD 5D 4D'))).toBe(1);
    expect(compareHands(h('2C 3D 4S'), h('2H 3S 4D'))).toBe(0);
  });

  it('a declined hand loses to any real hand and ties another declined hand', () => {
    expect(compareHands(null, h('KH 5H 3H'))).toBe(-1);
    expect(compareHands(null, null)).toBe(0);
  });
});

describe('arranging', () => {
  const dealt = h('AS AH AD 2C 3D 4S 5H 7H 9H JC QC 8C 6S');

  it('accepts hands strongest first with a declined last hand', () => {
    const arr = { hands: [h('AS AH AD'), h('8C JC QC'), h('5H 7H 9H'), null], spares: h('2C 3D 4S 6S') };
    // Run 2-3-4 would be stronger than the flushes, but the player chose to keep it out; still legal.
    expect(validateArrangement(dealt, arr, 4)).toBeNull();
  });

  it('rejects weaker-first order, non-hands, a gap before a declined hand, and missing cards', () => {
    const spares = h('6S');
    expect(validateArrangement(dealt, { hands: [h('2C 3D 4S'), h('AS AH AD'), h('5H 7H 9H'), h('8C JC QC')], spares }, 4)).toMatch(/strongest/);
    expect(validateArrangement(dealt, { hands: [h('AS AH 2C'), h('AD 3D 4S'), h('5H 7H 9H'), h('8C JC QC')], spares }, 4)).toMatch(/not a Prile/);
    expect(validateArrangement(dealt, { hands: [h('AS AH AD'), null, h('5H 7H 9H'), h('8C JC QC')], spares: h('2C 3D 4S 6S') }, 4)).toMatch(/last/);
    expect(validateArrangement(dealt, { hands: [h('AS AH AD'), h('2C 3D 4S'), h('8C JC QC'), h('5H 7H 9H')], spares: [] }, 4)).toMatch(/once/);
  });

  it('orderHands sorts strongest first and puts declined hands last', () => {
    const ordered = orderHands([h('KH 5H 3H'), null, h('2S 2H 2D'), h('2C 3D 4S')]);
    expect(ordered.map((x) => (x ? evaluate(x).category : null))).toEqual([Category.Prile, Category.Run, Category.Flush, null]);
  });

  it('the computer only makes real hands, strongest first, declining when it must', () => {
    const rng = mulberry32(3);
    for (const count of [3, 4]) {
      const { cards, hands } = tableLayout(count);
      for (let i = 0; i < 25; i++) {
        const dealt = shuffle(makeDeck(), rng).slice(0, cards);
        const arr = aiArrange(dealt, hands);
        expect(validateArrangement(dealt, arr, hands)).toBeNull();
      }
    }
  });

  it('finds four hands when four exist', () => {
    const hands = bestPartition(h('KS KH KD 2D 3D 4D QC JH 9S 7C 8D 6S 5H'), 4);
    expect(hands.every((x) => x && isPlayable(x))).toBe(true);
  });

  it('win-chance tables rank a prile above a flush in every position', () => {
    for (let pos = 0; pos < 4; pos++) {
      expect(positionWinChance(4, pos, evaluate(h('9S 9H 9D')).value)).toBeGreaterThan(
        positionWinChance(4, pos, evaluate(h('9H 5H 3H')).value),
      );
    }
  });
});

describe('a deal', () => {
  // Four priles from the top: nobody can beat any of them.
  const monster = h('AS AH AD KS KH KD QS QH QD JS JH JD 2C');

  it('plays hand by hand, scores pairwise and wins the leg', () => {
    let m = rig(newMatch(4, 'Chris', mulberry32(1)), monster);
    m = lockIn(m, aiArrange(m.deal.dealt[HUMAN], 4), false, mulberry32(2));
    expect(m.phase === 'betting' || m.phase === 'reveal').toBe(true);
    m = playOut(m, 100);
    expect(m.deal.results).toHaveLength(4);
    expect(m.deal.pointsThisDeal[HUMAN]).toBe(12); // 4 hands x 3 opponents
    expect(m.outcome?.legWinner).toBe(HUMAN);
    expect(m.legs[HUMAN]).toBe(1);
    expect(m.points.every((p) => p === 0)).toBe(true);
  });

  it('a successful Crash makes each opponent pay half the caller’s opening stake', () => {
    let m = rig(newMatch(4, 'Chris', mulberry32(1)), monster);
    m = lockIn(m, aiArrange(m.deal.dealt[HUMAN], 4), true, mulberry32(2));
    const before = totalTokens(m);
    m = playOut(m, 1000);
    const crash = m.deal.crashResults.find((c) => c.player === HUMAN)!;
    expect(crash.success).toBe(true);
    for (const t of crash.transfers) {
      expect(t.to).toBe(HUMAN);
      expect(t.amount).toBe(500);
    }
    expect(totalTokens(m)).toBe(before);
  });

  it('a failed Crash costs half the chosen stake, shared among the opponents', () => {
    const weak = h('2H 5H 7H 3C 6C 8C 2D 4D 9D 3S 5S 7S 10H');
    let m = rig(newMatch(4, 'Chris', mulberry32(4)), weak);
    m = lockIn(m, aiArrange(m.deal.dealt[HUMAN], 4), true, mulberry32(2));
    let before = 0;
    while (m.phase === 'betting' || m.phase === 'reveal') {
      if (m.phase === 'reveal' && m.deal.position === m.deal.handCount - 1) before = m.players[HUMAN].tokens;
      m = m.phase === 'betting' ? placeBet(m, 1001, mulberry32(5)) : advance(m, mulberry32(5));
    }
    const crash = m.deal.crashResults.find((c) => c.player === HUMAN)!;
    expect(crash.success).toBe(false);
    expect(crash.transfers).toHaveLength(3);
    const paid = crash.transfers.reduce((s, t) => s + t.amount, 0);
    expect(paid).toBe(500);
    expect(m.players[HUMAN].tokens).toBe(before - paid);
    expect(m.players[HUMAN].sittingOut).toBe(true);
  });

  it('every hand you play carries at least the table minimum', () => {
    let m = rig(newMatch(4, 'Chris', mulberry32(1)), monster);
    m = lockIn(m, aiArrange(m.deal.dealt[HUMAN], 4), false, mulberry32(2));
    expect(minBet(m, HUMAN)).toBe(RULES.minBet);
    m = placeBet(m, 0, mulberry32(3));
    expect(m.deal.results[0].bets.filter((b) => b > 0)).toHaveLength(4);
  });

  it('Crash callers must bet at least the minimum', () => {
    let m = rig(newMatch(4, 'Chris', mulberry32(1)), monster);
    m = lockIn(m, aiArrange(m.deal.dealt[HUMAN], 4), true, mulberry32(2));
    expect(minBet(m, HUMAN)).toBe(RULES.crashMinBet);
    m = placeBet(m, 0, mulberry32(3));
    expect(m.deal.results[0].bets[HUMAN]).toBe(RULES.crashMinBet);
  });

  it('debt is capped at the limit and puts the player out', () => {
    const weak = h('2H 5H 7H 3C 6C 8C 2D 4D 9D 3S 5S 7S 10H');
    let m = rig(newMatch(4, 'Chris', mulberry32(4)), weak);
    m = { ...m, players: m.players.map((p, s) => (s === HUMAN ? { ...p, tokens: -3000 } : p)) };
    expect(maxBet(m, HUMAN)).toBe(2000);
    m = lockIn(m, aiArrange(m.deal.dealt[HUMAN], 4), true, mulberry32(2));
    m = playOut(m, 2000); // loses the opening pot: -5000; later stakes are capped at zero
    expect(m.players[HUMAN].tokens).toBe(-RULES.debtLimit);
    expect(m.players[HUMAN].out).toBe(true);
    expect(m.phase).toBe('gameOver');
  });

  it('a declined hand cannot be bet on and loses its matchups', () => {
    const dealt = h('AS AH AD 2C 3D 4S 5H 7H 9H JC QC 8C 6S');
    let m = rig(newMatch(4, 'Chris', mulberry32(8)), dealt);
    const arr = { hands: [h('AS AH AD'), h('2C 3D 4S'), h('5H 7H 9H'), null], spares: h('8C JC QC 6S') };
    m = lockIn(m, arr, false, mulberry32(2));
    m = placeBet(m, 0, mulberry32(0));
    for (let i = 0; i < 3; i++) m = advance(m, mulberry32(i));
    // The opening stake is carried forward, but the declined hand checks automatically.
    expect(m.phase).toBe('reveal');
    expect(m.deal.position).toBe(3);
    expect(maxBet(m, HUMAN)).toBeGreaterThan(0);
    const last = m.deal.results[3];
    expect(last.bets[HUMAN]).toBe(0);
    expect(last.values[HUMAN]).toBe(-1);
    expect(last.points[HUMAN]).toBe(0);
  });
});

describe('opening decisions', () => {
  const monster = h('AS AH AD KS KH KD QS QH QD JS JH JD 2C');
  const weak = h('2H 5H 7H 3C 6C 8C 2D 4D 9D 3S 5S 7S 10H');

  it('locks a Crash call and its chosen stake in one opening action', () => {
    let m = rig(newMatch(4, 'Chris', mulberry32(1)), monster);
    m = lockIn(m, aiArrange(m.deal.dealt[HUMAN], 4), false, mulberry32(2));
    m = placeCrashFor(m, HUMAN, 1200, mulberry32(3));
    expect(m.deal.crash[HUMAN]).toBe(true);
    expect(m.deal.results[0].bets[HUMAN]).toBe(1200);
    expect(m.phase).toBe('reveal');
    expect(() => placeCrashFor(m, HUMAN, 2000)).toThrow();
  });

  it('can be called on the opening turn, and pays out if every hand is won', () => {
    let m = rig(newMatch(4, 'Chris', mulberry32(1)), monster);
    m = lockIn(m, aiArrange(m.deal.dealt[HUMAN], 4), false, mulberry32(2));
    expect(canCallCrash(m, HUMAN)).toBe(true);
    m = callCrash(m, HUMAN);
    expect(m.deal.crashFrom[HUMAN]).toBe(0);
    expect(minBet(m, HUMAN)).toBe(RULES.crashMinBet);
    m = playOut(m, 0);
    expect(m.deal.crashResults[0]).toMatchObject({ player: HUMAN, success: true });
  });

  it.each([3, 4] as const)('locks bets and Crash through every reveal at a %i-player table, even while unbeaten', (count) => {
    const cards = count === 4 ? monster : h('AS AH AD KS KH KD QS QH QD JS JH JD 10S 10H 10D 2C 3C');
    let m = rig(newMatch(count, 'Chris', mulberry32(1)), cards);
    m = lockIn(m, aiArrange(m.deal.dealt[HUMAN], m.deal.handCount), false, mulberry32(2));
    m = placeBet(m, 700, mulberry32(3));
    const calls = m.deal.crash.slice();
    const balances = [];
    for (let pos = 0; pos < m.deal.handCount; pos++) {
      expect(m.phase).toBe('reveal');
      expect(m.deal.position).toBe(pos);
      expect(m.deal.results[pos].points[HUMAN]).toBe(count - 1);
      expect(m.deal.results[pos].bets[HUMAN]).toBe(700);
      expect(m.deal.crash).toEqual(calls);
      expect(currentBettor(m)).toBeNull();
      expect(canCallCrash(m, HUMAN)).toBe(false);
      expect(() => callCrash(m, HUMAN)).toThrow();
      expect(() => placeBet(m, 1000)).toThrow(/beginning/);
      balances.push(totalTokens(m));
      if (pos + 1 < m.deal.handCount) m = advance(m, mulberry32(3));
    }
    expect(new Set(balances).size).toBe(1);
  });

  it('rejects forged later betting phases and resumes older saved games without taking another bet', () => {
    let m = rig(newMatch(4, 'Chris', mulberry32(1)), monster);
    m = lockIn(m, aiArrange(m.deal.dealt[HUMAN], 4), false, mulberry32(2));
    expect(resumeMatch(m)).toBe(m);
    m = placeBet(m, 700, mulberry32(3));
    const legacy: Match = { ...m, phase: 'betting', deal: { ...m.deal, position: 1 } };
    expect(currentBettor(legacy)).toBeNull();
    expect(canCallCrash(legacy, HUMAN)).toBe(false);
    expect(() => placeBet(legacy, 1000)).toThrow(/beginning/);
    expect(() => callCrash(legacy, HUMAN)).toThrow();
    const resumed = resumeMatch(legacy);
    expect(resumed).toEqual(advance(m));
    expect(resumeMatch(resumed)).toBe(resumed);
  });

  it('caps the carried stake at remaining credit and skips hands after credit runs out', () => {
    let m = rig(newMatch(4, 'Chris', mulberry32(4)), weak);
    m = { ...m, players: m.players.map((p, seat) => seat === HUMAN ? { ...p, tokens: -4250 } : p) };
    m = lockIn(m, aiArrange(m.deal.dealt[HUMAN], 4), false, mulberry32(2));
    m = playOut(m, 500);
    expect(m.deal.results.map((r) => r.bets[HUMAN])).toEqual([500, 250, 0, 0]);
    expect(m.players[HUMAN].tokens).toBe(-RULES.debtLimit);
    expect(m.players[HUMAN].out).toBe(true);
  });

  it('opens betting and Crash choices again for the next deal', () => {
    const rng = mulberry32(2);
    let m = rig(newMatch(4, 'Chris', mulberry32(1)), monster);
    m = lockIn(m, aiArrange(m.deal.dealt[HUMAN], 4), false, rng);
    m = playOut(m, 100, rng);
    expect(m.outcome?.legWinner).toBe(HUMAN);
    m = advance(m, rng);
    expect(m.phase).toBe('arrange');
    m = rig(m, monster);
    m = lockIn(m, aiArrange(m.deal.dealt[HUMAN], 4), false, rng);
    expect(m.phase).toBe('betting');
    expect(m.deal.position).toBe(0);
    expect(m.deal.results).toHaveLength(0);
    expect(canCallCrash(m, HUMAN)).toBe(true);
    m = placeBet(callCrash(m, HUMAN), 900, rng);
    expect(m.deal.results[0].bets[HUMAN]).toBe(900);
  });

  it('a missed Crash sits you out for the rest of the leg', () => {
    const rng = mulberry32(6);
    let m = rig(newMatch(4, 'Chris', mulberry32(4)), weak);
    m = lockIn(m, aiArrange(m.deal.dealt[HUMAN], 4), true, rng);
    m = playOut(m, 50, rng);
    expect(m.players[HUMAN].sittingOut).toBe(true);
    expect(m.phase).toBe('dealEnd');
    m = advance(m, rng);
    expect(m.deal.active).not.toContain(HUMAN);
    expect(m.deal.handCount).toBe(5); // three players left in the leg: 17 cards, 5 hands
    expect(m.phase).not.toBe('arrange'); // no people left in the deal, so it starts by itself
    // Play on until the leg ends; then the player is back in.
    const leg = m.legNumber;
    let guard = 0;
    while (m.legNumber === leg && m.phase !== 'gameOver' && guard++ < 100) {
      m = m.phase === 'dealEnd' ? advance(m, rng) : autoPlayDeal(m, rng);
    }
    expect(m.players[HUMAN].sittingOut).toBe(false);
  });
});

describe('several people at one table', () => {
  const seats = [
    { name: 'Chris', isHuman: true, id: 'u1' },
    { name: 'Sam', isHuman: true, id: 'u2' },
    { name: 'Ava', isHuman: false },
    { name: 'Ben', isHuman: false },
  ];

  it('waits for every person to lock in, then takes bets strictly in turn', () => {
    const rng = mulberry32(21);
    let m = newMatchWith(seats, rng);
    m = submitArrangement(m, 0, aiArrange(m.deal.dealt[0], 4), false, rng);
    expect(m.phase).toBe('arrange');
    expect(() => submitArrangement(m, 0, aiArrange(m.deal.dealt[0], 4), false, rng)).toThrow(/already/);
    m = submitArrangement(m, 1, aiArrange(m.deal.dealt[1], 4), false, rng);
    expect(m.phase === 'betting' || m.phase === 'reveal').toBe(true);
    if (m.phase === 'betting') {
      const turn = currentBettor(m)!;
      expect(m.players[turn].isHuman).toBe(true);
      const other = turn === 0 ? 1 : 0;
      expect(() => placeBetFor(m, other, 25, rng)).toThrow(/turn/);
    }
  });

  it('rejects out-of-turn and duplicate opening actions, then closes betting for all people', () => {
    const rng = mulberry32(21);
    const monster = h('AS AH AD KS KH KD QS QH QD JS JH JD 2C');
    let m = rig(newMatchWith(seats, rng), monster);
    m = { ...m, deal: { ...m.deal, betOrder: [1, 0, 2, 3] } };
    for (const seat of [0, 1]) m = submitArrangement(m, seat, aiArrange(m.deal.dealt[seat], 4), false, rng);
    expect(currentBettor(m)).toBe(1);
    expect(canCallCrash(m, 0)).toBe(false);
    expect(() => callCrash(m, 0)).toThrow();
    expect(() => placeBetFor(m, 0, 500, rng)).toThrow(/turn/);
    m = placeBetFor(m, 1, 300, rng);
    expect(currentBettor(m)).toBe(0);
    expect(canCallCrash(m, 0)).toBe(true);
    m = callCrash(m, 0);
    expect(() => callCrash(m, 0)).toThrow();
    m = placeBetFor(m, 0, 800, rng);
    expect(() => placeBetFor(m, 0, 900, rng)).toThrow(/beginning/);
    for (let pos = 0; pos < m.deal.handCount; pos++) {
      expect(m.phase).toBe('reveal');
      for (const seat of [0, 1]) {
        expect(canCallCrash(m, seat)).toBe(false);
        expect(() => placeBetFor(m, seat, 500, rng)).toThrow(/beginning/);
      }
      if (pos + 1 < m.deal.handCount) m = advance(m, rng);
    }
  });

  it('shows each person only their own cards until hands turn over', () => {
    const rng = mulberry32(22);
    let m = newMatchWith(seats, rng);
    const v = viewFor(m, 1);
    expect(v.deal.dealt[1]).toHaveLength(13);
    expect(v.deal.dealt[0]).toHaveLength(0);
    m = submitArrangement(m, 0, aiArrange(m.deal.dealt[0], 4), true, rng);
    expect(viewFor(m, 1).deal.arrangements[0]).toBeNull();
    expect(viewFor(m, 1).deal.crash[0]).toBe(false);
    m = submitArrangement(m, 1, aiArrange(m.deal.dealt[1], 4), false, rng);
    while (m.phase === 'betting') m = actForSeat(m, currentBettor(m)!, rng);
    const seen = viewFor(m, 1);
    expect(seen.deal.arrangements[0]!.hands[0]).toEqual(m.deal.arrangements[0]!.hands[0]); // hand 1 turned over
    expect(seen.deal.arrangements[0]!.hands[1]![0]).toEqual(HIDDEN); // hand 2 still face down
    expect(seen.deal.crash[0]).toBe(true);
  });

  it('a mixed table plays to the end and conserves tokens', () => {
    const rng = mulberry32(23);
    let m = newMatchWith(seats, rng);
    let deals = 0;
    while (m.phase !== 'gameOver' && deals < 400) {
      const before = totalTokens(m);
      m = autoPlayDeal(m, rng);
      expect(totalTokens(m)).toBe(before);
      if (m.phase === 'dealEnd') m = advance(m, rng);
      deals++;
    }
    expect(m.phase).toBe('gameOver');
  });
});

describe('a whole match', () => {
  it.each([3, 4] as const)('all-computer %i-player match ends with a winner and conserves tokens', (count) => {
    const rng = mulberry32(count * 7);
    let m = newMatch(count, 'Bot', rng);
    let start = totalTokens(m);
    let deals = 0;
    while (m.phase !== 'gameOver' && deals < 400) {
      m = autoPlayDeal(m, rng, rng() < 0.05);
      expect(totalTokens(m)).toBe(start);
      if (m.phase === 'dealEnd') m = advance(m, rng);
      deals++;
    }
    expect(m.phase).toBe('gameOver');
    if (m.winner !== null) {
      const w = m.winner;
      const standing = m.players.filter((p) => !p.out).length;
      expect(m.sets[w] >= RULES.setsToWin || standing === 1).toBe(true);
    } else {
      expect(m.players[HUMAN].out).toBe(true);
    }
  });
});
