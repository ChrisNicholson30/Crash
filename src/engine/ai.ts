import { makeDeck, shuffle, type Card, type Rng } from './cards';
import { Category, evaluate, type HandEval } from './hands';
import type { Arrangement } from './game';

// Every possible 3-card hand's value, sorted, so any hand can be scored by percentile.
const ALL_VALUES: Float64Array = (() => {
  const deck = makeDeck();
  const values: number[] = [];
  for (let i = 0; i < deck.length; i++)
    for (let j = i + 1; j < deck.length; j++)
      for (let k = j + 1; k < deck.length; k++) values.push(evaluate([deck[i], deck[j], deck[k]]).value);
  return Float64Array.from(values.sort((a, b) => a - b));
})();

function lowerBound(v: number): number {
  let lo = 0;
  let hi = ALL_VALUES.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (ALL_VALUES[mid] < v) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Fraction of all 3-card hands this hand beats (ties count half). */
export function strength(ev: HandEval): number {
  const below = lowerBound(ev.value);
  const upTo = lowerBound(ev.value + 1);
  return (below + (upTo - below) / 2) / ALL_VALUES.length;
}

interface Triple {
  cards: Card[];
  mask: number;
  score: number;
}

const NODE_LIMIT = 60_000;

/**
 * Splits `cards` into `handCount` hands of 3 maximising total strength.
 * Branch-and-bound over the hands that are at least a Pair; leftovers are
 * shared out as high-card hands, each led by one of the best remaining cards.
 */
export function bestPartition(cards: readonly Card[], handCount: number): Card[][] {
  const n = cards.length;
  const spareCount = n - handCount * 3;
  if (spareCount < 0) throw new Error('Not enough cards for the hands required');

  const good: Triple[] = [];
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++)
      for (let k = j + 1; k < n; k++) {
        const triple = [cards[i], cards[j], cards[k]];
        const ev = evaluate(triple);
        if (ev.category >= Category.Pair)
          good.push({ cards: triple, mask: (1 << i) | (1 << j) | (1 << k), score: strength(ev) });
      }
  good.sort((a, b) => b.score - a.score);

  let bestScore = -1;
  let bestHands: Card[][] = [];
  let nodes = 0;

  const complete = (used: number, chosen: Triple[], sum: number) => {
    const slots = handCount - chosen.length;
    const left = cards.filter((_, i) => !(used & (1 << i))).sort((a, b) => b.rank - a.rank);
    const keep = left.slice(0, left.length - spareCount);
    const leaders = keep.slice(0, slots);
    const fillers = keep.slice(slots);
    const hands = chosen.map((t) => t.cards);
    let total = sum;
    for (let s = 0; s < slots; s++) {
      const hand = [leaders[s], fillers[2 * s], fillers[2 * s + 1]];
      total += strength(evaluate(hand));
      hands.push(hand);
    }
    if (total > bestScore) {
      bestScore = total;
      bestHands = hands;
    }
  };

  const search = (start: number, used: number, chosen: Triple[], sum: number) => {
    complete(used, chosen, sum);
    if (chosen.length === handCount || ++nodes > NODE_LIMIT) return;
    const slots = handCount - chosen.length;
    for (let i = start; i < good.length; i++) {
      const t = good[i];
      if (sum + slots * t.score <= bestScore) break; // sorted descending, so nothing later can do better
      if (t.mask & used) continue;
      search(i + 1, used | t.mask, [...chosen, t], sum + t.score);
    }
  };

  search(0, 0, [], 0);
  return bestHands.sort((a, b) => evaluate(b).value - evaluate(a).value);
}

/**
 * Builds a full arrangement. With an `rng`, the order of hands is sometimes
 * shuffled so the computer players are not perfectly predictable.
 */
export function arrange(cards: readonly Card[], handCount: number, rng?: Rng): Arrangement {
  let hands = bestPartition(cards, handCount);
  if (rng && rng() < 0.35) hands = shuffle(hands, rng);
  const used = new Set(hands.flat());
  return { hands, spares: cards.filter((c) => !used.has(c)) };
}
