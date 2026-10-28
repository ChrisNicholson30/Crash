import { useEffect, useRef, useState } from 'react';
import { getSettings } from './settings.ts';

/** A casino chip, for token amounts. */
export function Coin({ size = 16 }: { size?: number }) {
  return <span className="coin" style={{ width: size, height: size }} aria-hidden="true" />;
}

export function Tokens({ value, size = 14, signed }: { value: number; size?: number; signed?: boolean }) {
  const text = `${signed && value > 0 ? '+' : ''}${value.toLocaleString('en-GB')}`;
  return (
    <span className={`tokens${value < 0 ? ' debt' : ''}`}>
      <Coin size={size} />
      <span className="tokens-num">{text}</span>
    </span>
  );
}

const CHIP_COLOURS = ['red', 'black', 'silver', 'red', 'black', 'silver', 'red'];

/** A stack of chips that grows with the amount (one chip per doubling past 100, up to seven). */
export function ChipStack({ amount, size = 30 }: { amount: number; size?: number }) {
  const n = amount <= 0 ? 0 : Math.min(7, 1 + Math.floor(Math.log2(Math.max(1, amount / 100))));
  return (
    <span className="chip-stack" style={{ width: size, height: size + 6 * 3 }} aria-hidden="true">
      {n === 0 && <span className="stack-chip ghost" style={{ width: size, height: size, bottom: 0 }} />}
      {CHIP_COLOURS.slice(0, n).map((c, i) => (
        <span key={i} className={`stack-chip ${c}`} style={{ width: size, height: size, bottom: i * 3 }} />
      ))}
    </span>
  );
}

const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** A number that counts up (or down) to its new value. */
export function Count({ value, ms = 600 }: { value: number; ms?: number }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = from.current;
    if (start === value || !getSettings().motion || reduced()) {
      from.current = value;
      setShown(value);
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      const eased = 1 - (1 - k) ** 3;
      const v = Math.round(start + (value - start) * eased);
      from.current = v;
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return <>{shown.toLocaleString('en-GB')}</>;
}
