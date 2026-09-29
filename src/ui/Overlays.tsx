import { useEffect } from 'react';
import { motion } from 'motion/react';
import confetti from 'canvas-confetti';
import { HUMAN, RULES, type Match } from '../engine/match.ts';
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
export function CrashTakeover({ m, onDone }: { m: Match; onDone: () => void }) {
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
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onDone}
    >
      <motion.div className="takeover-flash" initial={{ opacity: 0.9 }} animate={{ opacity: 0 }} transition={{ duration: 0.8 }} />
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
                {who.isHuman ? 'You' : who.name} {r.success ? 'crashed the table!' : 'called Crash… and missed.'}
              </h3>
              <p>
                {r.success
                  ? `Won every hand. Every opponent pays double their bets — total `
                  : `Lost a hand, so each opponent is paid double your bets — total `}
                <b>
                  <Coin size={14} /> {total.toLocaleString('en-GB')}
                </b>
              </p>
            </div>
          );
        })}
        <small>Tap to continue</small>
      </motion.div>
    </motion.div>
  );
}

/** End-of-deal summary with leg, set and game news. */
export function DealSummary({ m, onNext, onHome }: { m: Match; onNext: () => void; onHome: () => void }) {
  const o = m.outcome!;
  const d = m.deal;
  const over = m.phase === 'gameOver';
  const big = o.gameWinner ?? o.setWinner ?? o.legWinner;
  const humanWon = big === HUMAN;

  useEffect(() => {
    if (big !== null && humanWon) burst();
    if (big !== null) navigator.vibrate?.([30, 30, 60]);
  }, [big, humanWon]);

  const headline = over
    ? m.players[HUMAN].out
      ? 'You’re out'
      : m.winner === HUMAN
        ? 'You win the game!'
        : `${m.players[m.winner!].name} wins the game`
    : o.setWinner !== null
      ? `${o.setWinner === HUMAN ? 'You win' : `${m.players[o.setWinner].name} wins`} the set`
      : o.legWinner !== null
        ? `${o.legWinner === HUMAN ? 'You win' : `${m.players[o.legWinner].name} wins`} the leg`
        : `Deal ${d.number} done`;

  const sub = over
    ? m.players[HUMAN].out
      ? `Your debt hit ${(-RULES.debtLimit).toLocaleString('en-GB')} tokens.`
      : `${m.sets[m.winner!]} sets to ${Math.max(...m.sets.filter((_, s) => s !== m.winner))}.`
    : o.legTied
      ? 'Level at the top — the leg carries on.'
      : o.setWinner !== null
        ? `Set ${m.setNumber - 1} complete. First to ${RULES.setsToWin} sets wins.`
        : o.legWinner !== null
          ? `First to ${RULES.legsPerSet} legs takes the set.`
          : `First to ${RULES.pointsPerLeg} points wins the leg.`;

  return (
    <motion.div className="sheet-wrap" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.section
        className={`sheet summary${big !== null ? ' celebrate' : ''}`}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 260, damping: 30 }}
      >
        <span className="grabber" />
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
                  className={`${p.isHuman ? 'me' : ''}${p.out ? ' out' : ''}${s === big ? ' champ' : ''}`}
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 + s * 0.07 }}
                >
                  <td>
                    <i className="dot" style={{ background: SEAT_COLORS[s] }} />
                    {p.name}
                    {o.eliminated.includes(s) && <em> · out</em>}
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
          <Tokens value={m.players[HUMAN].tokens} size={18} />
        </div>

        {over ? (
          <button type="button" className="btn gold wide" onClick={onHome}>
            New game
          </button>
        ) : (
          <button type="button" className="btn gold wide" onClick={onNext}>
            Deal again
          </button>
        )}
      </motion.section>
    </motion.div>
  );
}
