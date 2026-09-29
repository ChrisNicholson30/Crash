import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { api, type Friend, type User } from '../../net/api.ts';

interface Props {
  user: User;
  onBack: () => void;
  onOpenTable: (id: string) => void;
  onOpenChat: (friend: Friend) => void;
  onLogout: () => void;
}

export function Hub({ user, onBack, onOpenTable, onOpenChat, onLogout }: Props) {
  const [friends, setFriends] = useState<Friend[] | null>(null);
  const [code, setCode] = useState('');
  const [add, setAdd] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () =>
    api
      .friends()
      .then((r) => setFriends(r.friends))
      .catch((e) => setError((e as Error).message));

  useEffect(() => {
    load();
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
            {friends.map((f, i) => (
              <motion.li key={f.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}>
                <button type="button" onClick={() => onOpenChat(f)}>
                  <span className="avatar big">{f.username[0].toUpperCase()}</span>
                  <span className="friend-text">
                    <b>{f.username}</b>
                    <small>{f.last ?? 'Say hello'}</small>
                  </span>
                  {f.unread > 0 && <span className="unread">{f.unread}</span>}
                </button>
              </motion.li>
            ))}
          </ul>
        )}
      </motion.section>

      {error && <p className="form-error">{error}</p>}
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
