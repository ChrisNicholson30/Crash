import { useState } from 'react';
import { DEFAULT_TARGET, type PlayerCount } from '../engine/game';
import { CATEGORY_NAME, Category } from '../engine/hands';

interface Props {
  onStart: (players: PlayerCount, name: string, target: number) => void;
}

const RULES: [Category, string][] = [
  [Category.Prile, 'Three of the same rank — 3 kings'],
  [Category.Stiff, 'Three in a row, same suit — 2 3 4 ♦'],
  [Category.Run, 'Three in a row, any suits — 2♣ 3♦ 4♠'],
  [Category.Flush, 'Three of the same suit — K 5 3 ♥'],
  [Category.Pair, 'Two of the same rank'],
  [Category.HighCard, 'Anything else'],
];

export function Setup({ onStart }: Props) {
  const [players, setPlayers] = useState<PlayerCount>(4);
  const [name, setName] = useState('You');
  const [target, setTarget] = useState(DEFAULT_TARGET[4]);

  const pick = (p: PlayerCount) => {
    setPlayers(p);
    setTarget(DEFAULT_TARGET[p]);
  };

  return (
    <main className="screen setup">
      <header className="hero">
        <h1>Crash</h1>
        <p>Split your cards into hands of three. Every hand fights the same hand of every opponent.</p>
      </header>

      <form
        className="panel"
        onSubmit={(e) => {
          e.preventDefault();
          onStart(players, name.trim() || 'You', Math.max(1, target));
        }}
      >
        <fieldset className="field">
          <legend>Players</legend>
          <div className="segmented">
            {([3, 4] as const).map((p) => (
              <button
                key={p}
                type="button"
                className={players === p ? 'on' : ''}
                aria-pressed={players === p}
                onClick={() => pick(p)}
              >
                {p} players
                <small>{p === 4 ? '13 cards · 4 hands' : '17 cards · 5 hands'}</small>
              </button>
            ))}
          </div>
          <p className="hint">You against {players - 1} computer players.</p>
        </fieldset>

        <label className="field">
          <span>Your name</span>
          <input value={name} maxLength={12} onChange={(e) => setName(e.target.value)} />
        </label>

        <label className="field">
          <span>Points to win</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={99}
            value={target}
            onChange={(e) => setTarget(Number(e.target.value))}
          />
        </label>

        <button type="submit" className="primary">
          Deal
        </button>
      </form>

      <section className="panel rules">
        <h2>Hands, best first</h2>
        <ol>
          {RULES.map(([cat, text]) => (
            <li key={cat}>
              <strong>{CATEGORY_NAME[cat]}</strong> <span>{text}</span>
            </li>
          ))}
        </ol>
        <p className="hint">
          Same type? Highest card wins, then the next. Aces play high or low (A-2-3, Q-K-A) but runs don't wrap. Each
          win against one opponent's matching hand scores 1 point; an exact tie scores nothing. Spare cards are thrown
          away.
        </p>
      </section>
    </main>
  );
}
