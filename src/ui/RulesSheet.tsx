import { motion, useDragControls } from 'motion/react';
import type { Card, Suit } from '../engine/cards.ts';
import { CATEGORY_BLURB, CATEGORY_NAME, Category } from '../engine/hands.ts';
import { RULES } from '../engine/match.ts';
import { PlayingCard } from './PlayingCard.tsx';

const c = (rank: number, suit: Suit): Card => ({ rank, suit });
const EXAMPLES: [Category, Card[]][] = [
  [Category.Prile, [c(13, 'S'), c(13, 'H'), c(13, 'D')]],
  [Category.Stiff, [c(4, 'D'), c(3, 'D'), c(2, 'D')]],
  [Category.Run, [c(4, 'S'), c(3, 'D'), c(2, 'C')]],
  [Category.Flush, [c(13, 'H'), c(5, 'H'), c(3, 'H')]],
];

export function RulesSheet({ onClose }: { onClose: () => void }) {
  const dragControls = useDragControls();
  return (
    <motion.div className="sheet-wrap" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.section
        className="sheet rules"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 260, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
        drag="y"
        dragListener={false}
        dragControls={dragControls}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.7 }}
        onDragEnd={(_, info) => (info.offset.y > 100 || info.velocity.y > 500) && onClose()}
        role="dialog"
        aria-label="How to play"
      >
        <span className="grabber-zone" onPointerDown={(e) => dragControls.start(e)} aria-hidden="true">
          <span className="grabber" />
        </span>
        <h2>How to play Crash</h2>

        <h3>1 · Build your hands</h3>
        <p>
          4 players get 13 cards and make 4 hands of three. 3 players get 17 cards and make 5. Only these count, best first:
        </p>
        <ul className="rank-list">
          {EXAMPLES.map(([cat, cards], i) => (
            <li key={cat}>
              <span className="rank-n">{i + 1}</span>
              <span className="rank-text">
                <b>{CATEGORY_NAME[cat]}</b>
                <small>{CATEGORY_BLURB[cat]}</small>
              </span>
              <span className="rank-cards">
                {cards.map((x, k) => (
                  <PlayingCard key={k} card={x} size="xs" />
                ))}
              </span>
            </li>
          ))}
        </ul>
        <p>
          Same type? The highest card wins, then the next. Aces are high (Q-K-A) or low (A-2-3, the lowest run); runs don’t wrap
          round. Your hands always line up strongest first, weakest last. Can’t make your last hand? <b>Decline</b> it — it loses
          to any real hand. Spare cards are thrown away.
        </p>

        <h3>2 · Play hand by hand</h3>
        <p>
          Hand 1 is played first against every opponent’s hand 1, then hand 2, and so on. Beat an opponent’s hand and you score
          1 point; a dead heat scores nothing.
        </p>

        <h3>3 · Bet Barney tokens</h3>
        <p>
          Everyone starts with {RULES.startTokens.toLocaleString('en-GB')} tokens. At the beginning of each deal, before hand 1 turns over, players choose a stake in
          turn (at least {RULES.minBet} per playable hand). That stake is locked for the deal and applied automatically to
          each later playable hand, capped by your remaining credit. The best hand takes each pot. You can bet on credit down to{' '}
          {(-RULES.debtLimit).toLocaleString('en-GB')} — hit that and you’re out.
        </p>

        <h3>4 · Call the Crash</h3>
        <p>
          Before anyone’s hand is revealed, choose your stake and either <b>bet</b> or <b>Crash</b>. Crash is a promise to win every hand of the deal against everyone.
          Win them all and each opponent pays you <b>half your chosen stake</b>. Miss once and you pay <b>half your chosen stake</b>, shared among the opponents,
          then sit out the rest of the leg. No new bets or Crash calls are allowed after play begins. Crash stakes are at least{' '}
          {RULES.crashMinBet}.
        </p>

        <h3>5 · Legs, sets, game</h3>
        <p>
          First to {RULES.pointsPerLeg} points wins a leg. {RULES.legsPerSet} legs win a set. {RULES.setsToWin} sets win the game —
          or be the last one standing.
        </p>

        <button type="button" className="btn gold wide" onClick={onClose}>
          Got it
        </button>
      </motion.section>
    </motion.div>
  );
}
