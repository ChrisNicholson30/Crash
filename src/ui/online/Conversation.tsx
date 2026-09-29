import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { api, type DirectMessage, type User } from '../../net/api.ts';

interface Props {
  me: User;
  friend: User;
  onBack: () => void;
  onJoinTable: (id: string) => void;
}

export function Conversation({ me, friend, onBack, onJoinTable }: Props) {
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const lastId = useRef(0);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const { messages: fresh } = await api.messages(friend.id, lastId.current);
        if (!alive || !fresh.length) return;
        lastId.current = fresh[fresh.length - 1].id;
        setMessages((m) => [...m, ...fresh.filter((f) => !m.some((x) => x.id === f.id))]);
      } catch (e) {
        if (alive) setError((e as Error).message);
      }
    };
    poll();
    const t = setInterval(poll, 3000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [friend.id]);

  useEffect(() => end.current?.scrollIntoView({ behavior: 'smooth' }), [messages.length]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setText('');
    try {
      const { id } = await api.send(friend.id, body);
      setMessages((m) => [...m, { id, fromId: me.id, body, tableId: null, at: Date.now() }]);
      lastId.current = Math.max(lastId.current, id);
    } catch (err) {
      setError((err as Error).message);
      setText(body);
    }
  };

  return (
    <main className="page chat-page">
      <header className="page-head">
        <button type="button" className="icon-btn" onClick={onBack} aria-label="Back">
          ‹
        </button>
        <span className="avatar big">{friend.username[0].toUpperCase()}</span>
        <h1>{friend.username}</h1>
      </header>
      <div className="thread">
        {messages.length === 0 && <p className="muted center">No messages yet — say hello, or send a table invite from a lobby.</p>}
        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              className={`bubble${msg.fromId === me.id ? ' mine' : ''}`}
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
            >
              <p>{msg.body}</p>
              {msg.tableId && msg.fromId !== me.id && (
                <button type="button" className="btn gold small-btn" onClick={() => onJoinTable(msg.tableId!)}>
                  Join table {msg.tableId}
                </button>
              )}
              <time>{new Date(msg.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</time>
            </motion.div>
          ))}
        </AnimatePresence>
        <div ref={end} />
      </div>
      {error && <p className="form-error">{error}</p>}
      <form className="composer" onSubmit={send}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Message" maxLength={1000} aria-label="Message" />
        <button type="submit" className="btn gold" disabled={!text.trim()}>
          Send
        </button>
      </form>
    </main>
  );
}
