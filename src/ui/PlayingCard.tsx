import { motion } from 'motion/react';
import { SUIT_NAME, SUIT_SYMBOL, isRed, rankLabel, type Card } from '../engine/cards.ts';

export type CardSize = 'xs' | 'sm' | 'md' | 'lg';

interface Props {
  card?: Card | null;
  faceDown?: boolean;
  size?: CardSize;
  selected?: boolean;
  dim?: boolean;
  glow?: boolean;
  onClick?: () => void;
  /** Seconds before the flip animation plays. */
  flipDelay?: number;
  /** Enter animation: fly in from the deck. */
  dealDelay?: number;
  layoutId?: string;
}

const FACE: Record<number, string> = { 11: 'J', 12: 'Q', 13: 'K' };

export function PlayingCard({ card, faceDown, size = 'md', selected, dim, glow, onClick, flipDelay = 0, dealDelay, layoutId }: Props) {
  const label = card && !faceDown ? `${rankLabel(card.rank)} of ${SUIT_NAME[card.suit]}` : 'Face-down card';
  const cls = `pc pc-${size}${card && isRed(card) ? ' red' : ''}${selected ? ' selected' : ''}${dim ? ' dim' : ''}${glow ? ' glow' : ''}${onClick ? ' tappable' : ''}`;
  const Tag = onClick ? motion.button : motion.div;

  return (
    <Tag
      type={onClick ? 'button' : undefined}
      className={cls}
      onClick={onClick}
      aria-label={label}
      layout={layoutId ? true : undefined}
      layoutId={layoutId}
      initial={dealDelay !== undefined ? { opacity: 0, y: -160, x: 40, rotate: -18, scale: 0.6 } : false}
      animate={{ opacity: 1, y: selected ? -6 : 0, x: 0, rotate: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 380, damping: 30, delay: dealDelay ?? 0 }}
      whileTap={onClick ? { scale: 0.94 } : undefined}
    >
      <motion.span
        className="pc-inner"
        initial={false}
        animate={{ rotateY: faceDown || !card ? 180 : 0 }}
        transition={{ duration: 0.55, ease: [0.2, 0.8, 0.2, 1], delay: flipDelay }}
      >
        <span className="pc-face pc-front" aria-hidden="true">
          {card && (
            <>
              <span className="pc-corner tl">
                <b>{rankLabel(card.rank)}</b>
                <i>{SUIT_SYMBOL[card.suit]}</i>
              </span>
              <span className={`pc-center${FACE[card.rank] ? ' court' : ''}`}>
                {FACE[card.rank] ?? SUIT_SYMBOL[card.suit]}
              </span>
              <span className="pc-corner br">
                <b>{rankLabel(card.rank)}</b>
                <i>{SUIT_SYMBOL[card.suit]}</i>
              </span>
            </>
          )}
        </span>
        <span className="pc-face pc-back" aria-hidden="true" />
      </motion.span>
    </Tag>
  );
}

export function CardSlot({ size = 'md' }: { size?: CardSize }) {
  return <span className={`pc pc-${size} pc-empty`} aria-hidden="true" />;
}
