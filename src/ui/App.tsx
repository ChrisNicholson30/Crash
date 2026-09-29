import { useEffect, useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { advance, lockIn, newMatch, placeBet, type Match } from '../engine/match.ts';
import { Home } from './Home.tsx';
import { SeatRail } from './SeatRail.tsx';
import { ArrangeView } from './ArrangeView.tsx';
import { PlayView } from './PlayView.tsx';
import { CrashTakeover, DealSummary } from './Overlays.tsx';
import { RulesSheet } from './RulesSheet.tsx';

const STORAGE_KEY = 'crash:match:v2';

function load(): Match | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const m = raw ? (JSON.parse(raw) as Match) : null;
    return m?.version === 2 ? m : null;
  } catch {
    return null;
  }
}

function save(m: Match | null) {
  try {
    if (m && m.phase !== 'gameOver') localStorage.setItem(STORAGE_KEY, JSON.stringify(m));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable (private mode etc.) — the game still plays, it just won't resume.
  }
}

export function App() {
  const [saved] = useState<Match | null>(load);
  const [m, setM] = useState<Match | null>(null);
  const [rules, setRules] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Deal number whose Crash takeover has been dismissed. */
  const [crashSeen, setCrashSeen] = useState(0);

  useEffect(() => {
    if (m) save(m);
  }, [m]);

  const act = (fn: () => Match) => {
    try {
      setM(fn());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const home = () => {
    setM(null);
    save(null);
  };

  const dealDone = m && (m.phase === 'dealEnd' || m.phase === 'gameOver');
  const showCrash = !!dealDone && m.deal.crashResults.length > 0 && crashSeen !== m.deal.number;

  return (
    <MotionConfig reducedMotion="user">
      <div className="felt" aria-hidden="true" />
      {!m ? (
        <Home
          canResume={!!saved}
          onResume={() => setM(saved)}
          onStart={(players, name) => setM(newMatch(players, name))}
          onRules={() => setRules(true)}
        />
      ) : (
        <main className="table">
          <header className="topbar">
            <button type="button" className="icon-btn" aria-label="Home" onClick={() => (m.phase === 'gameOver' || confirm('Leave this game? It will be saved.') ? setM(null) : null)}>
              ‹
            </button>
            <div className="topbar-title">
              <span className="brand">CRASH</span>
              <span>
                Set {Math.min(m.setNumber, 3)} · Leg {m.legNumber} · Deal {m.deal.number}
              </span>
            </div>
            <button type="button" className="icon-btn" aria-label="How to play" onClick={() => setRules(true)}>
              ?
            </button>
          </header>

          <SeatRail m={m} />

          <AnimatePresence mode="wait">
            <motion.div
              key={m.phase === 'arrange' ? `a${m.deal.number}` : `p${m.deal.number}`}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.3 }}
            >
              {m.phase === 'arrange' ? (
                <ArrangeView m={m} onLock={(arr, crash) => act(() => lockIn(m, arr, crash))} />
              ) : (
                <PlayView
                  m={m}
                  onBet={(n) => act(() => placeBet(m, n))}
                  onNext={() => act(() => advance(m))}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      )}

      <AnimatePresence>
        {error && (
          <motion.div className="toast" role="alert" initial={{ y: -40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -40, opacity: 0 }} onClick={() => setError(null)}>
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showCrash && <CrashTakeover key="crash" m={m!} onDone={() => setCrashSeen(m!.deal.number)} />}
      </AnimatePresence>
      <AnimatePresence>
        {dealDone && !showCrash && (
          <DealSummary key={`s${m!.deal.number}`} m={m!} onNext={() => act(() => advance(m!))} onHome={home} />
        )}
      </AnimatePresence>
      <AnimatePresence>{rules && <RulesSheet onClose={() => setRules(false)} />}</AnimatePresence>
    </MotionConfig>
  );
}
