import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { cardId } from '../engine/cards.ts';
import { CATEGORY_NAME, displayOrder, evaluate } from '../engine/hands.ts';
import { HUMAN, maxBet, minBet, type Match } from '../engine/match.ts';
import { PlayingCard } from './PlayingCard.tsx';
import { Coin } from './Token.tsx';
import { SEAT_COLORS } from './SeatRail.tsx';

interface Props {
  m: Match;
  onBet: (amount: number) => void;
  onNext: () => void;
}

const CHIPS = [25, 50, 100, 250];

export function PlayView({ m, onBet, onNext }: Props) {
  const d = m.deal;
  const pos = d.position;
  const revealing = m.phase !== 'betting';
  const result = revealing ? d.results[pos] : null;
  const row = revealing ? result!.bets : d.bets[pos];
  const myHand = d.arrangements[HUMAN]!.hands[pos];
  const pot = row.reduce<number>((s, b) => s + (b ?? 0), 0);
  const order = d.betOrder;
  const humanIdx = order.indexOf(HUMAN);
  const last = pos + 1 >= d.handCount;

  // Bets placed after the human appear after a beat; cards flip after that.
  const flipBase = revealing ? 0.35 + (order.length - humanIdx - 1) * 0.18 : 0;

  return (
    <section className="play">
      <header className="stage-head">
        <div>
          <h2>
            Hand {pos + 1} <small>of {d.handCount}</small>
          </h2>
          <p>{revealing ? 'Cards up.' : 'Place your bet on this hand, then the cards turn over.'}</p>
        </div>
        <ol className="progress" aria-label="Hands">
          {Array.from({ length: d.handCount }, (_, i) => {
            const r = d.results[i];
            const mine = r ? r.points[HUMAN] : null;
            const most = r ? Math.max(...r.points) : 0;
            return (
              <li key={i} className={`${i === pos ? 'cur' : ''}${r ? (mine === most && mine! > 0 ? ' won' : ' lost') : ''}`}>
                {i + 1}
              </li>
            );
          })}
        </ol>
      </header>

      <div className="pot" aria-live="polite">
        <motion.div className="pot-stack" key={pot} initial={{ scale: 0.8 }} animate={{ scale: 1 }}>
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
          const hand = d.arrangements[seat]!.hands[pos];
          const bet = row[seat];
          const after = k > humanIdx;
          const betDelay = revealing && after ? 0.15 + (k - humanIdx - 1) * 0.18 : k * 0.12;
          const show = revealing || seat === HUMAN;
          const ev = hand ? evaluate(hand) : null;
          const winner = result?.potWinners.includes(seat);
          const pts = result?.points[seat] ?? 0;
          const best = result ? Math.max(...d.active.map((s) => result.values[s]!)) : 0;
          const top = !!result && result.values[seat] === best && best >= 0;
          return (
            <motion.div
              key={seat}
              className={`tile${seat === HUMAN ? ' me' : ''}${top ? ' top' : ''}`}
              style={{ ['--seat' as string]: SEAT_COLORS[seat] }}
              animate={top ? { scale: [1, 1.04, 1] } : { scale: 1 }}
              transition={{ delay: flipBase + 0.7, duration: 0.5 }}
            >
              <div className="tile-head">
                <span className="tile-name">{p.name}</span>
                <AnimatePresence>
                  {bet !== null && bet !== undefined && (
                    <motion.span
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
                  )}
                </AnimatePresence>
              </div>
              <div className="tile-cards">
                {hand ? (
                  displayOrder(hand).map((c, i) => (
                    <PlayingCard
                      key={`${pos}-${cardId(c)}`}
                      card={c}
                      size="sm"
                      faceDown={!show}
                      flipDelay={seat === HUMAN ? 0 : flipBase + i * 0.06 + k * 0.08}
                      dealDelay={k * 0.08 + i * 0.04}
                    />
                  ))
                ) : (
                  <span className="declined-note">Declined</span>
                )}
              </div>
              <div className="tile-foot">
                <AnimatePresence>
                  {show && ev && (
                    <motion.span
                      className="tile-cat"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: seat === HUMAN ? 0 : flipBase + 0.45 }}
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
        <motion.footer className="dock" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: flipBase + 0.9 }}>
          <button type="button" className="btn gold wide" onClick={onNext}>
            {last ? 'Finish deal' : `Play hand ${pos + 2}`}
          </button>
        </motion.footer>
      ) : myHand ? (
        <BetDock key={pos} m={m} onBet={onBet} />
      ) : (
        <footer className="dock">
          <p className="dock-note">You declined this hand — it can’t be bet on.</p>
          <button type="button" className="btn gold" onClick={() => onBet(0)}>
            Continue
          </button>
        </footer>
      )}
    </section>
  );
}

function BetDock({ m, onBet }: { m: Match; onBet: (n: number) => void }) {
  const min = minBet(m, HUMAN);
  const max = maxBet(m, HUMAN);
  const [amount, setAmount] = useState(min);
  useEffect(() => setAmount(min), [min]);
  const add = (n: number) => setAmount((a) => Math.min(max, a + n));
  const tokens = m.players[HUMAN].tokens;

  return (
    <footer className="dock bet-dock">
      <div className="bet-row">
        <div className="bet-amount">
          <small>Your bet</small>
          <motion.b key={amount} initial={{ scale: 1.25 }} animate={{ scale: 1 }}>
            <Coin size={18} /> {amount.toLocaleString('en-GB')}
          </motion.b>
          <small className={tokens < 0 ? 'debt' : ''}>
            Balance {tokens.toLocaleString('en-GB')} · credit to {(-5000).toLocaleString('en-GB')}
          </small>
        </div>
        <div className="chips">
          {CHIPS.map((c) => (
            <motion.button key={c} type="button" className={`chip c${c}`} whileTap={{ scale: 0.88, rotate: -8 }} onClick={() => add(c)} disabled={amount >= max}>
              {c}
            </motion.button>
          ))}
        </div>
      </div>
      <div className="bet-actions">
        <button type="button" className="btn ghost" onClick={() => setAmount(min)}>
          Reset
        </button>
        {min === 0 && (
          <button type="button" className="btn ghost" onClick={() => onBet(0)}>
            Check
          </button>
        )}
        <button type="button" className="btn gold" onClick={() => onBet(amount)} disabled={amount === 0}>
          Bet {amount.toLocaleString('en-GB')}
        </button>
      </div>
      {min > 0 && <p className="dock-note">You called Crash — minimum bet {min} on every hand.</p>}
    </footer>
  );
}
