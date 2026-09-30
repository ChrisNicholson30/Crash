import { useState } from 'react';
import { motion } from 'motion/react';
import type { Card } from '../engine/cards.ts';
import { PlayingCard } from './PlayingCard.tsx';
import { Coin } from './Token.tsx';

interface Props {
  user: { username: string } | null;
  unread: number;
  onOnline: () => void;
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

export function Home({ user, unread, onOnline, canResume, onResume, onStart, onRules }: Props) {
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
        {[0, 1, 2].map((i) => (
          <motion.span
            key={`coin${i}`}
            className="orbit-coin"
            style={{ left: ['6%', '86%', '74%'][i], top: ['58%', '18%', '78%'][i] }}
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1, y: [0, -14, 0], rotateY: [0, 360] }}
            transition={{ opacity: { delay: 0.8 + i * 0.15 }, scale: { delay: 0.8 + i * 0.15, type: 'spring' }, y: { duration: 2.6 + i * 0.4, repeat: Infinity, ease: 'easeInOut' }, rotateY: { duration: 3 + i, repeat: Infinity, ease: 'linear' } }}
          >
            <Coin size={[34, 26, 22][i]} />
          </motion.span>
        ))}
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
          <li>
            <b>10k</b> tokens each
          </li>
          <li>
            <b>½</b> your Crash stake if it fails
          </li>
        </ul>
        <button type="button" className="btn gold big" onClick={start}>
          Play the computer
        </button>
        <button type="button" className="btn online big" onClick={onOnline}>
          <span>Play friends online</span>
          {user ? <small>as {user.username}</small> : <small>log in or sign up</small>}
          {unread > 0 && <span className="unread">{unread}</span>}
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
