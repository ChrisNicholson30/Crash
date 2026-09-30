import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { Arrangement, Match } from '../engine/match.ts';
import { SeatRail } from './SeatRail.tsx';
import { ArrangeView } from './ArrangeView.tsx';
import { PlayView } from './PlayView.tsx';
import { CrashTakeover, DealSummary } from './Overlays.tsx';
import { RulesSheet } from './RulesSheet.tsx';
import { Celebration, LaughBurst } from './Fx.tsx';

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
  me: number;
  actions: GameActions;
  /** Online only: label for the "next" button (e.g. "Ready 1/2"). */
  nextLabel?: string;
  /** Online only: server deadline for the current decision. */
  deadline?: number | null;
  /** Extra header controls (chat button). */
  extra?: ReactNode;
  subtitle?: string;
  gameOverAction?: ReactNode;
}

/** The table: seats, the current stage, and the Crash / summary overlays. */
export function Game({ m, me, actions, nextLabel, deadline, extra, subtitle, gameOverAction }: Props) {
  const [rules, setRules] = useState(false);
  const [crashSeen, setCrashSeen] = useState(0);
  const dealDone = m.phase === 'dealEnd' || m.phase === 'gameOver';
  const [partySeen, setPartySeen] = useState(0);
  const showCrash = dealDone && m.deal.crashResults.length > 0 && crashSeen !== m.deal.number;
  const o = m.outcome;
  const partyKind = o?.gameWinner != null ? 'game' : o?.setWinner != null ? 'set' : o?.legWinner != null ? 'leg' : null;
  const partySeat = o ? (o.gameWinner ?? o.setWinner ?? o.legWinner) : null;
  const showParty = dealDone && !showCrash && partyKind !== null && partySeat !== null && partySeen !== m.deal.number;

  return (
    <>
      <main className="table">
        <header className="topbar">
          <button type="button" className="icon-btn" aria-label="Leave table" onClick={actions.home}>
            ‹
          </button>
          <div className="topbar-title">
            <span className="brand">CRASH</span>
            <span>{subtitle ?? `Set ${Math.min(m.setNumber, 3)} · Leg ${m.legNumber} · Deal ${m.deal.number}`}</span>
          </div>
          {extra}
          <button type="button" className="icon-btn" aria-label="How to play" onClick={() => setRules(true)}>
            ?
          </button>
        </header>

        <SeatRail m={m} me={me} />
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
                ? `${m.sets[partySeat!]} sets won`
                : partyKind === 'set'
                  ? `Set ${m.setNumber - 1} · ${m.sets[partySeat!]} of 3 sets`
                  : `Leg ${m.legNumber - 1} · ${m.legs[partySeat!]} of 3 legs this set`
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
      <AnimatePresence>{rules && <RulesSheet onClose={() => setRules(false)} />}</AnimatePresence>
      <Laughs m={m} me={me} paused={showCrash || showParty} />
    </>
  );
}

/** Banner that tells everyone the moment a player calls Crash. */
function CrashAlerts({ m, me }: { m: Match; me: number }) {
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
    navigator.vibrate?.([40, 30, 90]);
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

/** 😂 when someone makes a hilarious mistake: a flopped Crash, a big bet on the worst hand, or going bust. */
function Laughs({ m, me, paused }: { m: Match; me: number; paused: boolean }) {
  const seen = useRef<Set<string>>(new Set());
  const [queue, setQueue] = useState<{ key: string; caption: string }[]>([]);
  const who = (s: number) => (s === me ? 'You' : m.players[s].name);

  useEffect(() => {
    const d = m.deal;
    const found: { key: string; caption: string }[] = [];
    const add = (key: string, caption: string) => {
      if (seen.current.has(key)) return;
      seen.current.add(key);
      found.push({ key, caption });
    };
    // A big bet on the weakest hand at the table.
    const r = m.phase === 'reveal' ? d.results[d.position] : null;
    if (r) {
      const low = Math.min(...d.active.map((s) => r.values[s]!));
      for (const s of d.active) {
        const beatenByAll = d.active.every((o) => o === s || r.values[o]! > r.values[s]!);
        if (r.bets[s] >= RULES.minBet * 10 && r.values[s] === low && beatenByAll) {
          add(`bet${d.number}:${d.position}:${s}`, `${who(s)} bet ${r.bets[s].toLocaleString('en-GB')} on the worst hand`);
        }
      }
    }
    if (m.phase === 'dealEnd' || m.phase === 'gameOver') {
      for (const c of d.crashResults) {
        if (!c.success) add(`crash${d.number}:${c.player}`, `${who(c.player)} called Crash… and flopped`);
      }
      for (const s of m.outcome?.eliminated ?? []) add(`bust${d.number}:${s}`, `${who(s)} went bust`);
    }
    if (found.length) setQueue((q) => [...q, ...found]);
  }, [m]); // eslint-disable-line react-hooks/exhaustive-deps

  // Wait for the CRASH takeover / celebration to close so the laugh isn't hidden behind it.
  const current = paused ? undefined : queue[0];
  return (
    <AnimatePresence>
      {current && <LaughBurst key={current.key} caption={current.caption} onDone={() => setQueue((q) => q.slice(1))} />}
    </AnimatePresence>
  );
}
