import { useEffect, useRef, useState } from 'react';
import { animate } from 'motion/react';

export function Coin({ size = 16 }: { size?: number }) {
  return (
    <span className="coin" style={{ width: size, height: size, fontSize: size * 0.58 }} aria-hidden="true">
      B
    </span>
  );
}

/** Token amount that counts smoothly to its new value. */
export function Tokens({ value, size = 14, signed }: { value: number; size?: number; signed?: boolean }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const controls = animate(from.current, value, {
      duration: 0.9,
      ease: [0.2, 0.8, 0.2, 1],
      onUpdate: (v) => setShown(Math.round(v)),
    });
    from.current = value;
    return () => controls.stop();
  }, [value]);
  const text = `${signed && shown > 0 ? '+' : ''}${shown.toLocaleString('en-GB')}`;
  return (
    <span className={`tokens${value < 0 ? ' debt' : ''}`}>
      <Coin size={size} />
      <span className="tokens-num">{text}</span>
    </span>
  );
}
