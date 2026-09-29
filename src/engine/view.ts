import type { Card } from './cards.ts';
import type { Arrangement, Match } from './match.ts';

/** Stand-in for a card the viewer isn't allowed to see (rendered face down). */
export const HIDDEN: Card = { rank: 0, suit: 'S' };
const hiddenHand = (): Card[] => [HIDDEN, HIDDEN, HIDDEN];

/**
 * What one seat is allowed to see: their own cards, other players' hands only
 * once turned over, and nobody else's Crash call until hand 1 is under way.
 * The server sends this instead of the full match so nobody can peek.
 */
export function viewFor(m: Match, seat: number): Match {
  const d = m.deal;
  const revealed = d.results.length;
  const arrangements = d.arrangements.map((a, s): Arrangement | null => {
    if (!a || s === seat) return a;
    return {
      hands: a.hands.map((h, p) => (p < revealed ? h : h ? hiddenHand() : null)),
      spares: [],
    };
  });
  return {
    ...m,
    deal: {
      ...d,
      dealt: d.dealt.map((cards, s) => (s === seat ? cards : [])),
      arrangements: m.phase === 'arrange' ? arrangements.map((a, s) => (s === seat ? a : null)) : arrangements,
      crash: m.phase === 'arrange' ? d.crash.map((c, s) => (s === seat ? c : false)) : d.crash,
    },
  };
}
