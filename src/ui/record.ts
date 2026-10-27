import { useSyncExternalStore } from 'react';
import { addDeal, addGame, dealTally, emptyTally, type Tally } from '../engine/tally.ts';
import type { Match } from '../engine/match.ts';

/** Your record against the computer, kept on this device. */
const KEY = 'crash:record:v1';

interface Stored {
  tally: Tally;
  /** Deals and games already counted (match id : deal number), newest last. */
  counted: string[];
}

function read(): Stored {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Stored | null;
    return s ? { tally: { ...emptyTally(), ...s.tally }, counted: s.counted ?? [] } : { tally: emptyTally(), counted: [] };
  } catch {
    return { tally: emptyTally(), counted: [] };
  }
}

let current = read();
const listeners = new Set<() => void>();

function write(next: Stored) {
  current = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable */
  }
  listeners.forEach((l) => l());
}

/** Counts a finished deal (and the game, if it's over) once, however often it's shown. */
export function recordDeal(m: Match, seat: number) {
  if (!m.id || (m.phase !== 'dealEnd' && m.phase !== 'gameOver')) return;
  const dealKey = `${m.id}:${m.deal.number}`;
  const gameKey = `${m.id}:game`;
  let { tally, counted } = current;
  const before = tally;
  if (!counted.includes(dealKey)) {
    tally = addDeal(tally, dealTally(m, seat));
    counted = [...counted, dealKey];
  }
  if (m.phase === 'gameOver' && !counted.includes(gameKey)) {
    tally = addGame(tally, m.winner === seat);
    counted = [...counted, gameKey];
  }
  if (tally !== before) write({ tally, counted: counted.slice(-200) });
}

export function resetRecord() {
  write({ tally: emptyTally(), counted: current.counted });
}

export function useRecord(): Tally {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current.tally,
  );
}
