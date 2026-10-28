import { useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { buzz } from './settings.ts';
import { sfx } from './sound.ts';

/** Plain black table with a faint red glow. */
export function Backdrop() {
  return (
    <div className="felt" aria-hidden="true">
      <span className="glow g1" />
      <span className="glow g2" />
    </div>
  );
}

/** Full-screen notice for winning a leg, a set or the game. */
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
    buzz(mine ? [30, 40, 30, 40, 120] : 40);
    sfx.fanfare(kind === 'game');
    const t = setTimeout(() => done.current(), kind === 'leg' ? 2600 : 4200);
    return () => clearTimeout(t);
  }, [kind, mine]);

  const title = kind === 'game' ? (mine ? 'CHAMPION' : 'GAME OVER') : kind === 'set' ? 'SET WON' : 'LEG WON';
  return (
    <motion.div
      className={`celebrate-screen ${kind}${mine ? ' mine' : ''}`}
      onClick={onDone}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      <motion.span className="celebrate-spot" initial={{ scaleY: 0.2, opacity: 0 }} animate={{ scaleY: 1, opacity: 1 }} transition={{ duration: 0.6, ease: 'easeOut' }} />
      <motion.h2
        className="celebrate-title"
        initial={{ scale: 1.5, opacity: 0, filter: 'blur(8px)' }}
        animate={{ scale: 1, opacity: 1, filter: 'blur(0px)' }}
        transition={{ duration: 0.55, ease: [0.2, 0.9, 0.3, 1] }}
      >
        {title}
        <motion.span className="sheen" initial={{ x: '-120%' }} animate={{ x: '120%' }} transition={{ duration: 0.9, delay: 0.45, ease: 'easeInOut' }} />
      </motion.h2>
      <motion.p className="celebrate-name" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
        {mine ? 'You did it!' : `${name} takes it`}
      </motion.p>
      <motion.small initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.55 }}>
        {detail}
      </motion.small>
    </motion.div>
  );
}
