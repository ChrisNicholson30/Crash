import { SUIT_NAME, SUIT_SYMBOL, isRed, rankLabel, type Card } from '../engine/cards';

interface Props {
  card: Card;
  size?: 'md' | 'sm';
  selected?: boolean;
  onClick?: () => void;
}

export function CardView({ card, size = 'md', selected, onClick }: Props) {
  const label = `${rankLabel(card.rank)} of ${SUIT_NAME[card.suit]}`;
  const className = `card card-${size}${isRed(card) ? ' red' : ''}${selected ? ' selected' : ''}`;
  const face = (
    <>
      <span className="card-rank">{rankLabel(card.rank)}</span>
      <span className="card-suit">{SUIT_SYMBOL[card.suit]}</span>
    </>
  );
  return onClick ? (
    <button type="button" className={className} onClick={onClick} aria-label={label}>
      {face}
    </button>
  ) : (
    <span className={className} role="img" aria-label={label}>
      {face}
    </span>
  );
}

export function EmptySlot({ size = 'md' }: { size?: 'md' | 'sm' }) {
  return <span className={`card card-${size} card-empty`} aria-hidden="true" />;
}
