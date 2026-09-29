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

const CHIPS = [25, 50, 100, 250];

export function PlayView({ m, me, onBet, onCrash, onNext, nextLabel, deadline }: Props) {
  const d = m.deal;
  const pos = d.position;
  const revealing = m.phase !== 'betting';
  const result = revealing ? d.results[pos] : null;
  const row = revealing ? result!.bets : d.bets[pos];
  const playing = d.active.includes(me);
  const pot = row.reduce<number>((s, b) => s + (b ?? 0), 0);
  const order = d.betOrder;
  const turn = currentBettor(m);
  const meIdx = Math.max(0, order.indexOf(me));
  const last = pos + 1 >= d.handCount;
  const secs = useCountdown(deadline);

  // Bets placed after mine appear after a beat; cards flip after that.
  const flipBase = revealing ? 0.35 + Math.max(0, order.length - meIdx - 1) * 0.18 : 0;

  // Coins fly from the pot to whoever takes it.
  const potRef = useRef<HTMLDivElement>(null);
  const tileRefs = useRef<Record<number, HTMLDivElement | null>>({});
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
          const to = center(tileRefs.current[s]);
          return to ? [{ key: `${d.number}-${pos}-${s}`, from, to }] : [];
        }),
      );
    }, (flipBase + 0.75) * 1000);
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
              ? 'Cards up.'
              : !playing
                ? 'You’re sitting out this leg — watching.'
                : turn === me
                  ? 'Your bet, then the cards turn over.'
                  : `Waiting for ${turn !== null ? m.players[turn].name : '…'} to bet.`}
          </p>
        </div>
        <ol className="progress" aria-label="Hands">
          {Array.from({ length: d.handCount }, (_, i) => {
            const r = d.results[i];
            const mine = r ? r.points[me] : null;
            const most = r ? Math.max(...r.points) : 0;
            return (
              <li key={i} className={`${i === pos ? 'cur' : ''}${r && playing ? (mine === most && mine! > 0 ? ' won' : ' lost') : ''}`}>
                {i + 1}
              </li>
            );
          })}
        </ol>
      </header>

      {flights.map((f) => (
        <CoinFlight key={f.key} from={f.from} to={f.to} count={Math.min(12, 4 + Math.round((result?.pot ?? 0) / 50))} />
      ))}
      <div className="pot" aria-live="polite" ref={potRef}>
        <motion.div className="pot-stack" key={pot} initial={{ scale: 0.8, rotate: -20 }} animate={{ scale: 1, rotate: 0 }}>
          <Coin size={30} />
        </motion.div>
        <div>
          <small>Pot</small>
          <b className="pot-num">{pot.toLocaleString('en-GB')}</b>
        </div>
      </div>

      <div className={`showdown n${d.active.length}`}>
        {order.map((seat, k) => {
          const p = m.players[seat];
          const hand = d.arrangements[seat]?.hands[pos] ?? null;
          const bet = row[seat];
          const betDelay = revealing && k > meIdx ? 0.15 + (k - meIdx - 1) * 0.18 : 0.05;
          // Other players' cards arrive as blanks (rank 0) until they're turned over.
          const show = !!hand && hand[0].rank !== 0 && (revealing || seat === me);
          const ev = hand && show ? evaluate(hand) : null;
          const winner = result?.potWinners.includes(seat);
          const pts = result?.points[seat] ?? 0;
          const best = result ? Math.max(...d.active.map((s) => result.values[s]!)) : 0;
          const top = !!result && result.values[seat] === best && best >= 0;
          return (
            <motion.div
              key={seat}
              ref={(el) => {
                tileRefs.current[seat] = el;
              }}
              className={`tile${seat === me ? ' me' : ''}${top ? ' top' : ''}${turn === seat ? ' turn' : ''}${d.crash[seat] ? ' crashing' : ''}`}
              style={{ ['--seat' as string]: SEAT_COLORS[seat] }}
              animate={top ? { scale: [1, 1.04, 1] } : { scale: 1 }}
              transition={{ delay: flipBase + 0.7, duration: 0.5 }}
            >
              <div className="tile-head">
                <span className="tile-name">
                  {seat === me ? 'You' : p.name}
                  {d.crash[seat] && <em className="tile-crash">CRASH</em>}
                </span>
                <AnimatePresence>
                  {bet !== null && bet !== undefined ? (
                    <motion.span
                      key="bet"
                      className={`bet-chip${bet === 0 ? ' check' : ''}`}
                      initial={{ opacity: 0, scale: 0.4, y: -12 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      transition={{ delay: betDelay, type: 'spring', stiffness: 500, damping: 22 }}
                    >
                      {bet === 0 ? (hand ? 'Check' : '—') : (
                        <>
                          <Coin size={12} />
                          {bet}
                        </>
                      )}
                    </motion.span>
                  ) : turn === seat ? (
                    <motion.span key="think" className="thinking" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                      <i />
                      <i />
                      <i />
                    </motion.span>
                  ) : null}
                </AnimatePresence>
              </div>
              <div className="tile-cards">
                {hand ? (
                  (show ? displayOrder(hand) : hand).map((c, i) => (
                    <PlayingCard
                      key={`${pos}-${i}`}
                      card={c}
                      size="sm"
                      faceDown={!show}
                      flipDelay={seat === me ? 0 : flipBase + i * 0.04}
                      dealDelay={k * 0.08 + i * 0.04}
                    />
                  ))
                ) : (
                  <span className="declined-note">Declined</span>
                )}
              </div>
              <div className="tile-foot">
                <AnimatePresence>
                  {ev && (
                    <motion.span
                      className="tile-cat"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: seat === me && !revealing ? 0 : flipBase + 0.45 }}
                    >
                      {CATEGORY_NAME[ev.category]}
                    </motion.span>
                  )}
                </AnimatePresence>
                {result && (
                  <motion.span
                    className={`tile-pts${pts ? ' won' : ''}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: flipBase + 0.8 }}
                  >
                    +{pts} pt{pts === 1 ? '' : 's'}
                  </motion.span>
                )}
              </div>
              {winner && result!.pot > 0 && (
                <motion.span
                  className="pot-win"
                  initial={{ opacity: 0, y: 20, scale: 0.6 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ delay: flipBase + 1.0, type: 'spring', stiffness: 300, damping: 18 }}
                >
                  <Coin size={14} /> +{result!.tokenDelta[seat] + result!.bets[seat]}
                </motion.span>
              )}
            </motion.div>
          );
        })}
      </div>

      {revealing ? (
        <motion.footer className="dock" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: flipBase + 0.9 }}>
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

  return (
    <footer className="dock bet-dock">
      <div className="bet-row">
        <div className="bet-amount">
          <small>Your bet{secs !== null ? ` · ${secs}s` : ''}</small>
          <motion.b key={amount} initial={{ scale: 1.2 }} animate={{ scale: 1 }}>
            <Coin size={20} /> {amount.toLocaleString('en-GB')}
          </motion.b>
          <small className={tokens < 0 ? 'debt' : ''}>
            {tokens < 0 ? 'In debt ' : 'Balance '}
            {tokens.toLocaleString('en-GB')} · limit −{RULES.debtLimit.toLocaleString('en-GB')}
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
      <div className="bet-actions">
        {crashable ? (
          <button
            type="button"
            className="crash-toggle small"
            onClick={() => onCrash(Math.min(max, Math.max(amount, RULES.crashMinBet)))}
            title={`Call Crash and bet ${Math.min(max, Math.max(amount, RULES.crashMinBet))}`}
          >
            <span className="crash-dot" /> Crash {Math.min(max, Math.max(amount, RULES.crashMinBet))}
          </button>
        ) : (
          <button type="button" className="btn ghost" onClick={() => setAmount(min)} disabled={amount === min}>
            Reset
          </button>
        )}
        {min === 0 && (
          <button type="button" className="btn ghost" onClick={() => onBet(0)}>
            Check
          </button>
        )}
        <button type="button" className="btn gold" onClick={() => onBet(amount)} disabled={amount === 0}>
          Bet {amount.toLocaleString('en-GB')}
        </button>
      </div>
      {crashing && <p className="dock-note crash-note">You’re on a Crash — at least {min} on every hand.</p>}
    </footer>
  );
}
