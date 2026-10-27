import { useState } from 'react';
import {
  HUMAN,
  advance,
  currentBettor,
  placeBetFor,
  placeCrashFor,
  submitArrangement,
  type Match,
} from '../engine/match.ts';
import { Game } from './Game.tsx';
import { SeatRail } from './SeatRail.tsx';
import { sfx } from './sound.ts';

/** The person who has to decide something private right now, or null when the table is shared. */
export function decider(m: Match): number | null {
  if (m.phase === 'arrange') return m.deal.active.find((s) => m.players[s].isHuman && !m.deal.submitted[s]) ?? null;
  if (m.phase === 'betting') {
    const s = currentBettor(m);
    return s !== null && m.players[s].isHuman ? s : null;
  }
  return null;
}

interface Props {
  m: Match;
  /** Applies a move; shows the error if the engine refuses it. */
  act: (fn: () => Match) => void;
  onHome: () => void;
}

/**
 * A game on this device. With one person it's them against the computer. With
 * several (pass-and-play), each private decision sits behind a hand-over
 * screen, and the cards turn over on a shared view of the table.
 */
export function LocalGame({ m, act, onHome }: Props) {
  const people = m.players.flatMap((p, s) => (p.isHuman ? [s] : []));
  const shared = people.length > 1;
  const actor = shared ? decider(m) : HUMAN;
  // Whose cards are showing. A new deal, or a different person deciding, brings back the hand-over screen.
  const [shown, setShown] = useState<{ seat: number; key: string } | null>(null);
  const turnKey = `${m.id}:${m.deal.number}:${actor}`;
  const me = !shared ? HUMAN : actor !== null && shown?.seat === actor && shown.key === turnKey ? actor : null;

  const seat = me ?? HUMAN;
  const actions = {
    lock: (arr: Parameters<typeof submitArrangement>[2]) => act(() => submitArrangement(m, seat, arr, false)),
    bet: (n: number) => act(() => placeBetFor(m, seat, n)),
    crash: (n: number) => act(() => placeCrashFor(m, seat, n)),
    next: () => act(() => advance(m)),
    home: onHome,
  };

  if (shared && actor !== null && me === null) {
    return (
      <HandOver
        m={m}
        seat={actor}
        onReady={() => {
          sfx.tap();
          setShown({ seat: actor, key: turnKey });
        }}
        onHome={onHome}
      />
    );
  }
  return <Game m={m} me={me} actions={actions} />;
}

/** "Pass the phone to Sam": keeps one person's cards from the others. */
function HandOver({ m, seat, onReady, onHome }: { m: Match; seat: number; onReady: () => void; onHome: () => void }) {
  const name = m.players[seat].name;
  const task = m.phase === 'arrange' ? 'build your hands' : 'choose your opening stake — or call Crash';
  return (
    <main className="table handover">
      <header className="topbar">
        <button type="button" className="icon-btn" aria-label="Leave table" onClick={onHome}>
          ‹
        </button>
        <div className="topbar-title">
          <span className="brand">CRASH</span>
          <span>Pass &amp; play · Deal {m.deal.number}</span>
        </div>
      </header>
      <SeatRail m={m} me={null} />
      <section className="handover-card">
        <img src="/card-back.webp" alt="" width={120} height={180} />
        <small>Pass the phone to</small>
        <h2>{name}</h2>
        <p>Time to {task}. Everyone else, look away.</p>
        <button type="button" className="btn gold big wide" onClick={onReady}>
          I’m {name} — show my cards
        </button>
      </section>
    </main>
  );
}
