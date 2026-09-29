import { useMemo, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import { cardId, sameCard, sortByRank, sortBySuit, type Card } from '../engine/cards.ts';
import { CATEGORY_NAME, Category, displayOrder, evaluate } from '../engine/hands.ts';
import { aiArrange } from '../engine/ai.ts';
import { HUMAN, type Arrangement, type Match } from '../engine/match.ts';
import { CardSlot, PlayingCard } from './PlayingCard.tsx';

interface Slot {
  id: number;
  cards: Card[];
  declined: boolean;
}

interface Props {
  m: Match;
  onLock: (arr: Arrangement, crash: boolean) => void;
}

const ORDINAL = ['1st', '2nd', '3rd', '4th', '5th'];

const slotValue = (s: Slot) => (s.cards.length === 3 ? evaluate(s.cards) : null);

/** Complete hands strongest first, then hands still being built, then declined hands. */
function ordered(slots: Slot[]): Slot[] {
  const rank = (s: Slot) => {
    if (s.declined) return 3;
    const ev = slotValue(s);
    return ev && ev.category !== Category.None ? 0 : ev ? 1 : 2;
  };
  return slots.slice().sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    if (ra === 0) return slotValue(b)!.value - slotValue(a)!.value;
    return a.id - b.id;
  });
}

