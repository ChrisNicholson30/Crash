import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { currentBettor, matchRules, type Arrangement, type Match } from '../engine/match.ts';
import { SeatRail } from './SeatRail.tsx';
import { ArrangeView } from './ArrangeView.tsx';
import { PlayView } from './PlayView.tsx';
import { CrashTakeover, DealSummary } from './Overlays.tsx';
import { RulesSheet } from './RulesSheet.tsx';
import { Celebration } from './Fx.tsx';
import { TableMenu } from './Menus.tsx';
import { buzz } from './settings.ts';
import { sfx } from './sound.ts';

export interface GameActions {
  lock: (arr: Arrangement) => void;
  bet: (amount: number) => void;
  /** Call Crash at the opening and lock the stake for the deal. */
  crash: (amount: number) => void;
  next: () => void;
  home: () => void;
}

interface Props {
  m: Match;
  /** Whose cards this screen shows, or null for the shared table (pass-and-play hand-overs, watchers). */
  me: number | null;
  actions: GameActions;
  /** Online only: label for the "next" button (e.g. "Ready 1/2"). */
  nextLabel?: string;
  /** Online only: server deadline for the current decision. */
  deadline?: number | null;
  /** Extra header controls (chat button). */
  extra?: ReactNode;
  subtitle?: string;
  gameOverAction?: ReactNode;
  /** Table talk per seat. */
  bubbles?: Record<number, string>;
  /** Shown above the table (e.g. "Watching"). */
  banner?: ReactNode;
}

/** "Set 1 · Leg 2 · Deal 5", leaving out what this match length doesn't use. */
export function progressLabel(m: Match): string {
  const r = matchRules(m);
  const parts: string[] = [];
  if (r.setsToWin > 1) parts.push(`Set ${Math.min(m.setNumber, r.setsToWin)}`);
  if (r.legsPerSet > 1) parts.push(`Leg ${m.legNumber}`);
  parts.push(`Deal ${m.deal.number}`);
  return parts.join(' · ');
}

