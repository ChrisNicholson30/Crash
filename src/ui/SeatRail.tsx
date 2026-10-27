import { AnimatePresence, motion } from 'motion/react';
import { matchRules, type Match } from '../engine/match.ts';
import { Tokens } from './Token.tsx';

export const SEAT_COLORS = ['#e5484d', '#c9ccd2', '#6fa8dc', '#b08fd9'];

function Pips({ n, of, label }: { n: number; of: number; label: string }) {
  return (
    <span className="pips" aria-label={`${label} ${n} of ${of}`}>
      {Array.from({ length: of }, (_, i) => (
        <motion.i key={i} className={i < n ? 'on' : ''} animate={{ scale: i < n ? [1.6, 1] : 1 }} />
      ))}
    </span>
  );
}

export function SeatRail({
  m,
  me,
  highlight,
  bubbles,
}: {
  m: Match;
  me: number | null;
  highlight?: number[];
  /** Latest table talk per seat, shown as a speech bubble. */
  bubbles?: Record<number, string>;
}) {
  const rules = matchRules(m);
  return (
    <ol className="rail">
      {m.players.map((p, s) => {
        // During a deal, show points as they're won; they're banked into m.points when the deal ends.
        const live = m.phase === 'betting' || m.phase === 'reveal';
        const pts = m.points[s] + (live ? m.deal.pointsThisDeal[s] : 0);
        const pct = Math.min(100, (pts / rules.pointsPerLeg) * 100);
        return (
          <motion.li
            key={s}
            layout
            className={`seat${s === me ? ' me' : ''}${p.out ? ' out' : ''}${p.sittingOut && !p.out ? ' sitting' : ''}${highlight?.includes(s) ? ' hot' : ''}`}
            style={{ ['--seat' as string]: SEAT_COLORS[s] }}
          >
            <span className="seat-top">
              <span className="avatar">{p.name.slice(0, 1).toUpperCase()}</span>
              <span className="seat-name">{s === me ? 'You' : p.name}</span>
              {p.isHuman && me !== null && s !== me && <span className="human-dot" title="Person" />}
              {m.deal.dealer === s && <span className="badge dealer" title="Dealer">D</span>}
              {m.deal.crash[s] && m.phase !== 'arrange' && <span className="badge crash">CRASH</span>}
            </span>
            <span className="seat-pts">
              <b key={pts}>
                {pts}
              </b>
              <small>/{rules.pointsPerLeg}</small>
            </span>
            <span className="seat-bar">
              <motion.span animate={{ width: `${pct}%` }} transition={{ type: 'spring', stiffness: 120, damping: 20 }} />
            </span>
            <span className="seat-meta">
              {rules.legsPerSet > 1 && <Pips n={m.legs[s]} of={rules.legsPerSet} label="Legs" />}
              {rules.setsToWin > 1 && <Pips n={m.sets[s]} of={rules.setsToWin} label="Sets" />}
            </span>
            <Tokens value={p.tokens} size={12} />
            {p.out && <span className="out-tag">OUT</span>}
            {p.sittingOut && !p.out && <span className="out-tag sit">SITS OUT</span>}
            <AnimatePresence>
              {bubbles?.[s] && (
                <motion.span key={bubbles[s]} className="seat-bubble" role="status" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  {bubbles[s]}
                </motion.span>
              )}
            </AnimatePresence>
          </motion.li>
        );
      })}
    </ol>
  );
}
