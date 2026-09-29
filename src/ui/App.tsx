import { useEffect, useState } from 'react';
import { newGame, playDeal, startDeal, type Arrangement, type GameState, type PlayerCount } from '../engine/game';
import { Setup } from './Setup';
import { Arrange } from './Arrange';
import { Reveal } from './Reveal';

const STORAGE_KEY = 'crash:game:v1';

function load(): GameState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as GameState) : null;
  } catch {
    return null;
  }
}

function save(game: GameState | null) {
  try {
    if (game) localStorage.setItem(STORAGE_KEY, JSON.stringify(game));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable (private mode etc.) — the game still plays, it just won't resume.
  }
}

export function App() {
  const [game, setGame] = useState<GameState | null>(load);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => save(game), [game]);

  if (!game) {
    return (
      <Setup onStart={(players: PlayerCount, name: string, target: number) => setGame(newGame(players, name, target))} />
    );
  }

  const quit = () => {
    if (game.phase === 'over' || confirm('Abandon this game and start again?')) setGame(null);
  };

  if (game.phase === 'arranging') {
    return (
      <>
        {error && (
          <div className="toast" role="alert" onClick={() => setError(null)}>
            {error}
          </div>
        )}
        <Arrange
          key={game.dealNumber}
          game={game}
          onQuit={quit}
          onPlay={(arr: Arrangement) => {
            try {
              setGame(playDeal(game, arr));
              setError(null);
              window.scrollTo({ top: 0 });
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        />
      </>
    );
  }

  return (
    <Reveal
      game={game}
      onQuit={quit}
      onNext={() => {
        setGame(startDeal(game));
        window.scrollTo({ top: 0 });
      }}
    />
  );
}
