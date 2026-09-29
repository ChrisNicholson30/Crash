import type { Card, Rng } from './cards.ts';
import { handValue } from './hands.ts';
import { bestPartition, percentile } from './partition.ts';
import { RULES, type Arrangement, type Match } from './match.ts';
import TABLES from './ai-tables.json' with { type: 'json' };

const tables = TABLES as unknown as Record<string, number[][]>;

/**
 * Chance this hand beats one opponent's hand in the same position, from
 * simulated deals where every player arranges as well as the computer does.
 */
export function positionWinChance(handCount: number, position: number, value: number): number {
  const t = tables[String(handCount)]?.[position];
  return t ? percentile(t, value) : 0.5;
}

/** Chance of beating every opponent in this position. */
export function beatAllChance(handCount: number, position: number, value: number, opponents: number): number {
  return positionWinChance(handCount, position, value) ** opponents;
}

export function aiArrange(cards: readonly Card[], handCount: number): Arrangement {
  const hands = bestPartition(cards, handCount);
  const used = new Set(hands.flatMap((h) => h ?? []));
  return { hands, spares: cards.filter((c) => !used.has(c)) };
}

/**
 * Calls Crash only when the hands still to play (from `from` on) look very
 * likely to beat everyone.
 */
export function aiCallsCrash(arr: Arrangement, activeCount: number, rng: Rng, from = 0): boolean {
  if (arr.hands.some((h) => h === null)) return false;
  const opponents = activeCount - 1;
  const all = arr.hands.reduce(
    (p, h, pos) => (pos < from ? p : p * beatAllChance(arr.hands.length, pos, handValue(h), opponents)),
    1,
  );
  return all > 0.5 || (all > 0.22 && rng() < 0.35);
}

const roundBet = (x: number) => Math.round(x / 50) * 50;

/**
 * Chooses a bet for one hand. `row` holds the bets already placed this hand
 * (null = not yet bet), so later bettors react to earlier ones.
 */
export function aiBet(m: Match, seat: number, hand: Card[], row: readonly (number | null)[], rng: Rng): number {
  const d = m.deal;
  const opponents = d.active.length - 1;
  const win = beatAllChance(d.handCount, d.position, handValue(hand), opponents);
  const tokens = m.players[seat].tokens;
  const unit = RULES.minBet;
  const scale = tokens > RULES.startTokens * 2.5 ? 2 : tokens > 0 ? 1 : 0.5;
  const r = rng();

  // Always at least the table minimum (the engine enforces it); more when the hand looks good.
  let bet: number;
  if (win > 0.8) bet = unit * (6 + r * 8);
  else if (win > 0.55) bet = unit * (2 + r * 4);
  else if (win > 0.35) bet = r < 0.6 ? unit * (1 + r * 2) : unit;
  else bet = r < 0.07 ? unit * 3 : unit; // the odd bluff

  const biggest = Math.max(0, ...row.map((b, s) => (s === seat ? 0 : (b ?? 0))));
  if (biggest >= unit * 8 && win < 0.5) bet = unit; // don't chase a big bet with a weak hand
  if (d.crash[seat]) bet = Math.max(bet, RULES.crashMinBet);
  return roundBet(bet * scale);
}
