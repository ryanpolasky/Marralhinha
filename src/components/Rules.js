import React, { useEffect, useState } from 'react';
import { Credit } from './About';

export function RulesModal({ onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="panel modal" role="dialog" aria-label="How to play" onClick={(e) => e.stopPropagation()}>
        <h2>How to play</h2>
        <ul className="rules-list">
          <li>
            <b>Goal:</b> get all 5 of your marbles around the board and into your colored home column.
          </li>
          <li>
            <b>Teams:</b> with 4 players it's 2v2, with partners sitting opposite each other (Red + Yellow vs Blue + Green). With 2–3 players it's every player for themselves.
          </li>
          <li>
            <b>Leaving the dish:</b> roll a <b>1</b> or a <b>6</b> to put a marble on your start hole (the ring in your color).
          </li>
          <li>
            <b>Sixes:</b> rolling a 6 always gives you another roll.
          </li>
          <li>
            <b>Captures:</b> land on an opponent to send it back to its dish. You can't land on your own or your partner's marbles.
          </li>
          <li>
            <b>No overtaking:</b> your own marbles can't jump over each other. Everyone else's you can.
          </li>
          <li>
            <b>Shortcut:</b> from one of the three brass corners farthest from your home, a 1 or 6 jumps you into the center. From the center, a 1 or 6 takes you to the corner nearest your home. Anyone sitting in the center gets captured.
          </li>
          <li>
            <b>Home stretch:</b> you need the exact roll to move inside your home column.
          </li>
          <li>
            <b>Helping out:</b> once all 5 of yours are home, you keep rolling on your turns and move your partner's marbles instead.
          </li>
        </ul>
        <p className="muted">Tip: hover a glowing marble to preview where it will land. Drag to rotate the board and scroll to zoom.</p>
        <div className="row">
          <button className="btn primary" onClick={onClose}>
            Got it
          </button>
          <Credit />
        </div>
      </div>
    </div>
  );
}

export default function RulesButton({ className = 'btn ghost', children = 'How to play' }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={className} onClick={() => setOpen(true)} aria-label="How to play">
        {children}
      </button>
      {open && <RulesModal onClose={() => setOpen(false)} />}
    </>
  );
}
