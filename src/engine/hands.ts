import type { Card } from './cards';

/** Higher value beats lower. */
export enum Category {
  HighCard = 0,
  Pair = 1,
  Flush = 2,
  Run = 3,
  Stiff = 4,
  Prile = 5,
}

export const CATEGORY_NAME: Record<Category, string> = {
  [Category.HighCard]: 'High card',
  [Category.Pair]: 'Pair',
  [Category.Flush]: 'Flush',
  [Category.Run]: 'Run',
  [Category.Stiff]: 'Stiff',
  [Category.Prile]: 'Prile',
};

export interface HandEval {
  category: Category;
  /** Tie-break ranks, most significant first. */
  ranks: number[];
  /** Single comparable number: category, then tie-break ranks. */
  value: number;
}

export function evaluate(cards: readonly Card[]): HandEval {
  if (cards.length !== 3) throw new Error(`A hand needs exactly 3 cards, got ${cards.length}`);

  const r = cards.map((c) => c.rank).sort((a, b) => b - a);
  const flush = cards[0].suit === cards[1].suit && cards[1].suit === cards[2].suit;

  // Ace plays high (Q-K-A) or low (A-2-3, whose top card is the 3). No wrap-around.
  let straightHigh = 0;
  if (r[0] - 1 === r[1] && r[1] - 1 === r[2]) straightHigh = r[0];
  else if (r[0] === 14 && r[1] === 3 && r[2] === 2) straightHigh = 3;

  let category: Category;
  let ranks: number[];
  if (r[0] === r[2]) {
    category = Category.Prile;
    ranks = [r[0]];
  } else if (straightHigh && flush) {
    category = Category.Stiff;
    ranks = [straightHigh];
  } else if (straightHigh) {
    category = Category.Run;
    ranks = [straightHigh];
  } else if (flush) {
    category = Category.Flush;
    ranks = r;
  } else if (r[0] === r[1]) {
    category = Category.Pair;
    ranks = [r[0], r[2]];
  } else if (r[1] === r[2]) {
    category = Category.Pair;
    ranks = [r[1], r[0]];
  } else {
    category = Category.HighCard;
    ranks = r;
  }

  let value = category;
  for (let i = 0; i < 3; i++) value = value * 15 + (ranks[i] ?? 0);
  return { category, ranks, value };
}

/** Positive if a beats b, negative if b beats a, 0 for an exact tie. */
export function compareHands(a: readonly Card[], b: readonly Card[]): number {
  return Math.sign(evaluate(a).value - evaluate(b).value);
}

/** Cards ordered for display: flush shows highest first, as the rules describe. */
export function displayOrder(cards: readonly Card[]): Card[] {
  const sorted = cards.slice().sort((a, b) => b.rank - a.rank);
  // A-2-3 plays the ace low, so show it last: 3 2 A.
  const { category, ranks } = evaluate(sorted);
  if ((category === Category.Run || category === Category.Stiff) && ranks[0] === 3) sorted.push(sorted.shift()!);
  return sorted;
}