export function ArrangeView({ m, onLock }: Props) {
  const dealt = m.deal.dealt[HUMAN];
  const handCount = m.deal.handCount;
  const fresh = () => Array.from({ length: handCount }, (_, id) => ({ id, cards: [], declined: false }));
  const [slots, setSlots] = useState<Slot[]>(fresh);
  const [activeId, setActiveId] = useState(0);
  const [bySuit, setBySuit] = useState(true);
  const [crash, setCrash] = useState(false);

  const view = ordered(slots);
  const placed = slots.flatMap((s) => s.cards);
  const pool = useMemo(() => {
    const left = dealt.filter((c) => !placed.some((p) => sameCard(p, c)));
    return bySuit ? sortBySuit(left) : sortByRank(left);
  }, [dealt, placed, bySuit]);

  const invalid = slots.filter((s) => !s.declined && s.cards.length === 3 && evaluate(s.cards).category === Category.None);
  const ready = slots.every((s) => s.declined || (s.cards.length === 3 && evaluate(s.cards).category !== Category.None));
  const anyDeclined = slots.some((s) => s.declined);
  const openSlots = (list: Slot[]) => ordered(list).filter((s) => !s.declined && s.cards.length < 3);

  const place = (card: Card) => {
    const active = slots.find((s) => s.id === activeId);
    const target = active && !active.declined && active.cards.length < 3 ? active : openSlots(slots)[0];
    if (!target) return;
    const next = slots.map((s) => (s.id === target.id ? { ...s, cards: [...s.cards, card] } : s));
    setSlots(next);
    const stillOpen = next.find((s) => s.id === target.id)!.cards.length < 3;
    setActiveId(stillOpen ? target.id : (openSlots(next)[0]?.id ?? target.id));
    navigator.vibrate?.(8);
  };

  const unplace = (slotId: number, card: Card) => {
    setSlots(slots.map((s) => (s.id === slotId ? { ...s, cards: s.cards.filter((c) => !sameCard(c, card)) } : s)));
    setActiveId(slotId);
  };

  const toggleDecline = (slotId: number) => {
    setSlots(slots.map((s) => (s.id === slotId ? { ...s, declined: !s.declined, cards: [] } : s)));
    setCrash(false);
    const next = openSlots(slots.filter((s) => s.id !== slotId))[0];
    if (next) setActiveId(next.id);
  };

  const auto = () => {
    const arr = aiArrange(dealt, handCount);
    setSlots(arr.hands.map((h, id) => ({ id, cards: h ?? [], declined: h === null })));
    setActiveId(0);
  };

  const lock = () => {
    const hands = ordered(slots).map((s) => (s.declined ? null : s.cards));
    onLock({ hands, spares: pool }, crash);
  };

  return (
    <section className="arrange">
      <header className="stage-head">
        <div>
          <h2>Build your hands</h2>
          <p>They line up strongest first automatically. Only a Prile, Stiff, Run or Flush counts.</p>
        </div>
      </header>

      <LayoutGroup>
        <div className={`slots slots-${handCount}`}>
          {view.map((s, i) => {
            const ev = slotValue(s);
            const bad = ev?.category === Category.None;
            return (
              <motion.div
                key={s.id}
                layout
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                className={`slot${s.id === activeId && !s.declined ? ' active' : ''}${s.declined ? ' declined' : ''}${bad ? ' bad' : ''}${ev && !bad ? ' done' : ''}`}
                onClick={() => !s.declined && setActiveId(s.id)}
              >
                <div className="slot-head">
                  <span className="slot-pos">{ORDINAL[i]}</span>
                  <AnimatePresence mode="wait">
                    <motion.span
                      key={s.declined ? 'd' : ev ? ev.category : 'n'}
                      className={`slot-cat${bad ? ' bad' : ''}`}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                    >
                      {s.declined ? 'Declined' : ev ? CATEGORY_NAME[ev.category] : `${s.cards.length}/3`}
                    </motion.span>
                  </AnimatePresence>
                  {s.cards.length === 0 && (
                    <button
                      type="button"
                      className="chip-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleDecline(s.id);
                      }}
                    >
                      {s.declined ? 'Play' : 'Decline'}
                    </button>
                  )}
                </div>
                <div className="slot-cards">
                  {(() => {
                    const shown = ev && !bad ? displayOrder(s.cards) : s.cards;
                    return s.declined ? (
                    <span className="declined-note">No hand — loses to any real hand</span>
                  ) : (
                    [0, 1, 2].map((k) =>
                      shown[k] ? (
                        <PlayingCard
                          key={cardId(shown[k])}
                          layoutId={cardId(shown[k])}
                          card={shown[k]}
                          size="sm"
                          onClick={() => unplace(s.id, shown[k])}
                        />
                      ) : (
                        <CardSlot key={`e${k}`} size="sm" />
                      ),
                    )
                  );
                  })()}
                </div>
              </motion.div>
            );
          })}
        </div>

        <div className="pool-head">
          <span>
            {invalid.length
              ? 'That set of three isn’t a hand — tap a card to take it back'
              : pool.length && !ready
                ? 'Tap cards to fill the highlighted hand'
                : `${pool.length} spare card${pool.length === 1 ? '' : 's'} — thrown away`}
          </span>
          <button type="button" className="btn link small" onClick={() => setBySuit(!bySuit)}>
            Sort by {bySuit ? 'rank' : 'suit'}
          </button>
        </div>
        <div className="pool">
          {pool.map((c, i) => (
            <PlayingCard
              key={cardId(c)}
              layoutId={cardId(c)}
              card={c}
              size="md"
              dealDelay={m.deal.number && placed.length === 0 ? i * 0.035 : undefined}
              onClick={ready ? undefined : () => place(c)}
            />
          ))}
        </div>
      </LayoutGroup>

      <footer className="dock">
        <button
          type="button"
          className={`crash-toggle${crash ? ' on' : ''}`}
          disabled={anyDeclined}
          onClick={() => setCrash(!crash)}
          aria-pressed={crash}
          title="Predict you'll win every hand"
        >
          <span className="crash-dot" />
          Crash
        </button>
        <button type="button" className="btn ghost" onClick={auto}>
          Auto
        </button>
        <button type="button" className="btn ghost" onClick={() => setSlots(fresh())} disabled={!placed.length && !anyDeclined}>
          Clear
        </button>
        <button type="button" className="btn gold" disabled={!ready} onClick={lock}>
          Lock in
        </button>
      </footer>
      <AnimatePresence>
        {crash && (
          <motion.p className="crash-hint" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            Crash called: win every hand and each opponent pays you double their bets. Lose one and you pay each of them double yours.
          </motion.p>
        )}
      </AnimatePresence>
    </section>
  );
}
