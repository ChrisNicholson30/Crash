import { CATEGORY_NAME, displayOrder } from '../engine/hands';
import type { GameState } from '../engine/game';
import { CardView } from './CardView';
import { Scoreboard } from './Scoreboard';

interface Props {
  game: GameState;
  onNext: () => void;
  onQuit: () => void;
}

export function Reveal({ game, onNext, onQuit }: Props) {
  const result = game.lastResult;
  if (!result) return null;
  const positions = result.arrangements[0].hands.length;
  const over = game.phase === 'over';
  const winner = game.winner !== null ? game.players[game.winner] : null;

  return (
    <main className="screen reveal">
      <Scoreboard game={game} onQuit={onQuit} />

      {over && winner ? (
        <section className="banner win" role="status">
          <h2>{winner.isHuman ? 'You win!' : `${winner.name} wins`}</h2>
          <p>
            {game.scores[game.winner!]} points after {game.dealNumber} deal{game.dealNumber === 1 ? '' : 's'}.
          </p>
        </section>
      ) : (
        <section className="banner" role="status">
          <h2>Deal {game.dealNumber} results</h2>
          <p>
            {game.players.map((p, i) => `${p.name} +${result.points[i]}`).join(' · ')}
            {Math.max(...game.scores) >= game.target ? ' — level at the top, so another deal.' : ''}
          </p>
        </section>
      )}

      <section className="showdown">
        {Array.from({ length: positions }, (_, pos) => {
          const best = Math.max(...result.evals.map((e) => e[pos].value));
          return (
            <div key={pos} className="position">
              <h3>Hand {pos + 1}</h3>
              <div className="position-grid" style={{ gridTemplateColumns: `repeat(${game.playerCount}, 1fr)` }}>
                {game.players.map((p, i) => {
                  const ev = result.evals[i][pos];
                  const pts = result.pointsByPosition[i][pos];
                  return (
                    <div key={i} className={`entry${ev.value === best ? ' best' : ''}${p.isHuman ? ' me' : ''}`}>
                      <span className="entry-name">{p.name}</span>
                      <span className="entry-cards">
                        {displayOrder(result.arrangements[i].hands[pos]).map((c) => (
                          <CardView key={`${c.rank}${c.suit}`} card={c} size="sm" />
                        ))}
                      </span>
                      <span className="entry-cat">{CATEGORY_NAME[ev.category]}</span>
                      <span className={`entry-pts${pts ? ' won' : ''}`}>+{pts}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </section>

      <footer className="actions">
        {over ? (
          <button type="button" className="primary" onClick={onQuit}>
            New game
          </button>
        ) : (
          <button type="button" className="primary" onClick={onNext}>
            Next deal
          </button>
        )}
      </footer>
    </main>
  );
}
