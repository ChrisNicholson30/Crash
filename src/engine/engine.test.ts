import { describe, expect, it } from 'vitest';
import { mulberry32, type Card, type Suit } from './cards';
import { Category, compareHands, evaluate } from './hands';
import { arrange, bestPartition, strength } from './ai';
import {
  dealCards,
  findWinner,
  newGame,
  playDeal,
  scoreDeal,
  startDeal,
  validateArrangement,
  type Arrangement,
} from './game';

const RANK: Record<string, number> = { J: 11, Q: 12, K: 13, A: 14 };
/** "AS KH 10D" → cards */
function h(spec: string): Card[] {
  return spec.split(' ').map((s) => ({
    rank: RANK[s.slice(0, -1)] ?? Number(s.slice(0, -1)),
    suit: s.slice(-1) as Suit,
  }));
}

describe('dealing', () => {
  it('deals 13 each to 4 players using the whole deck', () => {
    const d = dealCards(4, mulberry32(1));
    expect(d.map((p) => p.length)).toEqual([13, 13, 13, 13]);
    expect(new Set(d.flat().map((c) => `${c.rank}${c.suit}`)).size).toBe(52);
  });
  it('deals 17 each to 3 players, leaving one card', () => {
    const d = dealCards(3, mulberry32(2));
    expect(d.map((p) => p.length)).toEqual([17, 17, 17]);
    expect(new Set(d.flat().map((c) => `${c.rank}${c.suit}`)).size).toBe(51);
  });
});

describe('hand categories', () => {
  it.each([
    ['KS KH KD', Category.Prile],
    ['2D 3D 4D', Category.Stiff],
    ['AH 2H 3H', Category.Stiff],
    ['QC KC AC', Category.Stiff],
    ['2C 3D 4S', Category.Run],
    ['AS 2D 3C', Category.Run],
    ['QS KD AC', Category.Run],
    ['KH 5H 3H', Category.Flush],
    ['KS AD 2C', Category.HighCard], // no wrap-around
    ['9S 9D 2C', Category.Pair],
    ['7S 4D 2C', Category.HighCard],
  ])('%s is %s', (spec, cat) => {
    expect(evaluate(h(spec)).category).toBe(cat);
  });

  it('ranks Prile > Stiff > Run > Flush > Pair > High card', () => {
    const ordered = ['2S 2H 2D', 'AS 2S 3S', '2S 3H 4D', 'KH 5H 3H', 'AS AD KC', 'AS KD JC'];
    for (let i = 0; i < ordered.length - 1; i++) {
      expect(compareHands(h(ordered[i]), h(ordered[i + 1]))).toBe(1);
    }
  });
});

describe('tie-breaks', () => {
  it('higher prile wins', () => expect(compareHands(h('AS AH AD'), h('KS KH KD'))).toBe(1));
  it('A-2-3 is the lowest run, Q-K-A the highest', () => {
    expect(compareHands(h('AS 2D 3C'), h('2S 3D 4C'))).toBe(-1);
    expect(compareHands(h('QS KD AC'), h('JS QD KC'))).toBe(1);
  });
  it('flushes compare highest card, then next', () => {
    expect(compareHands(h('KH 5H 3H'), h('QD JD 9D'))).toBe(1);
    expect(compareHands(h('KH 6H 2H'), h('KD 5D 4D'))).toBe(1);
  });
  it('pairs compare pair rank, then kicker', () => {
    expect(compareHands(h('9S 9D 2C'), h('8S 8D AC'))).toBe(1);
    expect(compareHands(h('9S 9D 5C'), h('9H 9C 4C'))).toBe(1);
  });
  it('identical ranks in different suits tie', () => {
    expect(compareHands(h('2C 3D 4S'), h('2H 3S 4D'))).toBe(0);
  });
});

describe('scoring', () => {
  const arr = (...hands: string[]): Arrangement => ({ hands: hands.map(h), spares: [] });

  it('compares each position pairwise and gives no point for a tie', () => {
    const r = scoreDeal([
      arr('AS AH AD', '2C 3D 4S'),
      arr('KS KH KD', '2H 3S 4D'),
      arr('5C 7D 9S', 'JS 8D 2H'),
    ]);
    // Pos 1: P0 beats P1 and P2; P1 beats P2. Pos 2: P0 = P1 (tie), both beat P2.
    expect(r.points).toEqual([3, 2, 0]);
    expect(r.pointsByPosition[0]).toEqual([2, 1]);
  });

  it('highest total wins; a shared top score means another deal', () => {
    expect(findWinner([9, 5, 3, 2], 10)).toBeNull();
    expect(findWinner([12, 10, 3, 2], 10)).toBe(0);
    expect(findWinner([12, 12, 3, 2], 10)).toBeNull();
    expect(findWinner([8, 21, 22], 21)).toBe(2);
  });

  it('rejects an arrangement that does not use the dealt cards exactly', () => {
    const dealt = h('AS AH AD 2C 3D 4S 5H');
    expect(validateArrangement(dealt, { hands: [h('AS AH AD'), h('2C 3D 4S')], spares: h('5H') }, 2)).toBeNull();
    expect(validateArrangement(dealt, { hands: [h('AS AH AD'), h('2C 3D 4S')], spares: [] }, 2)).not.toBeNull();
    expect(validateArrangement(dealt, { hands: [h('AS AH AD'), h('2C 3D 4S')], spares: h('6H') }, 2)).not.toBeNull();
    expect(validateArrangement(dealt, { hands: [h('AS AH AD')], spares: h('2C 3D 4S 5H') }, 2)).not.toBeNull();
  });
});

describe('computer players', () => {
  it('beats the naive split (Prile + Stiff + Run + leftover high card)', () => {
    const cards = h('KS KH KD 2D 3D 4D QC JH 9S 7C 5H 6S 8D');
    const total = (hands: Card[][]) => hands.reduce((s, x) => s + strength(evaluate(x)), 0);
    const naive = [h('KS KH KD'), h('2D 3D 4D'), h('5H 6S 7C'), h('QC JH 9S')];
    const hands = bestPartition(cards, 4);
    expect(total(hands)).toBeGreaterThanOrEqual(total(naive));
    // Here every hand can be made at least a Pair.
    expect(hands.every((x) => evaluate(x).category >= Category.Pair)).toBe(true);
    // Strongest hand comes first.
    expect(evaluate(hands[0]).value).toBeGreaterThanOrEqual(evaluate(hands[3]).value);
  });

  it('always makes a legal arrangement, fast enough for a phone', () => {
    const rng = mulberry32(7);
    for (const count of [3, 4] as const) {
      for (let i = 0; i < 20; i++) {
        const dealt = dealCards(count, rng)[0];
        const handCount = count === 4 ? 4 : 5;
        const t = performance.now();
        const a = arrange(dealt, handCount, rng);
        expect(performance.now() - t).toBeLessThan(500);
        expect(validateArrangement(dealt, a, handCount)).toBeNull();
      }
    }
  });
});

describe('full game', () => {
  it.each([3, 4] as const)('an all-computer %i-player game reaches a winner', (count) => {
    const rng = mulberry32(count);
    let g = newGame(count, 'Bot', undefined, rng);
    g = { ...g, players: g.players.map((p) => ({ ...p, isHuman: false })) };
    while (g.phase !== 'over' && g.dealNumber < 50) {
      g = playDeal(g, null, rng);
      if (g.phase === 'reveal') g = startDeal(g, rng);
    }
    expect(g.phase).toBe('over');
    expect(g.scores[g.winner!]).toBeGreaterThanOrEqual(g.target);
  });
});
