import { useEffect, useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { HUMAN, advance, callCrash, lockIn, newMatch, placeBet, type Match } from '../engine/match.ts';
import { api, type Friend, type User } from '../net/api.ts';
import { Home } from './Home.tsx';
import { Game } from './Game.tsx';
import { RulesSheet } from './RulesSheet.tsx';
import { Account } from './online/Account.tsx';
import { Hub } from './online/Hub.tsx';
import { Conversation } from './online/Conversation.tsx';
import { RoomScreen } from './online/RoomScreen.tsx';
import { Backdrop } from './Fx.tsx';

const STORAGE_KEY = 'crash:match:v4';

function load(): Match | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const m = raw ? (JSON.parse(raw) as Match) : null;
    return m?.version === 3 ? m : null;
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

type Screen =
  | { name: 'home' }
  | { name: 'solo' }
  | { name: 'account'; note?: string; then?: Screen }
  | { name: 'hub' }
  | { name: 'room'; id: string }
  | { name: 'chat'; friend: Friend };

/** Pulls ?invite=CODE or ?table=CODE off the URL once. */
function takeLinkParams() {
  const q = new URLSearchParams(location.search);
  const invite = q.get('invite');
  const table = q.get('table');
  if (invite || table) history.replaceState(null, '', location.pathname);
  return { invite, table };
}

export function App() {
  const [saved, setSaved] = useState<Match | null>(load);
  const [m, setM] = useState<Match | null>(null);
  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [unread, setUnread] = useState(0);
  const [rules, setRules] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (m) save(m);
  }, [m]);

  // Who's signed in (quietly fails offline), plus unread message count.
  useEffect(() => {
    const check = () =>
      api
        .me()
        .then((r) => {
          setUser(r.user);
          setUnread(r.unread ?? 0);
        })
        .catch(() => setUser((u) => u ?? null));
    check();
    const t = setInterval(check, 20000);
    return () => clearInterval(t);
  }, []);

  // Invite links: befriend the sender and open their table, signing in first if needed.
  useEffect(() => {
    if (user === undefined) return;
    const { invite, table } = takeLinkParams();
    if (!invite && !table) return;
    if (!user) {
      const then: Screen = table ? { name: 'room', id: table } : { name: 'hub' };
      if (invite) {
        api
          .inviteInfo(invite)
          .then((i) => {
            sessionStorage.setItem('crash:invite', invite);
            setScreen({ name: 'account', note: `${i.from} invited you to play Crash. Create an account or log in to join them.`, then });
          })
          .catch((e) => setError((e as Error).message));
      } else setScreen({ name: 'account', note: 'Log in to join the table.', then });
      return;
    }
    if (invite) acceptInvite(invite);
    else if (table) setScreen({ name: 'room', id: table });
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const acceptInvite = (code: string) =>
    api
      .acceptInvite(code)
      .then(({ tableId }) => setScreen(tableId ? { name: 'room', id: tableId } : { name: 'hub' }))
      .catch((e) => setError((e as Error).message));

  const act = (fn: () => Match) => {
    try {
      setM(fn());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const goOnline = () => (user ? setScreen({ name: 'hub' }) : setScreen({ name: 'account' }));

  let view: React.ReactNode;
  switch (screen.name) {
    case 'solo':
      view = m && (
        <Game
          m={m}
          me={HUMAN}
          actions={{
            lock: (arr, crash) => act(() => lockIn(m, arr, crash)),
            bet: (n) => act(() => placeBet(m, n)),
            crash: (amount) => act(() => placeBet(callCrash(m, HUMAN), amount)),
            next: () => act(() => advance(m)),
            home: () => {
              if (m.phase !== 'gameOver' && !confirm('Leave this game? It will be saved.')) return;
              setSaved(m.phase === 'gameOver' ? null : m);
              setM(null);
              setScreen({ name: 'home' });
            },
          }}
        />
      );
      break;
    case 'account':
      view = (
        <Account
          note={screen.note}
          onBack={() => setScreen({ name: 'home' })}
          onDone={(u) => {
            setUser(u);
            const pending = sessionStorage.getItem('crash:invite');
            sessionStorage.removeItem('crash:invite');
            if (pending) acceptInvite(pending);
            else setScreen(screen.then ?? { name: 'hub' });
          }}
        />
      );
      break;
    case 'hub':
      view = user && (
        <Hub
          user={user}
          onBack={() => setScreen({ name: 'home' })}
          onOpenTable={(id) => setScreen({ name: 'room', id })}
          onOpenChat={(friend) => setScreen({ name: 'chat', friend })}
          onLogout={async () => {
            await api.logout().catch(() => {});
            setUser(null);
            setScreen({ name: 'home' });
          }}
        />
      );
      break;
    case 'chat':
      view = user && (
        <Conversation me={user} friend={screen.friend} onBack={() => setScreen({ name: 'hub' })} onJoinTable={(id) => setScreen({ name: 'room', id })} />
      );
      break;
    case 'room':
      view = user && <RoomScreen key={screen.id} user={user} tableId={screen.id} onLeave={() => setScreen({ name: 'hub' })} />;
      break;
    default:
      view = (
        <Home
          canResume={!!saved}
          onResume={() => {
            setM(saved);
            setScreen({ name: 'solo' });
          }}
          onStart={(players, name) => {
            setM(newMatch(players, name));
            setScreen({ name: 'solo' });
          }}
          onOnline={goOnline}
          user={user ?? null}
          unread={unread}
          onRules={() => setRules(true)}
        />
      );
  }

  return (
    <MotionConfig reducedMotion="user">
      <Backdrop />
      <AnimatePresence mode="wait">
        <motion.div
          key={screen.name === 'room' ? `room-${screen.id}` : screen.name}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          {view}
        </motion.div>
      </AnimatePresence>

      <AnimatePresence>
        {error && (
          <motion.div className="toast" role="alert" initial={{ y: -40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -40, opacity: 0 }} onClick={() => setError(null)}>
            {error}
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>{rules && <RulesSheet onClose={() => setRules(false)} />}</AnimatePresence>
    </MotionConfig>
  );
}
