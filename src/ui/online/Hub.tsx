import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { api, type BoardRow, type Friend, type OpenTable, type User } from '../../net/api.ts';
import type { Tally } from '../../engine/tally.ts';
import { RecordSheet } from '../Menus.tsx';

/** Seen in the last minute (the app checks in every 15 seconds). */
const ONLINE_MS = 60_000;

interface Props {
  user: User;
  onBack: () => void;
  onOpenTable: (id: string) => void;
  onOpenChat: (friend: Friend) => void;
  onLogout: () => void;
}

export function Hub({ user, onBack, onOpenTable, onOpenChat, onLogout }: Props) {
  const [friends, setFriends] = useState<Friend[] | null>(null);
  const [serverNow, setServerNow] = useState(() => Date.now());
  const [tables, setTables] = useState<OpenTable[]>([]);
  const [board, setBoard] = useState<BoardRow[]>([]);
  const [stats, setStats] = useState<Tally | null>(null);
  const [code, setCode] = useState('');
  const [add, setAdd] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () =>
    Promise.all([
      api.friends().then((r) => {
        setFriends(r.friends);
        setServerNow(r.now ?? Date.now());
      }),
      api.myTables().then((r) => setTables(r.tables)),
    ]).catch((e) => setError((e as Error).message));

  useEffect(() => {
    load();
    api.leaderboard().then((r) => setBoard(r.players)).catch(() => {});
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, []);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const create = (seats: 3 | 4) => run(async () => onOpenTable((await api.createTable(seats)).id));

  const invite = () =>
    run(async () => {
      const { url } = await api.createInvite();
      const text = `${user.username} wants to play Crash with you`;
      if (navigator.share) await navigator.share({ title: 'Crash', text, url }).catch(() => {});
      else {
        await navigator.clipboard?.writeText(url);
        setToast('Invite link copied');
      }
    });

  const addFriend = () =>
    run(async () => {
      const { friend } = await api.addFriend(add.trim());
      setAdd('');
      setToast(`${friend.username} added`);
      await load();
    });

  return (
    <main className="page">
      <header className="page-head">
        <button type="button" className="icon-btn" onClick={onBack} aria-label="Back">
          ‹
        </button>
        <h1>Online</h1>
        <button type="button" className="btn link small" onClick={onLogout}>
          Log out
        </button>
      </header>
      <p className="hello">
        Signed in as <b>{user.username}</b>
      </p>

      <motion.section className="glass card-block" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        <h2>New table</h2>
        <p className="muted">Invite friends in; any empty seats are filled by computer players.</p>
        <div className="row2">
          <button type="button" className="btn gold" disabled={busy} onClick={() => create(4)}>
            4 players
          </button>
          <button type="button" className="btn ghost" disabled={busy} onClick={() => create(3)}>
            3 players
          </button>
        </div>
        <form
          className="join"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim().length === 6) onOpenTable(code.trim().toUpperCase());
          }}
        >
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={6} placeholder="TABLE CODE" aria-label="Table code" autoCapitalize="characters" />
          <button type="submit" className="btn ghost" disabled={code.trim().length !== 6}>
            Join
          </button>
        </form>
      </motion.section>

      {tables.length > 0 && (
        <section className="glass card-block">
          <h2>Your tables</h2>
          <ul className="table-list">
            {tables.map((t) => (
              <li key={t.id}>
                <span>
                  <b>Table {t.id}</b>
                  <small>
                    {t.status === 'playing' ? 'In play' : 'In the lobby'} · {t.people}/{t.seats} people · host {t.host}
                  </small>
                </span>
                <button type="button" className="btn gold small-btn" onClick={() => onOpenTable(t.id)}>
                  {t.status === 'playing' ? 'Rejoin' : 'Open'}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <motion.section className="glass card-block" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
        <div className="block-head">
          <h2>Friends</h2>
          <button type="button" className="btn link small" onClick={invite} disabled={busy}>
            Invite a friend
          </button>
        </div>
        <form
          className="join"
          onSubmit={(e) => {
            e.preventDefault();
            if (add.trim()) addFriend();
          }}
        >
          <input value={add} onChange={(e) => setAdd(e.target.value)} placeholder="Add by username" aria-label="Add friend by username" autoCapitalize="none" />
          <button type="submit" className="btn ghost" disabled={!add.trim() || busy}>
            Add
          </button>
        </form>
        {friends === null ? (
          <p className="muted">Loading…</p>
        ) : friends.length === 0 ? (
          <p className="muted">No friends yet. Send an invite link, or add someone by username.</p>
        ) : (
          <ul className="friends">
            {friends.map((f, i) => {
              const online = !!f.lastSeen && serverNow - f.lastSeen < ONLINE_MS;
              return (
                <motion.li key={f.id} className="friend-row" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}>
                  <button type="button" onClick={() => onOpenChat(f)}>
                    <span className="avatar big">{f.username[0].toUpperCase()}</span>
                    <span className="friend-text">
                      <b>
                        <i className={`presence${f.playingAt ? ' playing' : online ? ' on' : ''}`} aria-hidden="true" />
                        {f.username}
                      </b>
                      <small>{f.playingAt ? `Playing at table ${f.playingAt}` : online ? 'Online now' : (f.last ?? 'Say hello')}</small>
                    </span>
                    {f.unread > 0 && <span className="unread">{f.unread}</span>}
                  </button>
                  {f.playingAt && (
                    <button type="button" className="btn ghost small-btn watch-btn" onClick={() => onOpenTable(f.playingAt!)}>
                      Watch
                    </button>
                  )}
                </motion.li>
              );
            })}
          </ul>
        )}
      </motion.section>

      <section className="glass card-block">
        <div className="block-head">
          <h2>Leaderboard</h2>
          <button
            type="button"
            className="btn link small"
            onClick={() =>
              api
                .myStats()
                .then((r) => setStats(r.stats))
                .catch((e) => setError((e as Error).message))
            }
          >
            Your online record
          </button>
        </div>
        {board.length <= 1 ? (
          <p className="muted">Play friends online to get on the board. Games against friends count; wins rank first.</p>
        ) : (
          <ol className="board-list">
            {board.map((r) => (
              <li key={r.id} className={r.id === user.id ? 'me' : ''}>
                <b>{r.username}</b>
                <small>
                  {r.legs} legs · Crash {r.crashesWon}/{r.crashes}
                </small>
                <span>
                  <b>{r.wins}</b>
                  <small>/{r.games}</small>
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {error && <p className="form-error">{error}</p>}
      <AnimatePresence>
        {stats && <RecordSheet title="Online record" note="Every game you've played at a live table." tally={stats} onClose={() => setStats(null)} />}
      </AnimatePresence>
      <AnimatePresence>
        {toast && (
          <motion.div className="toast ok" initial={{ y: -40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -40, opacity: 0 }} onAnimationComplete={() => setTimeout(() => setToast(null), 1800)}>
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
