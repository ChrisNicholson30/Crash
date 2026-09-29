import type { GameState } from '../engine/game';

interface Props {
  game: GameState;
  onQuit: () => void;
}

export function Scoreboard({ game, onQuit }: Props) {
  const top = Math.max(...game.scores);
  return (
    <header className="scoreboard">
      <div className="scoreboard-meta">
        <span className="brand">Crash</span>
        <span>
          Deal {game.dealNumber} · first to {game.target}
        </span>
        <button type="button" className="link" onClick={onQuit}>
          New game
        </button>
      </div>
      <ol className="scores">
        {game.players.map((p, i) => (
          <li key={i} className={`${p.isHuman ? 'me' : ''}${game.scores[i] === top && top > 0 ? ' lead' : ''}`}>
            <span className="name">{p.name}</span>
            <span className="pts">{game.scores[i]}</span>
            <span className="bar" style={{ width: `${Math.min(100, (game.scores[i] / game.target) * 100)}%` }} />
          </li>
        ))}
      </ol>
    </header>
  );
}
