import { useState } from 'react';
import { motion } from 'motion/react';
import type { Card } from '../engine/cards.ts';
import { PlayingCard } from './PlayingCard.tsx';

interface Props {
  canResume: boolean;
  onResume: () => void;
  onStart: (players: 3 | 4, name: string) => void;
  onRules: () => void;
}

const FAN: Card[] = [
  { rank: 14, suit: 'S' },
  { rank: 13, suit: 'H' },
  { rank: 12, suit: 'D' },
  { rank: 11, suit: 'C' },
  { rank: 10, suit: 'H' },
];

export function Home({ canResume, onResume, onStart, onRules }: Props) {
  const [players, setPlayers] = useState<3 | 4>(4);
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem('crash:name') ?? '';
    } catch {
      return '';
    }
  });

  const start = () => {
    const n = name.trim() || 'You';
    try {
      localStorage.setItem('crash:name', n);
    } catch {
      /* storage unavailable */
    }
    onStart(players, n);
  };

  return (
    <main className="home">
      <div className="fan" aria-hidden="true">
        {FAN.map((c, i) => (
          <motion.div
            key={i}
            className="fan-card"
            initial={{ opacity: 0, y: 80, rotate: 0 }}
            animate={{ opacity: 1, y: [0, -6, 0], rotate: (i - 2) * 11 }}
            transition={{
              opacity: { delay: 0.1 + i * 0.08 },
              rotate: { type: 'spring', stiffness: 120, damping: 14, delay: 0.1 + i * 0.08 },
              y: { duration: 4, repeat: Infinity, ease: 'easeInOut', delay: i * 0.3 },
            }}
            style={{ zIndex: i }}
          >
            <PlayingCard card={c} size="lg" />
          </motion.div>
        ))}
      </div>

      <motion.h1 className="wordmark" initial={{ opacity: 0, letterSpacing: '0.6em' }} animate={{ opacity: 1, letterSpacing: '0.12em' }} transition={{ duration: 1.1, ease: [0.2, 0.8, 0.2, 1] }}>
        CRASH
      </motion.h1>
      <motion.p className="tagline" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
        Thirteen-card brag. Build your hands, back them with Barney tokens, and call the Crash.
      </motion.p>

      <motion.section className="glass setup" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35, type: 'spring', stiffness: 160, damping: 22 }}>
        <label className="field">
          <span>Your name</span>
          <input value={name} placeholder="You" maxLength={12} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="field">
          <span>Table</span>
          <div className="seg">
            {([3, 4] as const).map((p) => (
              <button key={p} type="button" className={players === p ? 'on' : ''} aria-pressed={players === p} onClick={() => setPlayers(p)}>
                <b>{p} players</b>
                <small>{p === 4 ? '13 cards · 4 hands' : '17 cards · 5 hands'}</small>
                {players === p && <motion.span layoutId="seg-pill" className="seg-pill" />}
              </button>
            ))}
          </div>
        </div>
        <ul className="facts">
          <li>
            <b>10</b> points wins a leg
          </li>
          <li>
            <b>3</b> legs wins a set
          </li>
          <li>
            <b>3</b> sets wins the game
          </li>
        </ul>
        <button type="button" className="btn gold big" onClick={start}>
          Deal me in
        </button>
        {canResume && (
          <button type="button" className="btn ghost" onClick={onResume}>
            Resume game
          </button>
        )}
        <button type="button" className="btn link" onClick={onRules}>
          How to play
        </button>
      </motion.section>
    </main>
  );
}
