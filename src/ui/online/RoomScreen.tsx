import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useDragControls } from 'motion/react';
import { api, useRoom, type Friend, type User } from '../../net/api.ts';
import type { ChatLine } from '../../net/protocol.ts';
import { LENGTHS, SKILLS, currentBettor, type Match, type MatchLength, type Skill } from '../../engine/match.ts';
import { Game, progressLabel } from '../Game.tsx';
import { SEAT_COLORS } from '../SeatRail.tsx';
import { Seg } from '../Home.tsx';
import { sfx } from '../sound.ts';

/** Is this seat being waited on for a private decision? */
function myMove(m: Match | null, me: number | null): boolean {
  if (!m || me === null) return false;
  if (m.phase === 'arrange') return m.deal.active.includes(me) && !m.deal.submitted[me];
  return m.phase === 'betting' && currentBettor(m) === me;
}

interface Props {
  user: User;
  tableId: string;
  onLeave: () => void;
}

export function RoomScreen({ user, tableId, onLeave }: Props) {
  const { snap, error, connected, link, send, clearError } = useRoom(tableId);
  const [chatOpen, setChatOpen] = useState(false);
  const seenChat = useRef(0);
  const [unread, setUnread] = useState(0);
  const [peek, setPeek] = useState<ChatLine | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const chat = snap?.room.chat ?? [];
  const yourMove = myMove(snap?.match ?? null, snap?.me ?? null);

  // Tab title nudges you back when it's your move and the app is in the background.
  useEffect(() => {
    const base = 'Crash';
    const update = () => (document.title = yourMove && document.visibilityState === 'hidden' ? 'Your move · Crash' : base);
    update();
    document.addEventListener('visibilitychange', update);
    return () => {
      document.removeEventListener('visibilitychange', update);
      document.title = base;
    };
  }, [yourMove]);

  // Recent table talk shows on the speaker's seat for a few seconds.
  const lastAt = chat.at(-1)?.at ?? 0;
  useEffect(() => {
    const left = lastAt + 5000 - Date.now();
    if (left <= 0) return;
    setNow(Date.now());
    const t = setTimeout(() => setNow(Date.now()), left + 50);
    return () => clearTimeout(t);
  }, [lastAt]);
  const bubbles: Record<number, string> = {};
  for (const line of chat) {
    if (now - line.at > 5000) continue;
    const seat = snap?.match?.players.findIndex((p) => p.id === line.from) ?? -1;
    if (seat >= 0) bubbles[seat] = line.text;
  }
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
      sfx.message();
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
      {link === 'retrying' && <div className="conn-pill" role="status">Reconnecting…</div>}
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

  if (room.status === 'lobby' || !match) {
    return (
      <>
        <Lobby user={user} snap={snap} onStart={() => send({ t: 'start' })} onOptions={(options) => send({ t: 'options', options })} onLeave={() => {
          if (room.status === 'lobby') send({ t: 'leave' });
          onLeave();
        }} chatButton={chatButton} />
        {overlays}
      </>
    );
  }

  // Not seated: watch the game, cards hidden until they turn over.
  if (me === null) {
    return (
      <>
        <Game
          m={match}
          me={null}
          readOnly
          deadline={room.deadline}
          extra={chatButton}
          bubbles={bubbles}
          subtitle={`Table ${room.id} · ${progressLabel(match)}`}
          banner={<p className="watch-banner">Watching · {match.players.filter((p) => p.isHuman).map((p) => p.name).join(', ')}</p>}
          actions={{ lock: () => {}, bet: () => {}, crash: () => {}, next: () => {}, home: onLeave }}
          gameOverAction={
            <button type="button" className="btn ghost wide" onClick={onLeave}>
              Leave table
            </button>
          }
        />
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
        bubbles={bubbles}
        subtitle={`Table ${room.id} · ${progressLabel(match)}`}
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
  onOptions,
  onLeave,
  chatButton,
}: {
  user: User;
  snap: NonNullable<ReturnType<typeof useRoom>['snap']>;
  onStart: () => void;
  onOptions: (o: { length: MatchLength; skill: Skill }) => void;
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

      <section className="glass card-block lobby-options">
        <h2>Game</h2>
        {host ? (
          <>
            <Seg
              id="lobby-length"
              value={room.options.length}
              onChange={(length) => onOptions({ ...room.options, length })}
              options={(Object.keys(LENGTHS) as MatchLength[]).map((k) => ({ value: k, label: LENGTHS[k].name, hint: LENGTHS[k].blurb }))}
            />
            {room.members.length < room.seats && (
              <Seg
                id="lobby-skill"
                value={room.options.skill}
                onChange={(skill) => onOptions({ ...room.options, skill })}
                options={(Object.keys(SKILLS) as Skill[]).map((k) => ({ value: k, label: SKILLS[k].name, hint: 'computer' }))}
              />
            )}
          </>
        ) : (
          <p className="muted">
            {LENGTHS[room.options.length].name} game · {LENGTHS[room.options.length].blurb}
            {room.members.length < room.seats ? ` · ${SKILLS[room.options.skill].name} computer` : ''}
          </p>
        )}
        {room.watchers.length > 0 && <p className="muted">Watching: {room.watchers.map((w) => w.username).join(', ')}</p>}
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
  // Braces matter: newer browsers return a Promise from scrollIntoView, and an effect may only return a cleanup.
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines.length]);
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
