import { useEffect, useMemo, useRef } from 'react';
import { motion } from 'motion/react';
import confetti from 'canvas-confetti';
import { Coin } from './Token.tsx';

const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Living felt: drifting pools of light and slowly rising suit symbols. */
export function Backdrop() {
  const suits = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => ({
        ch: '♠♥♦♣'[i % 4],
        left: (i * 37) % 100,
        size: 14 + ((i * 7) % 22),
        dur: 18 + ((i * 5) % 14),
        delay: -((i * 3.7) % 20),
        red: i % 4 === 1 || i % 4 === 2,
      })),
    [],
  );
  return (
    <div className="felt" aria-hidden="true">
      <span className="glow g1" />
      <span className="glow g2" />
      <span className="glow g3" />
      {suits.map((s, i) => (
        <span
          key={i}
          className={`drift${s.red ? ' red' : ''}`}
          style={{ left: `${s.left}%`, fontSize: s.size, animationDuration: `${s.dur}s`, animationDelay: `${s.delay}s` }}
        >
          {s.ch}
        </span>
      ))}
    </div>
  );
}

/** Rotating light rays, for winners. */
export function Rays({ color = 'rgb(243 220 156 / 0.35)', size = 520 }: { color?: string; size?: number }) {
  return (
    <motion.span
      className="rays"
      aria-hidden="true"
      style={{ width: size, height: size, ['--ray' as string]: color }}
      initial={{ opacity: 0, scale: 0.4, rotate: 0 }}
      animate={{ opacity: 1, scale: 1, rotate: 360 }}
      transition={{ opacity: { duration: 0.4 }, scale: { type: 'spring', stiffness: 120, damping: 14 }, rotate: { duration: 24, repeat: Infinity, ease: 'linear' } }}
    />
  );
}

export interface Point {
  x: number;
  y: number;
}

/** Coins arcing from one point on screen to another (pot → winner). */
export function CoinFlight({ from, to, count = 8, delay = 0 }: { from: Point; to: Point; count?: number; delay?: number }) {
  if (reduced()) return null;
  return (
    <div className="coin-flight" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => {
        const spread = (i - count / 2) * 9;
        const lift = 60 + (i % 3) * 30;
        return (
          <motion.span
            key={i}
            className="flying-coin"
            initial={{ x: from.x, y: from.y, scale: 0.4, opacity: 0 }}
            animate={{
              x: [from.x, (from.x + to.x) / 2 + spread, to.x],
              y: [from.y, Math.min(from.y, to.y) - lift, to.y],
              scale: [0.4, 1.15, 0.7],
              opacity: [0, 1, 1, 0],
              rotate: [0, 180, 360],
            }}
            transition={{ duration: 0.85, delay: delay + i * 0.05, ease: [0.3, 0.1, 0.3, 1], times: [0, 0.5, 1] }}
          >
            <Coin size={18} />
          </motion.span>
        );
      })}
    </div>
  );
}

export function fireConfetti(colors = ['#d8b56a', '#f3dc9c', '#f7f4ec', '#6fb7a0', '#ff6a5b']) {
  if (reduced()) return;
  const fire = (x: number, angle: number) =>
    confetti({ particleCount: 70, angle, spread: 65, startVelocity: 55, origin: { x, y: 0.75 }, colors, scalar: 1.1, disableForReducedMotion: true });
  fire(0.05, 60);
  fire(0.95, 120);
  setTimeout(() => confetti({ particleCount: 140, spread: 110, startVelocity: 40, origin: { x: 0.5, y: 0.35 }, colors, shapes: ['circle', 'square'], disableForReducedMotion: true }), 250);
}

/** Full-screen moment for winning a leg, a set or the game. */
export function Celebration({
  kind,
  name,
  mine,
  detail,
  onDone,
}: {
  kind: 'leg' | 'set' | 'game';
  name: string;
  mine: boolean;
  detail: string;
  onDone: () => void;
}) {
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    if (mine || kind === 'game') fireConfetti();
    navigator.vibrate?.(mine ? [30, 40, 30, 40, 120] : 40);
    const t = setTimeout(() => done.current(), kind === 'leg' ? 2600 : 4200);
    return () => clearTimeout(t);
  }, [kind, mine]);

  const title = kind === 'game' ? (mine ? 'CHAMPION' : 'GAME OVER') : kind === 'set' ? 'SET WON' : 'LEG WON';
  return (
    <motion.div className={`celebrate-screen ${kind}${mine ? ' mine' : ''}`} onClick={onDone} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <Rays size={760} color={mine ? 'rgb(243 220 156 / 0.28)' : 'rgb(255 255 255 / 0.1)'} />
      <motion.div className="medal" initial={{ scale: 0, rotate: -40 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 13, delay: 0.1 }}>
        <span className="medal-inner">{kind === 'game' ? '♛' : kind === 'set' ? '★' : '✦'}</span>
      </motion.div>
      <motion.h2 className="celebrate-title" initial={{ y: 40, opacity: 0, scale: 0.6 }} animate={{ y: 0, opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 16, delay: 0.25 }}>
        {title.split('').map((ch, i) => (
          <motion.span key={i} initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3 + i * 0.04 }}>
            {ch === ' ' ? ' ' : ch}
          </motion.span>
        ))}
      </motion.h2>
      <motion.p className="celebrate-name" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}>
        {mine ? 'You did it!' : `${name} takes it`}
      </motion.p>
      <motion.small initial={{ opacity: 0 }} animate={{ opacity: 0.7 }} transition={{ delay: 1 }}>
        {detail}
      </motion.small>
    </motion.div>
  );
}
