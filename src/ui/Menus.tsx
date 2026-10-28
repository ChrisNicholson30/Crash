import { CATEGORY_NAME, displayOrder, evaluate } from '../engine/hands.ts';
import { LENGTHS, SKILLS, type Match } from '../engine/match.ts';
import type { Tally } from '../engine/tally.ts';
import { PlayingCard } from './PlayingCard.tsx';
import { Sheet, Toggle } from './Sheet.tsx';
import { setSettings, useSettings } from './settings.ts';
import { sfx } from './sound.ts';

/** Sound, vibration and odds switches, shared by the home and table menus. */
function SettingToggles() {
  const s = useSettings();
  return (
    <div className="toggles">
      <Toggle
        label="Sound"
        hint="Cards, chips and Crash calls"
        on={s.sound}
        onChange={(sound) => {
          setSettings({ sound });
          if (sound) sfx.tap();
        }}
      />
      <Toggle label="Vibration" hint="Your turn, Crash calls, wins" on={s.haptics} onChange={(haptics) => setSettings({ haptics })} />
      <Toggle label="Hand odds" hint="Win chances while you build and bet" on={s.odds} onChange={(odds) => setSettings({ odds })} />
      <Toggle label="Motion" hint="Cards deal and flip, chips slide" on={s.motion} onChange={(motion) => setSettings({ motion })} />
    </div>
  );
}

export function SettingsSheet({ onClose }: { onClose: () => void }) {
  return (
    <Sheet label="Settings" className="menu-sheet" onClose={onClose}>
      <h2>Settings</h2>
      <SettingToggles />
      <button type="button" className="btn gold wide" onClick={onClose}>
        Done
      </button>
    </Sheet>
  );
}

export function TableMenu({ m, onRules, onLeave, onClose }: { m: Match; onRules: () => void; onLeave: () => void; onClose: () => void }) {
  const length = LENGTHS[m.options?.length ?? 'full'];
  const bots = m.players.some((p) => !p.isHuman);
  return (
    <Sheet label="Table menu" className="menu-sheet" onClose={onClose}>
      <h2>Table</h2>
      <p className="sub">
        {length.name} game · {length.blurb}
        {bots ? ` · ${SKILLS[m.options?.skill ?? 'normal'].name} computer` : ''}
      </p>
      <SettingToggles />
      <div className="row2">
        <button type="button" className="btn ghost" onClick={onRules}>
          How to play
        </button>
        <button type="button" className="btn ghost" onClick={onLeave}>
          Leave table
        </button>
      </div>
    </Sheet>
  );
}

export function RecordSheet({ title, tally, note, onReset, onClose }: { title: string; tally: Tally; note?: string; onReset?: () => void; onClose: () => void }) {
  return (
    <Sheet label={title} className="menu-sheet" onClose={onClose}>
      <h2>{title}</h2>
      {note && <p className="sub">{note}</p>}
      <RecordTiles tally={tally} />
      <div className={onReset ? 'row2' : ''}>
        {onReset && (
          <button
            type="button"
            className="btn ghost"
            onClick={() => confirm('Clear your record on this device?') && onReset()}
          >
            Reset
          </button>
        )}
        <button type="button" className={`btn gold${onReset ? '' : ' wide'}`} onClick={onClose}>
          Done
        </button>
      </div>
    </Sheet>
  );
}

const share = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '—');

export function RecordTiles({ tally: t }: { tally: Tally }) {
  const best = t.best ? evaluate(t.best) : null;
  return (
    <>
      <ul className="record">
        <li>
          <b>{t.games}</b>
          <small>games</small>
        </li>
        <li>
          <b>{t.wins}</b>
          <small>wins · {share(t.wins, t.games)}</small>
        </li>
        <li>
          <b>{t.bestStreak}</b>
          <small>best streak{t.streak > 1 ? ` · on ${t.streak}` : ''}</small>
        </li>
        <li>
          <b>{t.legs}</b>
          <small>legs won</small>
        </li>
        <li>
          <b>
            {t.crashesWon}/{t.crashes}
          </b>
          <small>Crashes landed</small>
        </li>
        <li>
          <b>{t.deals ? (t.points / t.deals).toFixed(1) : '—'}</b>
          <small>points a deal</small>
        </li>
        <li>
          <b>{t.pots}</b>
          <small>pots taken</small>
        </li>
        <li>
          <b>{t.deals}</b>
          <small>deals played</small>
        </li>
        <li>
          <b>{t.sets}</b>
          <small>sets won</small>
        </li>
      </ul>
      <div className="best-hand">
        <span>
          <small>Best hand</small>
          <b>{best ? CATEGORY_NAME[best.category] : 'None yet'}</b>
        </span>
        {t.best && (
          <span className="rank-cards">
            {displayOrder(t.best).map((c, i) => (
              <PlayingCard key={i} card={c} size="xs" />
            ))}
          </span>
        )}
      </div>
    </>
  );
}

/** How to add the app on an iPhone or iPad, where browsers can't offer an install button. */
export function InstallSheet({ onClose }: { onClose: () => void }) {
  return (
    <Sheet label="Install Crash" className="menu-sheet" onClose={onClose}>
      <h2>Install Crash</h2>
      <p className="sub">Put Crash on your home screen. It opens full screen and plays the computer offline.</p>
      <ol className="steps">
        <li>
          Tap <b>Share</b> in Safari’s toolbar (the square with an arrow).
        </li>
        <li>
          Choose <b>Add to Home Screen</b>.
        </li>
        <li>
          Tap <b>Add</b>.
        </li>
      </ol>
      <button type="button" className="btn gold wide" onClick={onClose}>
        Got it
      </button>
    </Sheet>
  );
}
