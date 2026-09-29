import { useState } from 'react';
import { motion } from 'motion/react';
import { api, type User } from '../../net/api.ts';

interface Props {
  note?: string;
  onDone: (user: User) => void;
  onBack: () => void;
}

export function Account({ note, onDone, onBack }: Props) {
  const [mode, setMode] = useState<'login' | 'register'>('register');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { user } = mode === 'login' ? await api.login(username, password) : await api.register(username, password);
      onDone(user);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="page">
      <header className="page-head">
        <button type="button" className="icon-btn" onClick={onBack} aria-label="Back">
          ‹
        </button>
        <h1>Play online</h1>
      </header>
      {note && <p className="note">{note}</p>}
      <motion.form className="glass setup" onSubmit={submit} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        <div className="seg">
          {(['register', 'login'] as const).map((k) => (
            <button key={k} type="button" className={mode === k ? 'on' : ''} onClick={() => setMode(k)}>
              <b>{k === 'register' ? 'Create account' : 'Log in'}</b>
              {mode === k && <motion.span layoutId="acct-pill" className="seg-pill" />}
            </button>
          ))}
        </div>
        <label className="field">
          <span>Username</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="3–20 letters, numbers or _"
            required
          />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            placeholder={mode === 'register' ? 'At least 8 characters' : ''}
            required
            minLength={mode === 'register' ? 8 : undefined}
          />
        </label>
        {error && <p className="form-error">{error}</p>}
        <button type="submit" className="btn gold big" disabled={busy}>
          {busy ? '…' : mode === 'login' ? 'Log in' : 'Create account'}
        </button>
      </motion.form>
    </main>
  );
}
