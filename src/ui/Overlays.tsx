import { useEffect, useState } from 'react';
import { motion, useDragControls } from 'motion/react';
import confetti from 'canvas-confetti';
import { RULES, type Match } from '../engine/match.ts';
import type { ReactNode } from 'react';
import { Coin, Tokens } from './Token.tsx';
import { SEAT_COLORS } from './SeatRail.tsx';

const burst = (colors = ['#d8b56a', '#f3dc9c', '#f7f4ec', '#6fb7a0']) => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const fire = (x: number) => confetti({ particleCount: 90, spread: 70, startVelocity: 48, origin: { x, y: 0.7 }, colors, disableForReducedMotion: true });
  fire(0.2);
  setTimeout(() => fire(0.8), 180);
  setTimeout(() => fire(0.5), 360);
};

/** Full-screen "CRASH" takeover. */
export function CrashTakeover({ m, me, onDone }: { m: Match; me: number; onDone: () => void }) {
  const results = m.deal.crashResults;
  const anyWin = results.some((r) => r.success);
  useEffect(() => {
    navigator.vibrate?.([60, 40, 120, 40, 200]);
    if (anyWin) setTimeout(() => burst(['#ff4d3d', '#d8b56a', '#f7f4ec']), 700);
  }, [anyWin]);

  return (
    <motion.div
      className={`takeover crash${anyWin ? ' hit' : ' miss'}`}
      role="dialog"
      aria-label="Crash"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, x: [0, -18, 16, -12, 9, -5, 0], y: [0, 10, -8, 6, -3, 0] }}
      transition={{ opacity: { duration: 0.15 }, x: { duration: 0.6, delay: 0.2 }, y: { duration: 0.6, delay: 0.2 } }}
      exit={{ opacity: 0 }}
      onClick={onDone}
    >
      <motion.div className="takeover-flash" initial={{ opacity: 0.9 }} animate={{ opacity: 0 }} transition={{ duration: 0.8 }} />
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="shockwave"
          initial={{ scale: 0.1, opacity: 0.9 }}
          animate={{ scale: 3.2, opacity: 0 }}
          transition={{ duration: 1.3, delay: 0.25 + i * 0.22, ease: [0.1, 0.7, 0.3, 1] }}
        />
      ))}
      <svg className="cracks" viewBox="0 0 400 800" preserveAspectRatio="none" aria-hidden="true">
        {[
          'M200 400 L150 330 L165 280 L110 200 L125 150 L60 60',
          'M200 400 L260 350 L250 300 L320 240 L310 180 L390 110',
          'M200 400 L140 460 L160 520 L80 600 L100 680 L30 790',
          'M200 400 L270 470 L250 540 L330 610 L310 690 L380 790',
          'M200 400 L60 410 L20 380',
          'M200 400 L340 420 L395 400',
        ].map((d, i) => (
          <motion.path key={i} d={d} initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: [0, 1, 0.55] }} transition={{ duration: 0.45, delay: 0.18 + i * 0.03, ease: 'easeOut' }} />
        ))}
      </svg>
      {Array.from({ length: 18 }, (_, i) => {
        const a = (i / 18) * Math.PI * 2;
        return (
          <motion.span
            key={`e${i}`}
            className="ember"
            initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
            animate={{ x: Math.cos(a) * (140 + (i % 4) * 50), y: Math.sin(a) * (140 + (i % 3) * 60), opacity: 0, scale: 0.2 }}
            transition={{ duration: 1.1, delay: 0.3, ease: 'easeOut' }}
          />
        );
      })}
      <motion.div
        className="crash-word"
        initial={{ scale: 3.2, opacity: 0, rotate: -6 }}
        animate={{ scale: 1, opacity: 1, rotate: [-6, 3, -2, 0], x: [0, -14, 12, -8, 6, 0] }}
        transition={{ duration: 0.7, ease: [0.2, 0.9, 0.2, 1.2] }}
      >
        {'CRASH'.split('').map((ch, i) => (
          <motion.span key={i} initial={{ y: -120, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.05 * i, type: 'spring', stiffness: 700, damping: 18 }}>
            {ch}
          </motion.span>
        ))}
      </motion.div>
      <motion.div className="takeover-body" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}>
        {results.map((r) => {
          const who = m.players[r.player];
          const total = r.transfers.reduce((s, t) => s + t.amount, 0);
          return (
            <div key={r.player} className="crash-line">
              <h3>
                {r.player === me ? 'You' : who.name} {r.success ? 'crashed the table!' : 'called Crash… and missed.'}
              </h3>
              {r.success ? (
                <p>
                  Won every hand. Each opponent paid half the chosen stake:{' '}
                  <b>
                    <Coin size={14} /> {total.toLocaleString('en-GB')}
                  </b>
                </p>
              ) : (
                <p>
                  Lost a hand. Half the chosen stake paid —{' '}
                  <b>
                    <Coin size={14} /> {total.toLocaleString('en-GB')}
                  </b>{' '}
                  shared out — and {r.player === me ? 'you sit' : 'they sit'} out the rest of the leg. 😂
                </p>
              )}
            </div>
          );
        })}
        <small>Tap to continue</small>
      </motion.div>
    </motion.div>
  );
}

