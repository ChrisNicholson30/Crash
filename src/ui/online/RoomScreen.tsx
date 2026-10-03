import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useDragControls } from 'motion/react';
import { api, useRoom, type Friend, type User } from '../../net/api.ts';
import type { ChatLine } from '../../net/protocol.ts';
import { Game } from '../Game.tsx';
import { SEAT_COLORS } from '../SeatRail.tsx';

interface Props {
  user: User;
  tableId: string;
  onLeave: () => void;
}

export function RoomScreen({ user, tableId, onLeave }: Props) {
  const { snap, error, connected, send, clearError } = useRoom(tableId);
  const [chatOpen, setChatOpen] = useState(false);
  const seenChat = useRef(0);
  const [unread, setUnread] = useState(0);
  const [peek, setPeek] = useState<ChatLine | null>(null);

  const chat = snap?.room.chat ?? [];
  useEffect(() => {
    const newest = chat.at(-1);
    if (!newest) return;
    if (chatOpen) {
      seenChat.current = newest.id;
      setUnread(0);
      return;
    }
    const fresh = chat.filter((c) => c.id > seenChat.current && c.from !== user.id);
    setUnread(fresh.length);
    const last = fresh.at(-1);
    if (last) {
      setPeek(last);
      const t = setTimeout(() => setPeek(null), 3500);
      return () => clearTimeout(t);
    }
  }, [chat.length, chatOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!snap) {
    return (
      <main className="page center-page">
        <div className="spinner" />
        <p className="muted">{error ?? (connected ? 'Joining…' : `Connecting to table ${tableId}…`)}</p>
        <button type="button" className="btn ghost" onClick={onLeave}>
          Back
        </button>
      </main>
    );
  }

  const { room, me, match } = snap;
  const chatButton = (
    <button type="button" className="icon-btn chat-btn" aria-label="Table chat" onClick={() => setChatOpen(true)}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 5h16v11H9l-5 4z" />
      </svg>
      {unread > 0 && <span className="unread dot">{unread}</span>}
    </button>
  );

  const overlays = (
    <>
      <AnimatePresence>
        {peek && !chatOpen && (
          <motion.button
            type="button"
            className="chat-peek"
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10 }}
            onClick={() => setChatOpen(true)}
          >
            <b>{peek.name}</b> {peek.text}
          </motion.button>
        )}
      </AnimatePresence>
      <AnimatePresence>{chatOpen && <ChatSheet lines={chat} me={user.id} onSend={(text) => send({ t: 'chat', text })} onClose={() => setChatOpen(false)} />}</AnimatePresence>
      <AnimatePresence>
        {error && (
          <motion.div className="toast" role="alert" initial={{ y: -40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -40, opacity: 0 }} onClick={clearError}>
            {error}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );

  if (room.status === 'lobby' || !match || me === null) {
    return (
      <>
        <Lobby user={user} snap={snap} onStart={() => send({ t: 'start' })} onLeave={() => {
          if (room.status === 'lobby') send({ t: 'leave' });
          onLeave();
        }} chatButton={chatButton} />
        {overlays}
      </>
    );
  }

  const ready = room.ready.length;
  const people = match.players.filter((p) => p.isHuman && p.id && room.online.includes(p.id)).length;
  const iAmReady = room.ready.includes(user.id);
  const nextLabel = iAmReady ? `Waiting for others (${ready}/${people})` : people > 1 ? `Ready (${ready}/${people})` : undefined;

  return (
    <>
      <Game
        m={match}
        me={me}
        deadline={room.deadline}
        nextLabel={nextLabel}
        extra={chatButton}
        subtitle={`Table ${room.id} · Set ${Math.min(match.setNumber, 3)} · Leg ${match.legNumber}`}
        actions={{
          lock: (arrangement) => send({ t: 'arrange', arrangement }),
          bet: (amount) => send({ t: 'bet', amount }),
          crash: (amount) => send({ t: 'crash', amount }),
          next: () => !iAmReady && send({ t: 'next' }),
          home: () => (match.phase === 'gameOver' || confirm('Leave the table? The computer plays for you until you come back.') ? onLeave() : undefined),
        }}
        gameOverAction={
          room.host.id === user.id ? (
            <div className="row2">
              <button type="button" className="btn gold" onClick={() => send({ t: 'rematch' })}>
                Rematch
              </button>
              <button type="button" className="btn ghost" onClick={onLeave}>
                Leave
              </button>
            </div>
          ) : (
            <button type="button" className="btn ghost wide" onClick={onLeave}>
              Leave table
            </button>
          )
        }
      />
      {overlays}
    </>
  );
}

function Lobby({
  user,
  snap,
  onStart,
  onLeave,
  chatButton,
}: {
  user: User;
  snap: NonNullable<ReturnType<typeof useRoom>['snap']>;
  onStart: () => void;
  onLeave: () => void;
  chatButton: React.ReactNode;
}) {
  const { room } = snap;
  const [friends, setFriends] = useState<Friend[]>([]);
  const [sent, setSent] = useState<string[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const host = room.host.id === user.id;

  useEffect(() => {
    api.friends().then((r) => setFriends(r.friends)).catch(() => {});
  }, []);

  const inviteFriend = async (f: Friend) => {
    await api.send(f.id, `Join my Crash table: ${room.id}`, room.id);
    setSent((s) => [...s, f.id]);
  };
  const shareLink = async () => {
    const { url } = await api.createInvite(room.id);
    if (navigator.share) await navigator.share({ title: 'Crash', text: `Join my Crash table (${room.id})`, url }).catch(() => {});
    else {
      await navigator.clipboard?.writeText(url);
      setNote('Link copied');
    }
  };

  const seats = Array.from({ length: room.seats }, (_, i) => room.members[i] ?? null);

  return (
    <main className="page">
      <header className="page-head">
        <button type="button" className="icon-btn" onClick={onLeave} aria-label="Leave">
          ‹
        </button>
        <h1>Table</h1>
        {chatButton}
      </header>

      <motion.div className="table-code" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
        <small>Pairing code</small>
        <b aria-label={`Table code ${room.id.split('').join(' ')}`}>
          {room.id.split('').map((ch, i) => (
            <motion.span key={i} initial={{ y: -14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.15 + i * 0.05 }}>
              {ch}
            </motion.span>
          ))}
        </b>
        <div className="code-actions">
          <button
            type="button"
            className="btn ghost small-btn"
            onClick={async () => {
              await navigator.clipboard?.writeText(room.id).catch(() => {});
              setNote('Code copied — friends enter it under “Join”');
            }}
          >
            Copy code
          </button>
          <button type="button" className="btn gold small-btn" onClick={shareLink}>
            Share invite link
          </button>
        </div>
        <small className="code-help">Friends open the link, sign in, and land in this seat list.</small>
      </motion.div>

      <section className="lobby-seats">
        {seats.map((m, i) => (
          <motion.div
            key={i}
            className={`lobby-seat${m ? ' filled' : ''}`}
            style={{ ['--seat' as string]: SEAT_COLORS[i] }}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
          >
            <span className="avatar big">{m ? m.username[0].toUpperCase() : '?'}</span>
            <b>{m ? (m.id === user.id ? `${m.username} (you)` : m.username) : 'Open seat'}</b>
            <small>
              {m ? (m.id === room.host.id ? 'Host' : room.online.includes(m.id) ? 'Here' : 'Away') : 'Computer if nobody joins'}
            </small>
          </motion.div>
        ))}
      </section>

      <section className="glass card-block">
        <div className="block-head">
          <h2>Invite</h2>
          <button type="button" className="btn link small" onClick={shareLink}>
            Share link
          </button>
        </div>
        {friends.length === 0 ? (
          <p className="muted">Share the link or the code. Friends you add show up here.</p>
        ) : (
          <ul className="friends compact">
            {friends.map((f) => (
              <li key={f.id}>
                <span className="avatar">{f.username[0].toUpperCase()}</span>
                <b>{f.username}</b>
                <button type="button" className="btn ghost small-btn" disabled={sent.includes(f.id) || room.members.some((m) => m.id === f.id)} onClick={() => inviteFriend(f)}>
                  {room.members.some((m) => m.id === f.id) ? 'Seated' : sent.includes(f.id) ? 'Invited' : 'Invite'}
                </button>
              </li>
            ))}
          </ul>
        )}
        {note && <p className="muted">{note}</p>}
      </section>

      <footer className="dock">
        {host ? (
          <button type="button" className="btn gold wide" onClick={onStart}>
            Deal — {room.seats - room.members.length > 0 ? `${room.seats - room.members.length} computer player${room.seats - room.members.length > 1 ? 's' : ''} join` : 'full table'}
          </button>
        ) : (
          <p className="dock-note waiting">Waiting for {room.host.username} to deal…</p>
        )}
      </footer>
    </main>
  );
}

function ChatSheet({ lines, me, onSend, onClose }: { lines: ChatLine[]; me: string; onSend: (t: string) => void; onClose: () => void }) {
  const [text, setText] = useState('');
  const dragControls = useDragControls();
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ behavior: 'smooth' }), [lines.length]);
  const quick = ['Nice hand!', 'CRASH incoming', 'Gg', 'No way!', 'Unlucky'];
  const submit = (t: string) => {
    if (!t.trim()) return;
    onSend(t.trim());
    setText('');
  };
  return (
    <motion.div className="sheet-wrap" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.section
        className="sheet chat-sheet"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 280, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
        drag="y"
        dragListener={false}
        dragControls={dragControls}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.7 }}
        onDragEnd={(_, info) => (info.offset.y > 100 || info.velocity.y > 500) && onClose()}
        role="dialog"
        aria-label="Table chat"
      >
        <span className="grabber-zone" onPointerDown={(e) => dragControls.start(e)} aria-hidden="true">
          <span className="grabber" />
        </span>
        <h2>Table chat</h2>
        <div className="thread">
          {lines.length === 0 && <p className="muted center">Say something to the table.</p>}
          {lines.map((l) => (
            <motion.div key={l.id} className={`bubble${l.from === me ? ' mine' : ''}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              {l.from !== me && <b className="bubble-name">{l.name}</b>}
              <p>{l.text}</p>
            </motion.div>
          ))}
          <div ref={end} />
        </div>
        <div className="quick">
          {quick.map((q) => (
            <button key={q} type="button" className="chip-btn" onClick={() => submit(q)}>
              {q}
            </button>
          ))}
        </div>
        <form
          className="composer"
          onSubmit={(e) => {
            e.preventDefault();
            submit(text);
          }}
        >
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Message the table" maxLength={300} aria-label="Chat message" />
          <button type="submit" className="btn gold" disabled={!text.trim()}>
            Send
          </button>
        </form>
      </motion.section>
    </motion.div>
  );
}
