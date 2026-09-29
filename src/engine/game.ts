import { makeDeck, sameCard, shuffle, type Card, type Rng } from './cards';
import { evaluate, type HandEval } from './hands';
import { arrange } from './ai';

export type PlayerCount = 3 | 4;

export const DEFAULT_TARGET: Record<PlayerCount, number> = { 3: 21, 4: 10 };
export const HANDS_PER_PLAYER: Record<PlayerCount, number> = { 3: 5, 4: 4 };
export const CARDS_PER_PLAYER: Record<PlayerCount, number> = { 3: 17, 4: 13 };

export interface Arrangement {
  /** Hand 1 first. Each hand is exactly 3 cards. */
  hands: Card[][];
  /** Thrown away; no effect on scoring. */
  spares: Card[];
}

export interface Player {
  name: string;
  isHuman: boolean;
}

export interface Matchup {
  position: number;
  a: number;
  b: number;
  /** Player index, or null for an exact tie. */
  winner: number | null;
}

export interface DealResult {
  points: number[];
  /** pointsByPosition[player][position] */
  pointsByPosition: number[][];
  matchups: Matchup[];
  evals: HandEval[][];
  arrangements: Arrangement[];
}

export type Phase = 'arranging' | 'reveal' | 'over';

export interface GameState {
  playerCount: PlayerCount;
  target: number;
  players: Player[];
  scores: number[];
  dealNumber: number;
  phase: Phase;
  /** Cards dealt to each player this deal. */
  dealt: Card[][];
  lastResult: DealResult | null;
  winner: number | null;
}

export function dealCards(playerCount: PlayerCount, rng: Rng = Math.random): Card[][] {
  const deck = shuffle(makeDeck(), rng);
  const per = CARDS_PER_PLAYER[playerCount];
  return Array.from({ length: playerCount }, (_, p) => deck.slice(p * per, (p + 1) * per));
}

/** Returns an error message, or null if the arrangement is legal for these dealt cards. */
export function validateArrangement(dealt: readonly Card[], arr: Arrangement, handCount: number): string | null {
  if (arr.hands.length !== handCount) return `Make exactly ${handCount} hands`;
  if (arr.hands.some((h) => h.length !== 3)) return 'Every hand needs 3 cards';
  const all = [...arr.hands.flat(), ...arr.spares];
  if (all.length !== dealt.length) return 'Every dealt card must be used once';
  for (const card of dealt) {
    if (all.filter((c) => sameCard(c, card)).length !== 1) return 'Every dealt card must be used once';
  }
  return null;
}

/** Each hand position is compared between every pair of players; the better hand scores 1. */
export function scoreDeal(arrangements: Arrangement[]): DealResult {
  const n = arrangements.length;
  const positions = arrangements[0].hands.length;
  const evals = arrangements.map((a) => a.hands.map((h) => evaluate(h)));
  const points = new Array<number>(n).fill(0);
  const pointsByPosition = Array.from({ length: n }, () => new Array<number>(positions).fill(0));
  const matchups: Matchup[] = [];

  for (let pos = 0; pos < positions; pos++) {
    for (let a = 0; a < n; a++) {
      for (let b = a + 1; b < n; b++) {
        const diff = evals[a][pos].value - evals[b][pos].value;
        const winner = diff > 0 ? a : diff < 0 ? b : null;
        if (winner !== null) {
          points[winner]++;
          pointsByPosition[winner][pos]++;
        }
        matchups.push({ position: pos, a, b, winner });
      }
    }
  }
  return { points, pointsByPosition, matchups, evals, arrangements };
}

/**
 * Winner once someone reaches the target: the highest total wins.
 * If the top total is shared, returns null and another deal is played.
 */
export function findWinner(scores: readonly number[], target: number): number | null {
  const top = Math.max(...scores);
  if (top < target) return null;
  const leaders = scores.flatMap((s, i) => (s === top ? [i] : []));
  return leaders.length === 1 ? leaders[0] : null;
}

const AI_NAMES = ['Ava', 'Ben', 'Cal'];

export function newGame(
  playerCount: PlayerCount,
  humanName = 'You',
  target = DEFAULT_TARGET[playerCount],
  rng: Rng = Math.random,
): GameState {
  const players: Player[] = [
    { name: humanName, isHuman: true },
    ...AI_NAMES.slice(0, playerCount - 1).map((name) => ({ name, isHuman: false })),
  ];
  return startDeal(
    {
      playerCount,
      target,
      players,
      scores: new Array<number>(playerCount).fill(0),
      dealNumber: 0,
      phase: 'arranging',
      dealt: [],
      lastResult: null,
      winner: null,
    },
    rng,
  );
}

export function startDeal(state: GameState, rng: Rng = Math.random): GameState {
  if (state.phase === 'over') return state;
  return {
    ...state,
    dealNumber: state.dealNumber + 1,
    phase: 'arranging',
    dealt: dealCards(state.playerCount, rng),
  };
}

/**
 * Plays the deal: `human` is the arrangement for player 0 (omit for all-AI play).
 * Computer players arrange their own cards.
 */
export function playDeal(state: GameState, human: Arrangement | null, rng: Rng = Math.random): GameState {
  if (state.phase !== 'arranging') throw new Error('Not in the arranging phase');
  const handCount = HANDS_PER_PLAYER[state.playerCount];

  const arrangements = state.players.map((p, i) => {
    if (p.isHuman && human) {
      const err = validateArrangement(state.dealt[i], human, handCount);
      if (err) throw new Error(err);
      return human;
    }
    return arrange(state.dealt[i], handCount, rng);
  });

  const result = scoreDeal(arrangements);
  const scores = state.scores.map((s, i) => s + result.points[i]);
  const winner = findWinner(scores, state.target);
  return { ...state, scores, lastResult: result, winner, phase: winner === null ? 'reveal' : 'over' };
}
