import { useState } from 'react';
import { motion } from 'motion/react';

interface Props {
  user: { username: string } | null;
  unread: number;
  onOnline: () => void;
  canResume: boolean;
  onResume: () => void;
  onStart: (players: 3 | 4, name: string) => void;
  onRules: () => void;
}

export function Home({ user, unread, onOnline, canResume, onResume, onStart, onRules }: Props) {
  const [players, setPlayers] = useState<3 | 4>(4);
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem('crash:name') ?? '';
    } catch {
      return '';
    }
  });

  const start = () => {
    const n = name.trim() || 'You';
    try {
      localStorage.setItem('crash:name', n);
    } catch {
      /* storage unavailable */
    }
    onStart(players, n);
  };

  return (
    <main className="home">
      <img className="hero-card" src="/card-back.webp" alt="" width={168} height={252} />

      <h1 className="wordmark">CRASH</h1>
      <p className="tagline">
        Thirteen-card brag. Build your hands, back them with Barney tokens, and call the Crash.
      </p>

      <section className="glass setup">
        <label className="field">
          <span>Your name</span>
          <input value={name} placeholder="You" maxLength={12} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="field">
          <span>Table</span>
          <div className="seg">
            {([3, 4] as const).map((p) => (
              <button key={p} type="button" className={players === p ? 'on' : ''} aria-pressed={players === p} onClick={() => setPlayers(p)}>
                <b>{p} players</b>
                <small>{p === 4 ? '13 cards · 4 hands' : '17 cards · 5 hands'}</small>
                {players === p && <motion.span layoutId="seg-pill" className="seg-pill" />}
              </button>
            ))}
          </div>
        </div>
        <ul className="facts">
          <li>
            <b>10</b> points wins a leg
          </li>
          <li>
            <b>3</b> legs wins a set
          </li>
          <li>
            <b>3</b> sets wins the game
          </li>
          <li>
            <b>10k</b> tokens each
          </li>
          <li>
            <b>½</b> your Crash stake if it fails
          </li>
        </ul>
        <button type="button" className="btn gold big" onClick={start}>
          Play the computer
        </button>
        <button type="button" className="btn online big" onClick={onOnline}>
          <span>Play friends online</span>
          {user ? <small>as {user.username}</small> : <small>log in or sign up</small>}
          {unread > 0 && <span className="unread">{unread}</span>}
        </button>
        {canResume && (
          <button type="button" className="btn ghost" onClick={onResume}>
            Resume game
          </button>
        )}
        <button type="button" className="btn link" onClick={onRules}>
          How to play
        </button>
      </section>
    </main>
  );
}
