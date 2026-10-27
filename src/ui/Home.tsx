import { useState } from 'react';
import { motion } from 'motion/react';
import { LENGTHS, SKILLS, type MatchLength, type MatchOptions, type Skill } from '../engine/match.ts';
import { promptInstall, useInstall } from './pwa.ts';

export interface Setup {
  players: 3 | 4;
  /** People at this device, in seat order. One for a game against the computer. */
  names: string[];
  options: MatchOptions;
}

interface Props {
  user: { username: string } | null;
  unread: number;
  onOnline: () => void;
  canResume: boolean;
  onResume: () => void;
  onStart: (setup: Setup) => void;
  onRules: () => void;
  onRecord: () => void;
  onSettings: () => void;
  onInstallHelp: () => void;
}

type Mode = 'solo' | 'pass';

interface Prefs {
  mode: Mode;
  players: 3 | 4;
  length: MatchLength;
  skill: Skill;
  name: string;
  /** Pass-and-play names. */
  people: string[];
  peopleCount: number;
}

const PREFS_KEY = 'crash:prefs';

function loadPrefs(): Prefs {
  let name = '';
  try {
    name = localStorage.getItem('crash:name') ?? '';
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? 'null') as Partial<Prefs> | null;
    if (p) return { ...defaults(name), ...p };
  } catch {
    /* storage unavailable */
  }
  return defaults(name);
}

function defaults(name: string): Prefs {
  return { mode: 'solo', players: 4, length: 'full', skill: 'normal', name, people: [name, '', '', ''], peopleCount: 2 };
}

function savePrefs(p: Prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
    localStorage.setItem('crash:name', p.name);
  } catch {
    /* storage unavailable */
  }
}

function Seg<T extends string | number>({
  id,
  value,
  options,
  onChange,
}: {
  id: string;
  value: T;
  options: { value: T; label: string; hint?: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className={`seg${options.length === 3 ? ' three' : ''}`} role="radiogroup">
      {options.map((o) => (
        <button key={String(o.value)} type="button" role="radio" className={value === o.value ? 'on' : ''} aria-checked={value === o.value} onClick={() => onChange(o.value)}>
          <b>{o.label}</b>
          {o.hint && <small>{o.hint}</small>}
          {value === o.value && <motion.span layoutId={`${id}-pill`} className="seg-pill" />}
        </button>
      ))}
    </div>
  );
}

export function Home({ user, unread, onOnline, canResume, onResume, onStart, onRules, onRecord, onSettings, onInstallHelp }: Props) {
  const [p, setP] = useState<Prefs>(loadPrefs);
  const install = useInstall();
  const set = (patch: Partial<Prefs>) => setP((x) => ({ ...x, ...patch }));
  const pass = p.mode === 'pass';
  const peopleCount = Math.min(p.peopleCount, p.players);
  const bots = pass ? p.players - peopleCount : p.players - 1;

  const start = () => {
    const name = p.name.trim() || 'You';
    const names = pass
      ? Array.from({ length: peopleCount }, (_, i) => p.people[i]?.trim() || `Player ${i + 1}`)
      : [name];
    // Two people can't share a name: the hand-over screen goes by name.
    const unique = names.map((n, i) => (names.indexOf(n) === i ? n : `${n} ${i + 1}`));
    savePrefs({ ...p, name: p.name.trim() });
    onStart({ players: p.players, names: unique, options: { length: p.length, skill: p.skill } });
  };

  return (
    <main className="home">
      <img className="hero-card" src="/card-back.webp" alt="" width={168} height={252} />

      <h1 className="wordmark">CRASH</h1>
      <p className="tagline">Thirteen-card brag. Build your hands, back them with tokens, and call the Crash.</p>

      <section className="glass setup">
        <Seg
          id="mode"
          value={p.mode}
          onChange={(mode) => set({ mode })}
          options={[
            { value: 'solo', label: 'vs Computer', hint: 'Just you' },
            { value: 'pass', label: 'Pass & play', hint: 'Share one phone' },
          ]}
        />

        {pass ? (
          <div className="field">
            <span>People at this phone</span>
            <Seg
              id="people"
              value={peopleCount}
              onChange={(peopleCount) => set({ peopleCount })}
              options={[2, 3, 4].filter((n) => n <= p.players).map((n) => ({ value: n, label: `${n}` }))}
            />
            <div className="names">
              {Array.from({ length: peopleCount }, (_, i) => (
                <input
                  key={i}
                  value={p.people[i] ?? ''}
                  placeholder={`Player ${i + 1}`}
                  maxLength={12}
                  aria-label={`Player ${i + 1} name`}
                  onChange={(e) => {
                    const people = [...p.people];
                    people[i] = e.target.value;
                    set({ people });
                  }}
                />
              ))}
            </div>
          </div>
        ) : (
          <label className="field">
            <span>Your name</span>
            <input value={p.name} placeholder="You" maxLength={12} onChange={(e) => set({ name: e.target.value })} />
          </label>
        )}

        <div className="field">
          <span>Table</span>
          <Seg
            id="table"
            value={p.players}
            onChange={(players) => set({ players })}
            options={[
              { value: 3, label: '3 players', hint: '17 cards · 5 hands' },
              { value: 4, label: '4 players', hint: '13 cards · 4 hands' },
            ]}
          />
        </div>

        <div className="field">
          <span>Game length</span>
          <Seg
            id="length"
            value={p.length}
            onChange={(length) => set({ length })}
            options={(Object.keys(LENGTHS) as MatchLength[]).map((k) => ({ value: k, label: LENGTHS[k].name, hint: LENGTHS[k].blurb }))}
          />
        </div>

        {bots > 0 && (
          <div className="field">
            <span>
              Computer {bots > 1 ? `players (${bots})` : 'player'}
            </span>
            <Seg
              id="skill"
              value={p.skill}
              onChange={(skill) => set({ skill })}
              options={(Object.keys(SKILLS) as Skill[]).map((k) => ({ value: k, label: SKILLS[k].name }))}
            />
            <small className="field-hint">{SKILLS[p.skill].blurb}</small>
          </div>
        )}

        <p className="facts-line">
          <b>10</b> points a leg · <b>10k</b> tokens each · a failed Crash costs <b>½</b> its stake
        </p>

        <button type="button" className="btn gold big" onClick={start}>
          {pass ? `Deal for ${peopleCount}` : 'Play the computer'}
        </button>
        <button type="button" className="btn online big" onClick={onOnline}>
          <span>Play friends online</span>
          {user ? <small>as {user.username}</small> : <small>log in or sign up</small>}
          {unread > 0 && <span className="unread">{unread}</span>}
        </button>
        {canResume && (
          <button type="button" className="btn ghost" onClick={onResume}>
            Resume game
          </button>
        )}
        <nav className="home-links">
          <button type="button" className="btn link" onClick={onRules}>
            How to play
          </button>
          <button type="button" className="btn link" onClick={onRecord}>
            Your record
          </button>
          <button type="button" className="btn link" onClick={onSettings}>
            Settings
          </button>
          {install && (
            <button type="button" className="btn link" onClick={install === 'prompt' ? () => void promptInstall() : onInstallHelp}>
              Install app
            </button>
          )}
        </nav>
      </section>
    </main>
  );
}
