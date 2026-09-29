// Simulates many deals, arranges every seat with the computer's own partition,
// and records the value distribution of each hand position. The computer players
// use these tables to judge how likely a hand is to win, for betting and Crash calls.
//
// Run: pnpm ai:tables   (writes src/engine/ai-tables.json)
import { writeFileSync } from 'node:fs';
import { makeDeck, mulberry32, shuffle } from '../src/engine/cards.ts';
import { handValue } from '../src/engine/hands.ts';
import { bestPartition } from '../src/engine/partition.ts';

const QUANTILES = 256;
const layouts = [
  { players: 4, cards: 13, hands: 4, deals: 3000 },
  { players: 3, cards: 17, hands: 5, deals: 2500 },
];

const rng = mulberry32(20260929);
const tables: Record<string, number[][]> = {};
for (const l of layouts) {
  const samples: number[][] = Array.from({ length: l.hands }, () => []);
  for (let d = 0; d < l.deals; d++) {
    const deck = shuffle(makeDeck(), rng);
    for (let p = 0; p < l.players; p++) {
      const hands = bestPartition(deck.slice(p * l.cards, (p + 1) * l.cards), l.hands);
      hands.forEach((h, pos) => samples[pos].push(handValue(h)));
    }
  }
  tables[l.hands] = samples.map((s) => {
    s.sort((a, b) => a - b);
    return Array.from({ length: QUANTILES }, (_, q) => s[Math.min(s.length - 1, Math.floor(((q + 0.5) / QUANTILES) * s.length))]);
  });
  const declined = samples.map((s) => (s.filter((v) => v < 0).length / s.length) * 100);
  console.log(`${l.players} players: declined % by position`, declined.map((v) => v.toFixed(1)).join(' / '));
}
writeFileSync(new URL('../src/engine/ai-tables.json', import.meta.url), JSON.stringify(tables) + '\n');
console.log('wrote src/engine/ai-tables.json');
