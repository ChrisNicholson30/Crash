import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CATEGORY_NAME, displayOrder, evaluate } from '../engine/hands.ts';
import { RULES, canCallCrash, currentBettor, maxBet, minBet, type Match } from '../engine/match.ts';
import { PlayingCard } from './PlayingCard.tsx';
import { Coin } from './Token.tsx';
import { SEAT_COLORS } from './SeatRail.tsx';
import { useCountdown } from './Game.tsx';
import { CoinFlight, type Point } from './Fx.tsx';

interface Props {
  m: Match;
  me: number;
  onBet: (amount: number) => void;
  /** Calls Crash and bets `amount` (at least the Crash minimum) in one go. */
  onCrash: (amount: number) => void;
  onNext: () => void;
  nextLabel?: string;
  deadline?: number | null;
}

const CHIPS = [100, 500, 1000, 5000];
const SHORT: Record<string, string> = { Prile: 'Prile', Stiff: 'Stiff', Run: 'Run', Flush: 'Flush' };

/**
 * The whole table at once: a row per hand, a column per player. Your hands are
 * face up; everyone else's turn over as each hand is played. The live row is
 * the hand currently being played.
 */
export function PlayView({ m, me, onBet, onCrash, onNext, nextLabel, deadline }: Props) {
  const d = m.deal;
  const pos = d.position;
  const revealing = m.phase !== 'betting';
  const result = revealing ? d.results[pos] : null;
  const row = revealing ? result!.bets : d.bets[pos];
  const playing = d.active.includes(me);
  const pot = row.reduce<number>((s, b) => s + (b ?? 0), 0);
  const turn = currentBettor(m);
  const last = pos + 1 >= d.handCount;
  const secs = useCountdown(deadline);
  // Me first, then everyone else in seat order.
  const cols = [...d.active.filter((s) => s === me), ...d.active.filter((s) => s !== me)];

  // Coins fly from the pot to whoever takes it.
  const potRef = useRef<HTMLDivElement>(null);
  const cellRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [flights, setFlights] = useState<{ key: string; from: Point; to: Point }[]>([]);
  useEffect(() => {
    if (!result || result.pot <= 0 || m.phase !== 'reveal') return;
    const t = setTimeout(() => {
      const center = (el: Element | null | undefined): Point | null => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2 - 9, y: r.top + r.height / 2 - 9 };
      };
      const from = center(potRef.current);
      if (!from) return;
      setFlights(
        result.potWinners.flatMap((s) => {
          const to = center(cellRefs.current[`${pos}:${s}`]);
          return to ? [{ key: `${d.number}-${pos}-${s}`, from, to }] : [];
        }),
      );
    }, 900);
    return () => clearTimeout(t);
  }, [d.number, pos, m.phase]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className="play">
      <header className="stage-head">
        <div>
          <h2>
            Hand {pos + 1} <small>of {d.handCount}</small>
          </h2>
          <p>
            {revealing
              ? 'Cards up. Opening bets and Crash calls are locked.'
              : !playing
                ? 'You’re sitting out this leg — watching.'
                : turn === me
                  ? (canCallCrash(m, me) ? 'Opening move: bet, or call Crash.' : 'Choose your opening stake.')
                  : `Waiting for ${turn !== null ? m.players[turn].name : '…'}.`}
          </p>
        </div>
        <div className="pot" aria-live="polite" ref={potRef}>
          <motion.div className="pot-stack" key={pot} initial={{ scale: 0.8, rotate: -20 }} animate={{ scale: 1, rotate: 0 }}>
            <Coin size={26} />
          </motion.div>
          <div>
            <small>Pot</small>
            <b className="pot-num">{pot.toLocaleString('en-GB')}</b>
          </div>
        </div>
      </header>

      {flights.map((f) => (
        <CoinFlight key={f.key} from={f.from} to={f.to} count={Math.min(12, 4 + Math.round((result?.pot ?? 0) / 50))} />
      ))}

      <div className="board" style={{ ['--cols' as string]: cols.length }}>
        <div className="board-row board-head">
          <span />
          {cols.map((seat) => {
            const bet = row[seat];
            return (
              <div
                key={seat}
                className={`board-player${seat === me ? ' me' : ''}${turn === seat ? ' turn' : ''}${d.crash[seat] ? ' crashing' : ''}`}
                style={{ ['--seat' as string]: SEAT_COLORS[seat] }}
              >
                <b>{seat === me ? 'You' : m.players[seat].name}</b>
                <AnimatePresence mode="wait">
                  {d.crash[seat] ? (
                    <motion.em key="crash" className="tile-crash" initial={{ scale: 2, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                      CRASH
                    </motion.em>
                  ) : null}
                </AnimatePresence>
                <span className="board-bet">
                  {bet !== null && bet !== undefined ? (
                    <motion.span
                      key={`${pos}-${bet}`}
                      className={`bet-chip${bet === 0 ? ' check' : ''}`}
                      initial={{ opacity: 0, scale: 0.4, y: -10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 22 }}
                    >
                      {bet === 0 ? '—' : (
                        <>
                          <Coin size={11} />
                          {bet}
                        </>
                      )}
                    </motion.span>
                  ) : turn === seat ? (
                    <span className="thinking">
                      <i />
                      <i />
                      <i />
                    </span>
                  ) : null}
                </span>
              </div>
            );
          })}
        </div>

        {Array.from({ length: d.handCount }, (_, p) => {
          const r = d.results[p];
          const live = p === pos;
          const best = r ? Math.max(...d.active.map((s) => r.values[s]!)) : null;
          return (
            <motion.div
              key={p}
              className={`board-row${live ? ' live' : ''}${r && !live ? ' done' : ''}${p > pos ? ' later' : ''}`}
              layout
            >
              <span className="board-num">{p + 1}</span>
              {cols.map((seat) => {
                const hand = d.arrangements[seat]?.hands[p] ?? null;
                const shown = !!hand && hand[0].rank !== 0 && (seat === me || p < d.results.length);
                const ev = shown ? evaluate(hand!) : null;
                const top = !!r && best !== null && best >= 0 && r.values[seat] === best;
                const pts = r?.points[seat] ?? 0;
                const flipNow = live && revealing && seat !== me;
                return (
                  <div
                    key={seat}
                    ref={(el) => {
                      cellRefs.current[`${p}:${seat}`] = el;
                    }}
                    className={`cell${top ? ' top' : ''}${seat === me ? ' me' : ''}`}
                  >
                    {hand ? (
                      <span className="cell-cards">
                        {(shown ? displayOrder(hand) : hand).map((c, i) => (
                          <PlayingCard key={`${p}-${i}`} card={c} size="xs" faceDown={!shown} flipDelay={flipNow ? 0.25 + i * 0.04 : 0} dealDelay={p * 0.05 + i * 0.03} />
                        ))}
                      </span>
                    ) : (
                      <span className="cell-declined">declined</span>
                    )}
                    <span className="cell-foot">
                      {ev && <span className="cell-cat">{SHORT[CATEGORY_NAME[ev.category]] ?? ''}</span>}
                      {r && (
                        <motion.span
                          className={`cell-pts${pts ? ' won' : ''}`}
                          initial={live ? { opacity: 0, y: 6 } : false}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: live ? 0.75 : 0 }}
                        >
                          +{pts}
                        </motion.span>
                      )}
                    </span>
                    {live && result && result.potWinners.includes(seat) && result.pot > 0 && (
                      <motion.span
                        className="pot-win"
                        initial={{ opacity: 0, y: 14, scale: 0.6 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ delay: 1.1, type: 'spring', stiffness: 300, damping: 18 }}
                      >
                        <Coin size={12} /> +{result.tokenDelta[seat] + result.bets[seat]}
                      </motion.span>
                    )}
                  </div>
                );
              })}
            </motion.div>
          );
        })}
      </div>

      {revealing ? (
        <motion.footer className="dock" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9 }}>
          <button type="button" className="btn gold wide" onClick={onNext}>
            {nextLabel ?? (last ? 'Finish deal' : `Play hand ${pos + 2}`)}
          </button>
          {secs !== null && <p className="dock-note">Moving on in {secs}s</p>}
        </motion.footer>
      ) : turn === me ? (
        <BetDock key={`${d.number}-${pos}`} m={m} me={me} onBet={onBet} onCrash={onCrash} secs={secs} />
      ) : (
        <footer className="dock">
          <p className="dock-note waiting">
            {!playing
              ? 'You missed a Crash — back in when the next leg starts.'
              : `Waiting for ${turn !== null ? m.players[turn].name : 'the table'}${secs !== null ? ` · ${secs}s` : ''}`}
          </p>
        </footer>
      )}
    </section>
  );
}

