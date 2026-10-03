import { useEffect, useRef } from 'react';

/** Plain black table with a faint red glow. */
export function Backdrop() {
  return (
    <div className="felt" aria-hidden="true">
      <span className="glow g1" />
      <span className="glow g2" />
    </div>
  );
}

/** Full-screen notice for winning a leg, a set or the game. */
export function Celebration({
  kind,
  name,
  mine,
  detail,
  onDone,
}: {
  kind: 'leg' | 'set' | 'game';
  name: string;
  mine: boolean;
  detail: string;
  onDone: () => void;
}) {
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    navigator.vibrate?.(mine ? [30, 40, 30, 40, 120] : 40);
    const t = setTimeout(() => done.current(), kind === 'leg' ? 2600 : 4200);
    return () => clearTimeout(t);
  }, [kind, mine]);

  const title = kind === 'game' ? (mine ? 'CHAMPION' : 'GAME OVER') : kind === 'set' ? 'SET WON' : 'LEG WON';
  return (
    <div className={`celebrate-screen ${kind}${mine ? ' mine' : ''}`} onClick={onDone}>
      <h2 className="celebrate-title">{title}</h2>
      <p className="celebrate-name">{mine ? 'You did it!' : `${name} takes it`}</p>
      <small>{detail}</small>
    </div>
  );
}