/** End-of-deal summary with leg, set and game news. */
export function DealSummary({
  m,
  me,
  onNext,
  onHome,
  nextLabel,
  gameOverAction,
}: {
  m: Match;
  me: number;
  onNext: () => void;
  onHome: () => void;
  nextLabel?: string;
  gameOverAction?: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const dragControls = useDragControls();
  const o = m.outcome!;
  const d = m.deal;
  const over = m.phase === 'gameOver';
  const big = o.gameWinner ?? o.setWinner ?? o.legWinner;

  const headline = over
    ? m.players[me].out
      ? 'You’re out'
      : m.winner === me
        ? 'You win the game!'
        : `${m.players[m.winner!].name} wins the game`
    : o.setWinner !== null
      ? `${o.setWinner === me ? 'You win' : `${m.players[o.setWinner].name} wins`} the set`
      : o.legWinner !== null
        ? `${o.legWinner === me ? 'You win' : `${m.players[o.legWinner].name} wins`} the leg`
        : `Deal ${d.number} done`;

  const sub = over
    ? m.players[me].out
      ? `Your debt hit ${(-RULES.debtLimit).toLocaleString('en-GB')} tokens.`
      : `${m.sets[m.winner!]} sets to ${Math.max(...m.sets.filter((_, s) => s !== m.winner))}.`
    : o.legTied
      ? 'Level at the top — the leg carries on.'
      : o.setWinner !== null
        ? `Set ${m.setNumber - 1} complete. First to ${RULES.setsToWin} sets wins.`
        : o.legWinner !== null
          ? `First to ${RULES.legsPerSet} legs takes the set.`
          : `First to ${RULES.pointsPerLeg} points wins the leg.`;

  const action = over ? (
    (gameOverAction ?? (
      <button type="button" className="btn gold wide" onClick={onHome}>
        New game
      </button>
    ))
  ) : (
    <button type="button" className="btn gold wide" onClick={onNext}>
      {nextLabel ?? 'Deal again'}
    </button>
  );

  // Swiped down: a slim bar, so the table behind stays visible.
  if (collapsed) {
    return (
      <motion.div
        className="mini-sheet"
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 80, opacity: 0 }}
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0.5, bottom: 0.1 }}
        onDragEnd={(_, info) => info.offset.y < -40 && setCollapsed(false)}
      >
        <button type="button" className="mini-head" onClick={() => setCollapsed(false)} aria-label="Show the deal summary">
          <span className="grabber" />
          <b>{headline}</b>
          <small>Tap or swipe up for the scores</small>
        </button>
        {action}
      </motion.div>
    );
  }

  return (
    <motion.div className="sheet-wrap" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.section
        className={`sheet summary${big !== null ? ' celebrate' : ''}`}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 260, damping: 30 }}
        drag="y"
        dragListener={false}
        dragControls={dragControls}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.7 }}
        onDragEnd={(_, info) => (info.offset.y > 90 || info.velocity.y > 500) && setCollapsed(true)}
      >
        <span className="grabber-zone" onPointerDown={(e) => dragControls.start(e)} title="Swipe down to see the table">
          <span className="grabber" />
          <button type="button" className="peek-btn" onClick={() => setCollapsed(true)}>
            See table
          </button>
        </span>
        <motion.h2 initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.15 }}>
          {headline}
        </motion.h2>
        <p className="sub">{sub}</p>

        <table className="ledger">
          <thead>
            <tr>
              <th />
              <th>Points</th>
              <th>Tokens</th>
              <th>Legs</th>
              <th>Sets</th>
            </tr>
          </thead>
          <tbody>
            {m.players.map((p, s) => {
              const delta = p.tokens - d.tokensAtStart[s];
              return (
                <motion.tr
                  key={s}
                  className={`${s === me ? 'me' : ''}${p.out ? ' out' : ''}${s === big ? ' champ' : ''}`}
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 + s * 0.07 }}
                >
                  <td>
                    <i className="dot" style={{ background: SEAT_COLORS[s] }} />
                    {p.name}
                    {o.eliminated.includes(s) && <em> · out</em>}
                    {!o.eliminated.includes(s) && p.sittingOut && <em> · sits out</em>}
                  </td>
                  <td>+{d.pointsThisDeal[s]}</td>
                  <td className={delta < 0 ? 'neg' : delta > 0 ? 'pos' : ''}>
                    {delta > 0 ? '+' : ''}
                    {delta.toLocaleString('en-GB')}
                  </td>
                  <td>{m.legs[s]}</td>
                  <td>{m.sets[s]}</td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>

        <div className="balance">
          <span>Your balance</span>
          <Tokens value={m.players[me].tokens} size={18} />
        </div>

        {action}
      </motion.section>
    </motion.div>
  );
}
