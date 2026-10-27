import { useEffect, useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { HUMAN, botNames, newMatchWith, resumeMatch, type Match } from '../engine/match.ts';
import { api, type Friend, type TableInvite, type User } from '../net/api.ts';
import { Home } from './Home.tsx';
import { LocalGame } from './LocalGame.tsx';
import { RulesSheet } from './RulesSheet.tsx';
import { InstallSheet, RecordSheet, SettingsSheet } from './Menus.tsx';
import { recordDeal, resetRecord, useRecord } from './record.ts';
import { setBadge } from './pwa.ts';
import { sfx } from './sound.ts';
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
    return m?.version === 3 ? resumeMatch(m) : null;
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
  const [invites, setInvites] = useState<TableInvite[]>([]);
  const [dismissed, setDismissed] = useState<number[]>([]);
  const [sheet, setSheet] = useState<'rules' | 'record' | 'settings' | 'install' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const record = useRecord();

  useEffect(() => {
    if (!m) return;
    save(m);
    // Only games against the computer go on your record (pass-and-play has several people).
    if (m.players.filter((p) => p.isHuman).length === 1) recordDeal(m, HUMAN);
  }, [m]);

  // Who's signed in (quietly fails offline), unread messages, and open table invites.
  useEffect(() => {
    const check = () =>
      api
        .me()
        .then((r) => {
          setUser(r.user);
          setUnread(r.unread ?? 0);
          setInvites((old) => {
            const fresh = r.invites ?? [];
            if (fresh.some((i) => !old.some((o) => o.id === i.id))) sfx.message();
            return fresh;
          });
        })
        .catch(() => setUser((u) => u ?? null));
    check();
    const t = setInterval(check, 15000);
    const wake = () => document.visibilityState === 'visible' && check();
    document.addEventListener('visibilitychange', wake);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', wake);
    };
  }, []);

  useEffect(() => {
    setBadge(unread);
  }, [unread]);

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
        <LocalGame
          m={m}
          act={act}
          onHome={() => {
            if (m.phase !== 'gameOver' && !confirm('Leave this game? It will be saved.')) return;
            setSaved(m.phase === 'gameOver' ? null : m);
            setM(null);
            setScreen({ name: 'home' });
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
          onStart={({ players, names, options }) => {
            const people = names.map((name) => ({ name, isHuman: true }));
            const bots = botNames(names, players - names.length).map((name) => ({ name, isHuman: false }));
            setM(newMatchWith([...people, ...bots], Math.random, options));
            setScreen({ name: 'solo' });
          }}
          onOnline={goOnline}
          user={user ?? null}
          unread={unread}
          onRules={() => setSheet('rules')}
          onRecord={() => setSheet('record')}
          onSettings={() => setSheet('settings')}
          onInstallHelp={() => setSheet('install')}
        />
      );
  }

  const invite = invites.find((i) => !dismissed.includes(i.id) && !(screen.name === 'room' && screen.id === i.tableId));

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
      <AnimatePresence>
        {invite && screen.name !== 'solo' && (
          <motion.div className="invite-banner" role="status" initial={{ y: -40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -40, opacity: 0 }}>
            <span>
              <b>{invite.from}</b> invited you to table {invite.tableId}
            </span>
            <button
              type="button"
              className="btn gold small-btn"
              onClick={() => {
                setDismissed((d) => [...d, invite.id]);
                setScreen({ name: 'room', id: invite.tableId });
              }}
            >
              Join
            </button>
            <button type="button" className="icon-btn" aria-label="Dismiss invite" onClick={() => setDismissed((d) => [...d, invite.id])}>
              ×
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {sheet === 'rules' && <RulesSheet onClose={() => setSheet(null)} />}
        {sheet === 'settings' && <SettingsSheet onClose={() => setSheet(null)} />}
        {sheet === 'install' && <InstallSheet onClose={() => setSheet(null)} />}
        {sheet === 'record' && (
          <RecordSheet
            title="Your record"
            note="Games against the computer on this device."
            tally={record}
            onReset={resetRecord}
            onClose={() => setSheet(null)}
          />
        )}
      </AnimatePresence>
    </MotionConfig>
  );
}
