import type { Card, Rng } from './cards.ts';
import { handValue } from './hands.ts';
import { bestPartition, greedyPartition, percentile, topPartitions } from './partition.ts';
import { RULES, type Arrangement, type Hand, type Match, type Skill } from './match.ts';
import TABLES from './ai-tables.json' with { type: 'json' };

const tables = TABLES as unknown as Record<string, number[][]>;

/**
 * Chance this hand beats one opponent's hand in the same position, from
 * simulated deals where every player arranges as well as the computer does.
 */
export function positionWinChance(handCount: number, position: number, value: number): number {
  if (value < 0) return 0;
  const t = tables[String(handCount)]?.[position];
  return t ? percentile(t, value) : 0.5;
}

/** Chance of beating every opponent in this position. */
export function beatAllChance(handCount: number, position: number, value: number, opponents: number): number {
  return positionWinChance(handCount, position, value) ** opponents;
}

/** Chance a set of hands (strongest first) wins every position against everyone: what a Crash needs. */
export function crashChance(hands: readonly Hand[], opponents: number): number {
  if (hands.some((h) => h === null)) return 0;
  return hands.reduce((p, h, pos) => p * beatAllChance(hands.length, pos, handValue(h), opponents), 1);
}

/** Expected points from a set of hands: one per opponent beaten in each position. */
export function expectedPoints(hands: readonly Hand[], opponents: number): number {
  return hands.reduce((s, h, pos) => s + positionWinChance(hands.length, pos, handValue(h)) * opponents, 0);
}

export function aiArrange(cards: readonly Card[], handCount: number, skill: Skill = 'normal', rng: Rng = Math.random): Arrangement {
  const hands =
    skill === 'easy' ? greedyPartition(cards, handCount, rng) : skill === 'hard' ? sharpPartition(cards, handCount) : bestPartition(cards, handCount);
  const used = new Set(hands.flatMap((h) => h ?? []));
  return { hands, spares: cards.filter((c) => !used.has(c)) };
}

/**
 * Of the strongest few ways to split the cards, the one that expects the most
 * points, judged position by position (a decent hand can win more in a later
 * position than a slightly better one up front).
 */
function sharpPartition(cards: readonly Card[], handCount: number): Hand[] {
  const options = topPartitions(cards, handCount, 24);
  const score = (hands: Hand[]) => expectedPoints(hands, 3);
  return options.reduce((best, o) => (score(o) > score(best) ? o : best), options[0] ?? bestPartition(cards, handCount));
}

/**
 * Calls Crash at the opening when the hands look strong enough to beat
 * everyone in every position. Easy players rarely dare; hard players call it
 * whenever the payout outweighs the risk of sitting out.
 */
export function aiCallsCrash(arr: Arrangement, activeCount: number, rng: Rng, skill: Skill = 'normal'): boolean {
  const all = crashChance(arr.hands, activeCount - 1);
  if (skill === 'easy') return all > 0.6;
  // Win: each opponent pays half the stake. Miss: pay half once, lose the stake on each hand lost, and sit out the leg.
  if (skill === 'hard') return all * (activeCount - 1) > (1 - all) * 3.8;
  return all > 0.5 || (all > 0.22 && rng() < 0.35);
}

const roundBet = (x: number) => Math.round(x / 50) * 50;

/**
 * Chooses the opening stake. `row` holds the stakes already chosen this deal
 * (null = not yet chosen), so later bettors react to earlier ones.
 */
export function aiBet(m: Match, seat: number, hand: Card[], row: readonly (number | null)[], rng: Rng): number {
  const d = m.deal;
  const skill = m.players[seat].skill ?? 'normal';
  const opponents = d.active.length - 1;
  const tokens = m.players[seat].tokens;
  const unit = RULES.minBet;
  const scale = tokens > RULES.startTokens * 2.5 ? 2 : tokens > 0 ? 1 : 0.5;
  const r = rng();
  const biggest = Math.max(0, ...row.map((b, s) => (s === seat ? 0 : (b ?? 0))));

  let bet: number;
  if (skill === 'hard') {
    bet = hardStake(m, seat, r);
  } else {
    const win = beatAllChance(d.handCount, d.position, handValue(hand), opponents);
    if (skill === 'easy') {
      // Beginners back a hand that looks good, which costs them when it isn't the best.
      bet = win > 0.5 ? unit * (1 + r * 4) : r < 0.3 ? unit * 2 : unit;
    } else {
      // Always at least the table minimum (the engine enforces it); more when the hand looks good.
      if (win > 0.8) bet = unit * (6 + r * 8);
      else if (win > 0.55) bet = unit * (2 + r * 4);
      else if (win > 0.35) bet = r < 0.6 ? unit * (1 + r * 2) : unit;
      else bet = r < 0.07 ? unit * 3 : unit; // the odd bluff
      if (biggest >= unit * 8 && win < 0.5) bet = unit; // don't chase a big bet with a weak hand
    }
  }
  if (d.crash[seat]) {
    const all = crashChance(d.arrangements[seat]!.hands, opponents);
    const crashStake = skill === 'hard' ? unit * (10 + all * 40) : skill === 'easy' ? RULES.crashMinBet : unit * (5 + all * 15);
    bet = Math.max(bet, crashStake, RULES.crashMinBet);
  }
  return roundBet(bet * scale);
}

/**
 * The pot goes to the best hand whatever its owner staked, so a bigger stake
 * only raises what you lose. A hard player keeps to the minimum and saves its
 * tokens for Crash calls, where the payout grows with the stake. It shows a
 * little more only when every hand it holds is close to unbeatable.
 */
function hardStake(m: Match, seat: number, r: number): number {
  const d = m.deal;
  const unit = RULES.minBet;
  const opponents = d.active.length - 1;
  const hands = d.arrangements[seat]?.hands ?? [];
  const chances = hands.flatMap((h, pos) => (h ? [beatAllChance(d.handCount, pos, handValue(h), opponents)] : []));
  return chances.length && chances.every((p) => p > 0.85) ? unit * (2 + r * 3) : unit;
}
