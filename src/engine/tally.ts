import type { Card } from './cards.ts';
import { handValue } from './hands.ts';
import type { Match } from './match.ts';

/** A player's running record across games. */
export interface Tally {
  games: number;
  wins: number;
  deals: number;
  /** Points scored (opponents' hands beaten). */
  points: number;
  legs: number;
  sets: number;
  crashes: number;
  crashesWon: number;
  /** Pots taken outright or shared. */
  pots: number;
  /** Strongest hand ever played, or null. */
  best: Card[] | null;
  /** Wins in a row (games). */
  streak: number;
  bestStreak: number;
}

export const emptyTally = (): Tally => ({
  games: 0,
  wins: 0,
  deals: 0,
  points: 0,
  legs: 0,
  sets: 0,
  crashes: 0,
  crashesWon: 0,
  pots: 0,
  best: null,
  streak: 0,
  bestStreak: 0,
});

/** What one seat did in a finished deal (phase dealEnd or gameOver). */
export function dealTally(m: Match, seat: number): Partial<Tally> {
  const d = m.deal;
  if (!d.active.includes(seat)) return {};
  const o = m.outcome;
  const crash = d.crashResults.find((r) => r.player === seat);
  const hands = d.arrangements[seat]?.hands ?? [];
  const best = hands.reduce<Card[] | null>((b, h) => (h && handValue(h) > handValue(b) ? h : b), null);
  return {
    deals: 1,
    points: d.pointsThisDeal[seat],
    legs: o?.legWinner === seat ? 1 : 0,
    sets: o?.setWinner === seat ? 1 : 0,
    crashes: crash ? 1 : 0,
    crashesWon: crash?.success ? 1 : 0,
    pots: d.results.filter((r) => r.pot > 0 && r.potWinners.includes(seat)).length,
    best,
  };
}

/** Adds one deal's numbers to a record. */
export function addDeal(t: Tally, part: Partial<Tally>): Tally {
  const best = part.best && handValue(part.best) > handValue(t.best) ? part.best : t.best;
  return {
    ...t,
    deals: t.deals + (part.deals ?? 0),
    points: t.points + (part.points ?? 0),
    legs: t.legs + (part.legs ?? 0),
    sets: t.sets + (part.sets ?? 0),
    crashes: t.crashes + (part.crashes ?? 0),
    crashesWon: t.crashesWon + (part.crashesWon ?? 0),
    pots: t.pots + (part.pots ?? 0),
    best,
  };
}

/** Adds a finished game. */
export function addGame(t: Tally, won: boolean): Tally {
  const streak = won ? t.streak + 1 : 0;
  return { ...t, games: t.games + 1, wins: t.wins + (won ? 1 : 0), streak, bestStreak: Math.max(t.bestStreak, streak) };
}
