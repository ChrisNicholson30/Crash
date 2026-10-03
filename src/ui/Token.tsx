
export function Coin({ size = 16 }: { size?: number }) {
  return (
    <span className="coin" style={{ width: size, height: size }} aria-hidden="true" />
  );
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
