import type { Card } from './cards.ts';

/**
 * Hand categories, higher beats lower. Only Prile, Stiff, Run and Flush are
 * playable hands in Crash; three cards that make none of them cannot be played
 * (the player declines that hand instead).
 */
export const Category = {
  None: 0,
  Flush: 1,
  Run: 2,
  Stiff: 3,
  Prile: 4,
} as const;
export type Category = (typeof Category)[keyof typeof Category];

export const CATEGORY_NAME: Record<Category, string> = {
  [Category.None]: 'Not a hand',
  [Category.Flush]: 'Flush',
  [Category.Run]: 'Run',
  [Category.Stiff]: 'Stiff',
  [Category.Prile]: 'Prile',
};

export const CATEGORY_BLURB: Record<Category, string> = {
  [Category.None]: 'Needs a Prile, Stiff, Run or Flush',
  [Category.Flush]: 'Three of the same suit',
  [Category.Run]: 'Three in a row, any suits',
  [Category.Stiff]: 'Three in a row, same suit',
  [Category.Prile]: 'Three of the same rank',
};

export interface HandEval {
  category: Category;
  /** Tie-break ranks, most significant first. */
  ranks: number[];
  /** Single comparable number: category, then tie-break ranks. Higher wins. */
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
  } else {
    category = Category.None;
    ranks = r;
  }

  let value: number = category;
  for (let i = 0; i < 3; i++) value = value * 15 + (ranks[i] ?? 0);
  return { category, ranks, value };
}

export function isPlayable(cards: readonly Card[]): boolean {
  return evaluate(cards).category !== Category.None;
}

/** Positive if a beats b, negative if b beats a, 0 for an exact tie. `null` is a declined hand. */
export function compareHands(a: readonly Card[] | null, b: readonly Card[] | null): number {
  return Math.sign(handValue(a) - handValue(b));
}

/** Declined hands score -1: they lose to every real hand and tie with each other. */
export function handValue(cards: readonly Card[] | null): number {
  return cards ? evaluate(cards).value : -1;
}

/** Cards ordered for display: highest first; an A-2-3 run shows the ace last (3 2 A). */
export function displayOrder(cards: readonly Card[]): Card[] {
  const sorted = cards.slice().sort((a, b) => b.rank - a.rank);
  const { category, ranks } = evaluate(sorted);
  if ((category === Category.Run || category === Category.Stiff) && ranks[0] === 3) sorted.push(sorted.shift()!);
  return sorted;
}
