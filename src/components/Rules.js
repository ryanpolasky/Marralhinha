import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Credit } from './About';
import { RING, HOME, BASE, SEAT_COLORS, BASE_TRAY } from '../game/geometry';
import { Arrow, BoardArt, Die, Label, Marble, Mark, Ring, RowArt, Trail, rowAt } from './TutorialArt';

const RED = SEAT_COLORS[0];
const redPath = [...Array.from({ length: 62 }, (_, i) => RING[i + 2]), RING[0], ...HOME[0]];

const SLIDES = [
  {
    title: 'The goal',
    text: 'Race all 5 of your marbles around the board and into your colored home column. The first player with all 5 home wins.',
    art: (id) => (
      <BoardArt id={id} baseMarbles={{ 0: 4, 1: 5, 2: 5, 3: 5 }}>
        <Trail points={redPath.filter((_, i) => i % 2 === 0 || i === redPath.length - 1)} color={RED.light} />
        <Marble id={id} seat={0} at={RING[2]} />
      </BoardArt>
    ),
  },
  {
    title: 'Leaving your dish',
    text: 'Roll a 1 or a 6 to move a marble out of your dish and onto your start hole, the ring in your color.',
    art: (id) => (
      <BoardArt id={id} view="-0.6 -0.2 11 10.6" baseMarbles={{ 0: 4 }}>
        <Arrow from={BASE[0][4]} to={RING[2]} bend={1.2} color={RED.light} width={0.2} />
        <Marble id={id} seat={0} at={BASE[0][4]} r={0.36} />
        <Marble id={id} seat={0} at={RING[2]} ghost />
        <Die at={[1.4, 6.3]} value={1} size={1.7} mark="yes" />
        <Die at={[1.4, 8.8]} value={6} size={1.7} mark="yes" />
      </BoardArt>
    ),
  },
  {
    title: 'Sixes roll again',
    text: 'Roll a 6 and you get another roll once you have moved, even if nothing could move.',
    art: () => (
      <svg className="tutorial-art" viewBox="-5 -3 10 6" role="img" aria-hidden="true">
        <Die at={[0, -2.4]} value={6} size={2.4} />
        <Arrow from={[-1.2, -0.9]} to={[-1.2, 0.9]} bend={-1.4} color="#ffd166" width={0.18} />
        <Arrow from={[1.2, 0.9]} to={[1.2, -0.9]} bend={-1.4} color="#ffd166" width={0.18} />
        <Label at={[0, 0]} color="#ffd166" size={0.8}>
          again!
        </Label>
        <Die at={[0, 2.4]} value={4} size={2.4} />
      </svg>
    ),
  },
  {
    title: 'Capture!',
    text: "Land exactly on an opponent's marble to knock it all the way back to its dish.",
    art: (id) => (
      <RowArt id={id} holes={6} height={5} extra={2.6}>
        <Arrow from={rowAt(1, -0.5)} to={rowAt(4, -0.55)} bend={-1.3} color={RED.light} width={0.14} />
        <Marble id={id} seat={0} at={rowAt(1)} />
        <Marble id={id} seat={1} at={rowAt(4)} />
        <Arrow from={rowAt(4, 0.5)} to={[2.1, 6.6]} bend={-0.8} color={SEAT_COLORS[1].light} width={0.12} dashed />
        <Label at={[2.1, 3.3]} size={0.55} color={SEAT_COLORS[1].light}>
          back to its dish!
        </Label>
        <Die at={rowAt(6.6)} value={3} size={1.7} />
      </RowArt>
    ),
  },
  {
    title: 'No overtaking',
    text: "Your own marbles can't jump over each other, but you can hop right past anyone else's.",
    art: (id) => (
      <div className="tutorial-stack">
        <RowArt id={`${id}a`} holes={6} height={3.2} extra={1.6}>
          <Arrow from={rowAt(0, -0.5)} to={rowAt(4, -0.55)} bend={-1.1} color="#ff8a8a" width={0.12} dashed />
          <Marble id={`${id}a`} seat={0} at={rowAt(0)} />
          <Marble id={`${id}a`} seat={0} at={rowAt(2)} />
          <Mark at={rowAt(6.1)} ok={false} size={1.1} />
        </RowArt>
        <RowArt id={`${id}b`} holes={6} height={3.2} extra={1.6}>
          <Arrow from={rowAt(0, -0.5)} to={rowAt(4, -0.55)} bend={-1.1} color={RED.light} width={0.12} />
          <Marble id={`${id}b`} seat={0} at={rowAt(0)} />
          <Marble id={`${id}b`} seat={3} at={rowAt(2)} />
          <Marble id={`${id}b`} seat={0} at={rowAt(4)} ghost />
          <Mark at={rowAt(6.1)} ok size={1.1} />
        </RowArt>
      </div>
    ),
  },
  {
    title: 'The shortcut',
    text: 'On any brass corner except the last one before your home, a 1 or 6 jumps you into the center. From the center, another 1 or 6 drops you on that last corner, right by your home.',
    art: (id) => (
      <BoardArt id={id} baseMarbles={{ 0: 3, 1: 5, 2: 5, 3: 5 }}>
        {[8, 24, 40].map((i) => (
          <Ring key={i} at={RING[i]} r={0.82} width={0.14} color="#ffd166" />
        ))}
        <Ring at={RING[56]} r={0.82} width={0.14} color={RED.light} />
        <Arrow from={RING[24]} to={[-0.35, 0.35]} bend={-0.6} color="#ffd166" width={0.2} />
        <Arrow from={[0.35, -0.35]} to={RING[56]} bend={-0.6} color={RED.light} width={0.2} />
        <Marble id={id} seat={0} at={RING[24]} />
        <Marble id={id} seat={0} at={RING[56]} ghost />
        <Label at={[-3.5, 3.9]} size={1} color="#ffd166">
          1 or 6
        </Label>
      </BoardArt>
    ),
  },
  {
    title: 'The home stretch',
    text: "Inside your home column you need the exact roll to move. No overshooting, and no jumping your own marbles either.",
    art: (id) => (
      <RowArt id={id} holes={5} height={4.4} extra={3.6}>
        <rect x="-0.55" y="-0.52" width={4 * 1.3 + 1.1} height="1.04" rx="0.45" fill={RED.main} opacity="0.9" />
        {[0, 1, 2, 3, 4].map((i) => (
          <circle key={i} cx={i * 1.3} cy="0" r="0.36" fill={`url(#${id}-hole)`} />
        ))}
        <Arrow from={rowAt(1, -0.5)} to={rowAt(3, -0.55)} bend={-0.9} color={RED.light} width={0.13} />
        <Marble id={id} seat={0} at={rowAt(1)} />
        <Marble id={id} seat={0} at={rowAt(3)} ghost />
        <Die at={rowAt(6.2, -0.85)} value={2} size={1.3} mark="yes" />
        <Die at={rowAt(6.2, 0.95)} value={4} size={1.3} mark="no" />
      </RowArt>
    ),
  },
  {
    title: 'Teams (optional)',
    text: "With 4 players the host can switch on teams. Partners sit across from each other and can't capture each other, and once your marbles are home you move your partner's.",
    art: (id) => (
      <BoardArt id={id} baseMarbles={{ 0: 5, 1: 5, 2: 5, 3: 5 }}>
        <line x1={BASE_TRAY[0][1]} y1={BASE_TRAY[0][0]} x2={BASE_TRAY[2][1]} y2={BASE_TRAY[2][0]} stroke="#ffd166" strokeWidth="0.22" strokeDasharray="0.5 0.35" opacity="0.9" />
        <line x1={BASE_TRAY[1][1]} y1={BASE_TRAY[1][0]} x2={BASE_TRAY[3][1]} y2={BASE_TRAY[3][0]} stroke="#8cc2ff" strokeWidth="0.22" strokeDasharray="0.5 0.35" opacity="0.9" />
        {[0, 1, 2, 3].map((s) => (
          <Label key={s} at={[BASE_TRAY[s][0] + (BASE_TRAY[s][0] > 0 ? 2.9 : -2.9), BASE_TRAY[s][1]]} size={0.85} color={s % 2 ? '#8cc2ff' : '#ffd166'}>
            {s % 2 ? 'Team B' : 'Team A'}
          </Label>
        ))}
      </BoardArt>
    ),
  },
  {
    title: 'Handy tips',
    text: 'Tap a glowing marble to see where it would land. If it has two options, both show up for you to pick. Drag to spin the board, scroll to zoom, and use the chat to trash talk.',
    art: (id) => (
      <BoardArt id={id} view="-2.4 -3.2 12 9.8" dishes={[0, 1]} baseMarbles={{ 0: 3, 1: 4 }}>
        <Ring at={RING[8]} r={0.62} width={0.12} color="#ffe066" />
        <Marble id={id} seat={0} at={RING[8]} />
        <Marble id={id} seat={0} at={RING[14]} ghost />
        <Marble id={id} seat={0} at={[0, 0]} ghost />
        <Label at={[RING[14][0] - 1.1, RING[14][1]]} size={0.6}>
          Move 6
        </Label>
        <Label at={[-1.05, 0]} size={0.6} color="#ffd166">
          Shortcut
        </Label>
      </BoardArt>
    ),
  },
];

