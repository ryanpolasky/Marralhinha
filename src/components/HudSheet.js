import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const CLOSE_DRAG = 70;

export default function HudSheet({ open, onClose, label = 'Game menu', children }) {
  const [drag, setDrag] = useState(0);
  const start = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape' || document.querySelectorAll('[role="dialog"], [role="alertdialog"]').length > 1) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => setDrag(0), [open]);

  if (!open) return null;
  const grab = {
    onPointerDown: (e) => {
      start.current = e.clientY;
      e.currentTarget.setPointerCapture?.(e.pointerId);
    },
    onPointerMove: (e) => start.current !== null && setDrag(Math.max(0, e.clientY - start.current)),
    onPointerUp: () => {
      if (start.current === null) return;
      start.current = null;
      if (drag > CLOSE_DRAG) onClose();
      else setDrag(0);
    },
    onPointerCancel: () => {
      start.current = null;
      setDrag(0);
    },
  };
  return createPortal(
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label={label} onClick={(e) => e.stopPropagation()} style={drag ? { transform: `translateY(${drag}px)`, transition: 'none' } : undefined}>
        <div className="sheet-grab" {...grab}>
          <span />
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>,
    document.body
  );
}