function BetDock({ m, me, onBet, onCrash, secs }: { m: Match; me: number; onBet: (n: number) => void; onCrash: (n: number) => void; secs: number | null }) {
  const min = minBet(m, me);
  const max = maxBet(m, me);
  const [amount, setAmount] = useState(min);
  useEffect(() => setAmount((a) => Math.max(a, min)), [min]);
  const add = (n: number) => setAmount((a) => Math.min(max, a + n));
  const tokens = m.players[me].tokens;
  const crashable = canCallCrash(m, me);
  const crashing = m.deal.crash[me];
  const crashAmount = Math.min(max, Math.max(amount, RULES.crashMinBet));

  return (
    <footer className="dock bet-dock">
      <div className="bet-row">
        <div className="bet-amount">
          <small>Stake per hand{secs !== null ? ` · ${secs}s` : ''}</small>
          <motion.b key={amount} initial={{ scale: 1.2 }} animate={{ scale: 1 }}>
            <Coin size={20} /> {amount.toLocaleString('en-GB')}
          </motion.b>
          <small className={tokens < 0 ? 'debt' : ''}>
            {tokens < 0 ? 'In debt ' : 'Balance '}
            {tokens.toLocaleString('en-GB')}
            {amount > min && (
              <button type="button" className="reset-link" onClick={() => setAmount(min)}>
                reset
              </button>
            )}
          </small>
        </div>
        <div className="chips">
          {CHIPS.map((c) => (
            <motion.button key={c} type="button" className={`chip c${c}`} whileTap={{ scale: 0.88, rotate: -8 }} onClick={() => add(c)} disabled={amount >= max} aria-label={`Add ${c}`}>
              {c}
            </motion.button>
          ))}
        </div>
      </div>
      <div className="bet-actions two">
        {crashable && (
          <motion.button
            type="button"
            className="crash-toggle big-crash"
            onClick={() => onCrash(crashAmount)}
            whileTap={{ scale: 0.95 }}
            aria-label={`Call Crash and bet ${crashAmount}`}
          >
            <span className="crash-word-sm">CRASH</span>
            <small>bet {crashAmount} · win every hand</small>
          </motion.button>
        )}
        <motion.button type="button" className="btn gold big-bet" onClick={() => onBet(amount)} disabled={amount === 0} whileTap={{ scale: 0.96 }}>
          <span>Bet {amount.toLocaleString('en-GB')}</span>
          <small>{crashing ? 'you’re on a Crash' : 'locked for this deal'}</small>
        </motion.button>
      </div>
    </footer>
  );
}