export function RulesModal({ onClose }) {
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const touch = useRef(null);
  const last = SLIDES.length - 1;
  const go = (next) => {
    const clamped = Math.max(0, Math.min(last, next));
    if (clamped === index) return;
    setDirection(clamped > index ? 1 : -1);
    setIndex(clamped);
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') go(index + 1);
      if (e.key === 'ArrowLeft') go(index - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const slide = SLIDES[index];
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="panel modal rules-modal"
        role="dialog"
        aria-label="How to play"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => (touch.current = e.clientX)}
        onPointerUp={(e) => {
          if (touch.current === null) return;
          const dx = e.clientX - touch.current;
          touch.current = null;
          if (Math.abs(dx) > 60) go(index + (dx < 0 ? 1 : -1));
        }}
      >
        <div className="tutorial-head">
          <h2>How to play</h2>
          <span className="muted">
            {index + 1} / {SLIDES.length}
          </span>
        </div>
        <div key={index} className={`tutorial-slide ${direction > 0 ? 'from-right' : 'from-left'}`}>
          <div className="tutorial-visual">{slide.art(`tut${index}`)}</div>
          <div className="tutorial-copy">
            <h3>{slide.title}</h3>
            <p>{slide.text}</p>
          </div>
        </div>
        <div className="tutorial-dots" role="tablist" aria-label="Tutorial steps">
          {SLIDES.map((s, i) => (
            <button key={s.title} role="tab" aria-selected={i === index} aria-label={s.title} className={`tutorial-dot${i === index ? ' on' : ''}`} onClick={() => go(i)} />
          ))}
        </div>
        <div className="tutorial-nav">
          <Credit />
          <div className="tutorial-buttons">
            <button className="btn ghost" onClick={() => go(index - 1)} disabled={index === 0}>
              Back
            </button>
            {index < last ? (
              <button className="btn primary" onClick={() => go(index + 1)}>
                Next
              </button>
            ) : (
              <button className="btn primary" onClick={onClose}>
                Let's play!
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
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
