import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Credit } from './About';
import { Close } from './Icons';
import { RING, HOME, BASE, SEAT_COLORS, BASE_TRAY } from '../game/geometry';
import { Arrow, BoardArt, Coin, Defs, Die, Dish, Label, Marble, Mark, PingMark, Ring, RowArt, Trail, rowAt } from './TutorialArt';

const RED = SEAT_COLORS[0];
const redPath = [...Array.from({ length: 62 }, (_, i) => RING[i + 2]), RING[0], ...HOME[0]];

const SLIDES = [
  {
    title: 'The goal',
    text: 'Race all 5 of your marbles around the board and into your colored home column. The first player with all 5 home wins.',
    art: (id) => (
      <BoardArt id={id} baseMarbles={{ 0: 4, 1: 5, 2: 5, 3: 5 }}>
        <Trail points={redPath.filter((_, i) => i % 2 === 0 || i === redPath.length - 1)} color={RED.light} />
        {/* Where they're headed: all five spots in the red home column */}
        {HOME[0].map((p, i) => (
          <Marble key={i} id={id} seat={0} at={p} r={0.34} ghost />
        ))}
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
    text: 'Roll a 6 and you get another roll once you have moved, even if nothing could move. Anything else, and the turn passes to the next player.',
    // Reads left to right as a timeline: 6, move, roll again; a non-6 ends the turn
    art: (id) => (
      <svg className="tutorial-art" viewBox="-0.6 -2.6 12.4 5.3" role="img" aria-hidden="true">
        <Defs id={id} />
        <Die at={[0, 1.2]} value={6} size={2} />
        <Label at={[1.75, 1.2]} size={0.5}>
          move…
        </Label>
        <Arrow from={[-0.3, 2.45]} to={[-0.3, 4.35]} bend={-0.7} color="#ffd166" width={0.16} />
        <Label at={[-1.75, 3.4]} color="#ffd166" size={0.62}>
          roll again!
        </Label>
        <Die at={[0, 5.6]} value={4} size={2} />
        <Label at={[1.75, 5.6]} size={0.5}>
          move…
        </Label>
        <Arrow from={[-0.3, 6.85]} to={[-0.3, 8.85]} bend={-0.7} color="#9fb3b8" width={0.13} dashed />
        <Label at={[-1.75, 7.85]} color="#9fb3b8" size={0.5}>
          turn passes
        </Label>
        <Marble id={id} seat={1} at={[0, 10.2]} r={0.72} />
        <Label at={[1.75, 10.2]} size={0.5} color={SEAT_COLORS[1].light}>
          next player
        </Label>
      </svg>
    ),
  },
  {
    title: 'Capture!',
    text: "Land exactly on an opponent's marble to knock it all the way back to its dish.",
    art: (id) => (
      <RowArt id={id} holes={6} height={5.4} extra={2.6}>
        {/* The roll sits up top; the captured marble visibly flies into its own (blue) dish */}
        <Die at={[-1.75, 8.7]} value={3} size={1.2} />
        <Arrow from={rowAt(1, -0.5)} to={rowAt(4, -0.55)} bend={-1.3} color={RED.light} width={0.14} />
        <Marble id={id} seat={0} at={rowAt(1)} />
        <Marble id={id} seat={1} at={rowAt(4)} />
        <Dish id={id} at={[1.55, 8.7]} seat={1} />
        <Marble id={id} seat={1} at={[1.55, 8.7]} r={0.34} ghost />
        <Arrow from={rowAt(4, 0.5)} to={[1.3, 7.75]} bend={0.7} color={SEAT_COLORS[1].light} width={0.12} dashed />
        <Label at={[2.2, 4.4]} size={0.52} color={SEAT_COLORS[1].light}>
          back to its dish!
        </Label>
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
    title: 'Blitz (optional)',
    text: 'The host can also pick Blitz: a smaller 40-space board, 3 marbles and a 3-hole home stretch. Same rules, roughly a third of the time, and it pays 60% of Classic rewards.',
    art: (id) => (
      <RowArt id={id} holes={3} height={3.4} extra={3.6}>
        <rect x="-0.55" y="-0.52" width={2 * 1.3 + 1.1} height="1.04" rx="0.45" fill={RED.main} opacity="0.9" />
        {[0, 1, 2].map((i) => (
          <circle key={i} cx={i * 1.3} cy="0" r="0.36" fill={`url(#${id}-hole)`} />
        ))}
        <Marble id={id} seat={0} at={rowAt(0)} />
        <Marble id={id} seat={0} at={rowAt(1)} />
        <Marble id={id} seat={0} at={rowAt(2)} ghost />
        <Label at={[4.6, 0]} size={0.72} color="#ffd166">
          ×3
        </Label>
      </RowArt>
    ),
  },
  {
    title: 'Stepping away',
    text: "Need a break? Hit the coffee cup (or B) and your nameplate shows brb while the bot plays your turns. In teams, your partner plays them for you instead. Hit I'm back, or just roll, to jump back in. If everyone steps away, the game pauses until someone's back (the table closes after 20 minutes). The catch: if the bot plays more than half your turns you earn nothing that game, and sixes or captures made for you never count toward your stats.",
    art: (id) => (
      <svg className="tutorial-art" viewBox="0 -0.2 12 6.6" role="img" aria-hidden="true">
        <Defs id={id} />
        {/* coffee cup */}
        <g transform="translate(1.9 2.1)">
          <path d="M-0.95,-0.6h1.9v0.95a0.95,0.95 0 0 1 -0.95,0.95h-0.1a0.95,0.95 0 0 1 -0.95,-0.95z" fill="#fff6e6" stroke="#caa77a" strokeWidth="0.08" />
          <path d="M0.95,-0.35h0.3a0.42,0.42 0 0 1 0,0.84h-0.3" fill="none" stroke="#caa77a" strokeWidth="0.12" />
          <path d="M-0.35,-1.35c0,0.25 0.2,0.35 0.2,0.55M0.2,-1.35c0,0.25 0.2,0.35 0.2,0.55" fill="none" stroke="#9fb3b8" strokeWidth="0.09" strokeLinecap="round" />
        </g>
        <Label at={[3.6, 1.9]} size={0.6} color="#ffe38a">
          brb
        </Label>
        <Arrow from={[2.1, 3.3]} to={[2.1, 5.2]} color="#ffd166" width={0.14} />
        {/* bot */}
        <g transform="translate(6.5 2.1)">
          <line x1="0" y1="-1.05" x2="0" y2="-1.45" stroke="#8cc2ff" strokeWidth="0.1" />
          <circle cx="0" cy="-1.55" r="0.14" fill="#8cc2ff" />
          <rect x="-0.9" y="-1" width="1.8" height="1.6" rx="0.45" fill="#2b4e6e" stroke="#8cc2ff" strokeWidth="0.1" />
          <circle cx="-0.38" cy="-0.25" r="0.2" fill="#8cc2ff" />
          <circle cx="0.38" cy="-0.25" r="0.2" fill="#8cc2ff" />
          <rect x="-0.4" y="0.2" width="0.8" height="0.12" rx="0.06" fill="#8cc2ff" />
        </g>
        <Label at={[3.6, 6.5]} size={0.5}>
          bot plays
        </Label>
        <Label at={[2.1, 8.2]} size={0.5} color="#9fb3b8">
          or
        </Label>
        <Marble id={id} seat={2} at={[2.1, 10]} r={0.62} />
        <Label at={[3.6, 10]} size={0.5} color={SEAT_COLORS[2].light}>
          partner (2v2)
        </Label>
        {/* the downside */}
        <Coin at={[5.35, 2.4]} size={0.95} />
        <Mark at={[5.75, 2.85]} ok={false} size={0.5} />
        <Label at={[5.4, 7.4]} size={0.5} color="#ff8a8a">
          bot played over half? no rewards
        </Label>
      </svg>
    ),
  },
  {
    title: 'Handy tips',
    text: 'Tap a glowing marble to see where it would land; with two options, both show up. Keyboard: Space rolls, Tab then Enter picks a move. Point at a spot and press H to ping it (G to warn), or right-click / long-press. Drag to spin the board, right-drag or two fingers to pan, scroll to zoom (the camera button takes you back), and use the chat to trash talk.',
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
        <PingMark at={RING[5]} color={SEAT_COLORS[1].light} />
        <Label at={[RING[5][0] + 1.1, RING[5][1]]} size={0.55} color={SEAT_COLORS[1].light}>
          ping (H)
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
          <button className="icon-close" onClick={onClose} aria-label="Close">
            <Close />
          </button>
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