/** The table: seats, the current stage, and the Crash / summary overlays. */
export function Game({ m, me, actions, nextLabel, deadline, extra, subtitle, gameOverAction, bubbles, banner }: Props) {
  const [rules, setRules] = useState(false);
  const [menu, setMenu] = useState(false);
  const [crashSeen, setCrashSeen] = useState(0);
  const dealDone = m.phase === 'dealEnd' || m.phase === 'gameOver';
  const [partySeen, setPartySeen] = useState(0);
  const showCrash = dealDone && m.deal.crashResults.length > 0 && crashSeen !== m.deal.number;
  const o = m.outcome;
  const partyKind = o?.gameWinner != null ? 'game' : o?.setWinner != null ? 'set' : o?.legWinner != null ? 'leg' : null;
  const partySeat = o ? (o.gameWinner ?? o.setWinner ?? o.legWinner) : null;
  const showParty = dealDone && !showCrash && partyKind !== null && partySeat !== null && partySeen !== m.deal.number;
  const r = matchRules(m);

  useTableSounds(m, me);
  useWakeLock();

  return (
    <>
      <main className="table">
        <header className="topbar">
          <button type="button" className="icon-btn" aria-label="Leave table" onClick={actions.home}>
            ‹
          </button>
          <div className="topbar-title">
            <span className="brand">CRASH</span>
            <span>{subtitle ?? progressLabel(m)}</span>
          </div>
          {extra}
          <button type="button" className="icon-btn" aria-label="Table menu" onClick={() => setMenu(true)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
        </header>

        {banner}
        <SeatRail m={m} me={me} bubbles={bubbles} />
        <CrashAlerts m={m} me={me} />

        <AnimatePresence mode="wait">
          <motion.div
            key={m.phase === 'arrange' ? `a${m.deal.number}` : `p${m.deal.number}`}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.3 }}
          >
            {m.phase === 'arrange' ? (
              <ArrangeView m={m} me={me} onLock={actions.lock} deadline={deadline} />
            ) : (
              <PlayView m={m} me={me} onBet={actions.bet} onCrash={actions.crash} onNext={actions.next} nextLabel={nextLabel} deadline={deadline} />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      <AnimatePresence>{showCrash && <CrashTakeover key="crash" m={m} me={me} onDone={() => setCrashSeen(m.deal.number)} />}</AnimatePresence>
      <AnimatePresence>
        {showParty && (
          <Celebration
            key={`party${m.deal.number}`}
            kind={partyKind!}
            name={m.players[partySeat!].name}
            mine={partySeat === me}
            detail={
              partyKind === 'game'
                ? r.setsToWin > 1
                  ? `${m.sets[partySeat!]} sets won`
                  : r.legsPerSet > 1
                    ? `${r.legsPerSet} legs won`
                    : `First to ${r.pointsPerLeg} points`
                : partyKind === 'set'
                  ? `Set ${m.setNumber - 1} · ${m.sets[partySeat!]} of ${r.setsToWin} sets`
                  : `Leg ${m.legNumber - 1} · ${m.legs[partySeat!]} of ${r.legsPerSet} legs${r.setsToWin > 1 ? ' this set' : ''}`
            }
            onDone={() => setPartySeen(m.deal.number)}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {dealDone && !showCrash && !showParty && (
          <DealSummary
            key={`s${m.deal.number}`}
            m={m}
            me={me}
            onNext={actions.next}
            nextLabel={nextLabel}
            onHome={actions.home}
            gameOverAction={gameOverAction}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {menu && (
          <TableMenu
            m={m}
            onRules={() => {
              setMenu(false);
              setRules(true);
            }}
            onLeave={() => {
              setMenu(false);
              actions.home();
            }}
            onClose={() => setMenu(false)}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>{rules && <RulesSheet onClose={() => setRules(false)} />}</AnimatePresence>
    </>
  );
}

/** Plays the table's sounds as the match moves on. */
function useTableSounds(m: Match, me: number | null) {
  const prev = useRef<Match | null>(null);
  useEffect(() => {
    const p = prev.current;
    prev.current = m;
    if (!p) return;
    const d = m.deal;
    const pd = p.deal;
    if (d.number !== pd.number) {
      if (m.phase === 'arrange') sfx.deal();
      return;
    }
    // Hands turned over: the flip, then whether this screen's player took the pot.
    if (d.results.length > pd.results.length) {
      const r = d.results[d.results.length - 1];
      sfx.flip();
      if (me !== null && d.active.includes(me) && r.pot > 0) {
        if (r.potWinners.includes(me)) setTimeout(sfx.win, 220);
        else if (r.bets[me] > 0) setTimeout(sfx.lose, 220);
      }
    }
    // Someone else chose a stake.
    const placed = (x: Match) => x.deal.bets[0].filter((b) => b !== null).length;
    if (m.phase === 'betting' && placed(m) > placed(p)) sfx.chip();
    // Your opening decision has come round.
    if (me !== null && currentBettor(m) === me && currentBettor(p) !== me) {
      sfx.turn();
      buzz([20, 60, 20]);
    }
  }, [m, me]);
}

/** Keeps the screen on while a game is open (where the browser allows it). */
function useWakeLock() {
  useEffect(() => {
    type Sentinel = { release: () => Promise<void> };
    const wl = (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<Sentinel> } }).wakeLock;
    if (!wl) return;
    let lock: Sentinel | null = null;
    let alive = true;
    const take = () => {
      if (document.visibilityState !== 'visible') return;
      wl.request('screen')
        .then((l) => {
          if (alive) lock = l;
          else void l.release();
        })
        .catch(() => {});
    };
    take();
    document.addEventListener('visibilitychange', take);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', take);
      void lock?.release().catch(() => {});
    };
  }, []);
}

/** Banner that tells everyone the moment a player calls Crash. */
function CrashAlerts({ m, me }: { m: Match; me: number | null }) {
  const announced = useRef<Set<string>>(new Set());
  const [alerts, setAlerts] = useState<{ key: string; seat: number; from: number }[]>([]);

  useEffect(() => {
    if (m.phase === 'arrange') return;
    const fresh = m.deal.crash.flatMap((on, seat) => {
      const key = `${m.deal.number}:${seat}`;
      if (!on || announced.current.has(key)) return [];
      announced.current.add(key);
      return [{ key, seat, from: m.deal.crashFrom?.[seat] ?? 0 }];
    });
    if (!fresh.length) return;
    setAlerts((a) => [...a, ...fresh]);
    buzz([40, 30, 90]);
    sfx.crash();
    // Not tied to this effect's cleanup: the match updates often, and that mustn't cancel the dismissal.
    setTimeout(() => setAlerts((a) => a.filter((x) => !fresh.includes(x))), 3600);
  }, [m]);

  return (
    <div className="crash-alerts" aria-live="assertive">
      <AnimatePresence>
        {alerts.map((a) => (
          <motion.div
            key={a.key}
            className="crash-alert"
            initial={{ opacity: 0, y: -30, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1, x: [0, -6, 6, -3, 0] }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ type: 'spring', stiffness: 500, damping: 26 }}
          >
            <b>CRASH</b>
            <span>
              {a.seat === me ? 'You called' : `${m.players[a.seat].name} called`} Crash
              {a.from > 0 ? ` from hand ${a.from + 1}` : ''} —{' '}
              {a.seat === me ? 'win every hand!' : 'they must win every hand.'}
            </span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

/** Seconds left until `deadline`, ticking. */
export function useCountdown(deadline?: number | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!deadline) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [deadline]);
  return deadline ? Math.max(0, Math.ceil((deadline - now) / 1000)) : null;
}
