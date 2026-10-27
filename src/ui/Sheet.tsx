import type { ReactNode } from 'react';
import { motion, useDragControls } from 'motion/react';

/** Bottom sheet: tap outside or swipe down to close. */
export function Sheet({ label, className = '', onClose, children }: { label: string; className?: string; onClose: () => void; children: ReactNode }) {
  const dragControls = useDragControls();
  return (
    <motion.div className="sheet-wrap" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.section
        className={`sheet ${className}`}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 260, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
        drag="y"
        dragListener={false}
        dragControls={dragControls}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.7 }}
        onDragEnd={(_, info) => (info.offset.y > 100 || info.velocity.y > 500) && onClose()}
        role="dialog"
        aria-label={label}
      >
        <span className="grabber-zone" onPointerDown={(e) => dragControls.start(e)} aria-hidden="true">
          <span className="grabber" />
        </span>
        {children}
      </motion.section>
    </motion.div>
  );
}

/** A labelled on/off switch row. */
export function Toggle({ label, hint, on, onChange }: { label: string; hint?: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button type="button" className="toggle-row" role="switch" aria-checked={on} onClick={() => onChange(!on)}>
      <span className="toggle-text">
        <b>{label}</b>
        {hint && <small>{hint}</small>}
      </span>
      <span className={`switch${on ? ' on' : ''}`} aria-hidden="true">
        <i />
      </span>
    </button>
  );
}
