import { useMemo, useState } from 'react';
import { sameCard, sortByRank, sortBySuit, type Card } from '../engine/cards';
import { CATEGORY_NAME, evaluate } from '../engine/hands';
import { bestPartition } from '../engine/ai';
import { HANDS_PER_PLAYER, type Arrangement, type GameState } from '../engine/game';
import { CardView, EmptySlot } from './CardView';
import { Scoreboard } from './Scoreboard';

interface Props {
  game: GameState;
  onPlay: (arrangement: Arrangement) => void;
  onQuit: () => void;
}

export function Arrange({ game, onPlay, onQuit }: Props) {
  const dealt = game.dealt[0];
  const handCount = HANDS_PER_PLAYER[game.playerCount];
  const [slots, setSlots] = useState<Card[][]>(() => Array.from({ length: handCount }, () => []));
  const [active, setActive] = useState(0);
  const [bySuit, setBySuit] = useState(true);

  const placed = slots.flat();
  const pool = useMemo(() => {
    const left = dealt.filter((c) => !placed.some((p) => sameCard(p, c)));
    return bySuit ? sortBySuit(left) : sortByRank(left);
  }, [dealt, placed, bySuit]);
  const complete = slots.every((s) => s.length === 3);
  const spareCount = dealt.length - handCount * 3;

  const nextOpen = (from: Card[][], start: number) => {
    for (let i = 0; i < from.length; i++) {
      const idx = (start + i) % from.length;
      if (from[idx].length < 3) return idx;
    }
    return start;
  };

  const place = (card: Card) => {
    const target = slots[active].length < 3 ? active : nextOpen(slots, active);
    if (slots[target].length >= 3) return;
    const next = slots.map((s, i) => (i === target ? [...s, card] : s));
    setSlots(next);
    setActive(next[target].length === 3 ? nextOpen(next, target) : target);
  };

  const unplace = (slot: number, card: Card) => {
    setSlots(slots.map((s, i) => (i === slot ? s.filter((c) => !sameCard(c, card)) : s)));
    setActive(slot);
  };

  const move = (slot: number, dir: -1 | 1) => {
    const to = slot + dir;
    if (to < 0 || to >= slots.length) return;
    const next = slots.slice();
    [next[slot], next[to]] = [next[to], next[slot]];
    setSlots(next);
    setActive(to);
  };

  const autoArrange = () => {
    setSlots(bestPartition(dealt, handCount));
    setActive(0);
  };

  const clear = () => {
    setSlots(Array.from({ length: handCount }, () => []));
    setActive(0);
  };

  const play = () => {
    onPlay({ hands: slots, spares: pool });
  };

  return (
    <main className="screen arrange">
      <Scoreboard game={game} onQuit={onQuit} />

      <section className="table" aria-label="Your hands">
        {slots.map((slot, i) => {
          const ev = slot.length === 3 ? evaluate(slot) : null;
          return (
            <div
              key={i}
              className={`slot${i === active ? ' active' : ''}${ev ? ' full' : ''}`}
              onClick={() => setActive(i)}
            >
              <div className="slot-head">
                <span className="slot-num">Hand {i + 1}</span>
                <span className="slot-cat">{ev ? CATEGORY_NAME[ev.category] : `${slot.length}/3`}</span>
                <span className="slot-move">
                  <button
                    type="button"
                    aria-label={`Move hand ${i + 1} up`}
                    disabled={i === 0}
                    onClick={(e) => {
                      e.stopPropagation();
                      move(i, -1);
                    }}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={`Move hand ${i + 1} down`}
                    disabled={i === slots.length - 1}
                    onClick={(e) => {
                      e.stopPropagation();
                      move(i, 1);
                    }}
                  >
                    ↓
                  </button>
                </span>
              </div>
              <div className="slot-cards">
                {[0, 1, 2].map((k) =>
                  slot[k] ? (
                    <CardView
                      key={k}
                      card={slot[k]}
                      onClick={() => {
                        unplace(i, slot[k]);
                      }}
                    />
                  ) : (
                    <EmptySlot key={k} />
                  ),
                )}
              </div>
            </div>
          );
        })}
      </section>

      <section className="pool" aria-label="Cards in your hand">
        <div className="pool-head">
          <span>
            {complete
              ? `${pool.length} spare card${pool.length === 1 ? '' : 's'} — thrown away`
              : `Tap a card to add it to Hand ${active + 1}`}
          </span>
          <button type="button" className="link" onClick={() => setBySuit(!bySuit)}>
            Sort by {bySuit ? 'rank' : 'suit'}
          </button>
        </div>
        <div className="pool-cards">
          {pool.map((c) => (
            <CardView key={`${c.rank}${c.suit}`} card={c} onClick={complete ? undefined : () => place(c)} />
          ))}
        </div>
      </section>

      <footer className="actions">
        <button type="button" onClick={autoArrange}>
          Auto-arrange
        </button>
        <button type="button" onClick={clear} disabled={placed.length === 0}>
          Clear
        </button>
        <button type="button" className="primary" onClick={play} disabled={!complete || pool.length !== spareCount}>
          Play hands
        </button>
      </footer>
    </main>
  );
}
