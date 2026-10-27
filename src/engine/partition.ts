import { makeDeck, type Card } from './cards.ts';
import { Category, evaluate, type HandEval } from './hands.ts';

// Every possible 3-card hand's value, sorted, so any hand can be scored by percentile.
const ALL_VALUES: Float64Array = (() => {
  const deck = makeDeck();
  const values: number[] = [];
  for (let i = 0; i < deck.length; i++)
    for (let j = i + 1; j < deck.length; j++)
      for (let k = j + 1; k < deck.length; k++) values.push(evaluate([deck[i], deck[j], deck[k]]).value);
  return Float64Array.from(values.sort((a, b) => a - b));
})();

function lowerBound(arr: ArrayLike<number>, v: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] < v) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Fraction of `sorted` below v, counting ties as half. */
export function percentile(sorted: ArrayLike<number>, v: number): number {
  if (!sorted.length) return 0.5;
  const below = lowerBound(sorted, v);
  const upTo = lowerBound(sorted, v + 0.5);
  return (below + (upTo - below) / 2) / sorted.length;
}

/** Fraction of all 3-card hands this hand beats. */
export function strength(ev: HandEval): number {
  return percentile(ALL_VALUES, ev.value);
}

interface Triple {
  cards: Card[];
  mask: number;
  score: number;
}

const NODE_LIMIT = 80_000;

/**
 * Picks up to `handCount` disjoint playable hands (Prile, Stiff, Run, Flush)
 * maximising total strength, strongest first. Missing hands are `null` (declined).
 */
export function bestPartition(cards: readonly Card[], handCount: number): (Card[] | null)[] {
  const n = cards.length;
  const triples: Triple[] = [];
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++)
      for (let k = j + 1; k < n; k++) {
        const hand = [cards[i], cards[j], cards[k]];
        const ev = evaluate(hand);
        if (ev.category !== Category.None)
          triples.push({ cards: hand, mask: (1 << i) | (1 << j) | (1 << k), score: 1 + strength(ev) });
      }
  // The +1 per hand makes an extra playable hand always worth more than a stronger single one.
  triples.sort((a, b) => b.score - a.score);

  let bestScore = -1;
  let best: Triple[] = [];
  let nodes = 0;

  const search = (start: number, used: number, chosen: Triple[], sum: number) => {
    if (sum > bestScore) {
      bestScore = sum;
      best = chosen;
    }
    if (chosen.length === handCount || ++nodes > NODE_LIMIT) return;
    const slots = handCount - chosen.length;
    for (let i = start; i < triples.length; i++) {
      const t = triples[i];
      if (sum + slots * t.score <= bestScore) break; // sorted descending: nothing later can do better
      if (t.mask & used) continue;
      search(i + 1, used | t.mask, [...chosen, t], sum + t.score);
    }
  };
  search(0, 0, [], 0);

  const hands: (Card[] | null)[] = best
    .map((t) => t.cards)
    .sort((a, b) => evaluate(b).value - evaluate(a).value);
  while (hands.length < handCount) hands.push(null);
  return hands;
}

/**
 * A beginner's arrangement: grabs the strongest hand it can see, then the
 * next, without looking ahead (so a Prile can cost it two Runs). Now and then
 * it settles for a weaker hand than the best one on offer.
 */
export function greedyPartition(cards: readonly Card[], handCount: number, rng: () => number, slip = 0.25): (Card[] | null)[] {
  const n = cards.length;
  const triples: Triple[] = [];
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++)
      for (let k = j + 1; k < n; k++) {
        const hand = [cards[i], cards[j], cards[k]];
        const ev = evaluate(hand);
        if (ev.category !== Category.None) triples.push({ cards: hand, mask: (1 << i) | (1 << j) | (1 << k), score: ev.value });
      }
  triples.sort((a, b) => b.score - a.score);

  const hands: Card[][] = [];
  let used = 0;
  while (hands.length < handCount) {
    const open = triples.filter((t) => !(t.mask & used));
    if (!open.length) break;
    const pick = open.length > 1 && rng() < slip ? open[1 + Math.floor(rng() * Math.min(3, open.length - 1))] : open[0];
    hands.push(pick.cards);
    used |= pick.mask;
  }
  const out: (Card[] | null)[] = hands.sort((a, b) => evaluate(b).value - evaluate(a).value);
  while (out.length < handCount) out.push(null);
  return out;
}

/**
 * The `keep` highest-scoring ways to split the cards into hands (same scoring
 * as bestPartition), each strongest first, so a caller can re-rank them by
 * something sharper than raw strength.
 */
export function topPartitions(cards: readonly Card[], handCount: number, keep: number): (Card[] | null)[][] {
  const n = cards.length;
  const triples: Triple[] = [];
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++)
      for (let k = j + 1; k < n; k++) {
        const hand = [cards[i], cards[j], cards[k]];
        const ev = evaluate(hand);
        if (ev.category !== Category.None)
          triples.push({ cards: hand, mask: (1 << i) | (1 << j) | (1 << k), score: 1 + strength(ev) });
      }
  triples.sort((a, b) => b.score - a.score);

  // Best `keep` complete (or as complete as possible) selections, highest score first.
  const found: { score: number; picks: Triple[] }[] = [];
  const floor = () => (found.length < keep ? -1 : found[found.length - 1].score);
  let nodes = 0;
  const search = (start: number, used: number, chosen: Triple[], sum: number) => {
    let extended = false;
    if (chosen.length < handCount && ++nodes <= NODE_LIMIT * 2) {
      const slots = handCount - chosen.length;
      for (let i = start; i < triples.length; i++) {
        const t = triples[i];
        if (sum + slots * t.score <= floor()) break;
        if (t.mask & used) continue;
        extended = true;
        search(i + 1, used | t.mask, [...chosen, t], sum + t.score);
      }
    }
    // Record leaves only: a selection that couldn't take another hand.
    if (!extended && sum > floor()) {
      found.push({ score: sum, picks: chosen });
      found.sort((a, b) => b.score - a.score);
      if (found.length > keep) found.pop();
    }
  };
  search(0, 0, [], 0);

  return found.map(({ picks }) => {
    const hands: (Card[] | null)[] = picks.map((t) => t.cards).sort((a, b) => evaluate(b).value - evaluate(a).value);
    while (hands.length < handCount) hands.push(null);
    return hands;
  });
}
