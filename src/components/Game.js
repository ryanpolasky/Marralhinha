import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SEAT_COLORS } from '../game/geometry';
import { coverFor, coveringTurn, handoffMs, homeCount, NO_MOVES_HOLD_MS, partnerOf, ROLL_REVEAL_MS, START_WHEEL_SPIN_MS } from '../game/moves';
import { sfx } from '../game/sound';
import { duckMusic } from '../game/music';
import { RulesModal } from './Rules';
import Confetti from './Confetti';
import { Help, Camera, Exit, DieIcon, Chat, Smiley, Eye, BoardIcon, Coffee, Dots, Close } from './Icons';
import HudSheet from './HudSheet';
import Marquee from './Marquee';
import useMedia, { PHONE_QUERY, WIDE_RESULTS_QUERY } from './useMedia';
import { REACTIONS, REACTION_BY_KEY, computeAwards } from '../game/fun';
import { BOXES, ITEMS, skinKey, itemsForSlot, cosmeticsOf, emotesOf, emoteFor } from '../game/catalog';
import { warmBoardSkin } from '../game/skinWarm';
import { Coins, Coin, EmoteGlyph, ItemThumb, TagBadge, TagBadges } from './Economy';
import { SettingsButton } from './Settings';
import { ask } from './Dialog';
import { useSettings, updateSettings, getSettings } from '../game/settings';
import useFitPanel from './useFitPanel';
import Feed from './Feed';
import { AimBanner, BITS, HitOverlay, HitTab, useMarblePick } from './Hit';
import { StuntOverlay } from './Stunt';

const BOX_PRICE = BOXES[0].price;

function useAnnouncements(game, mySeat, nameOf, local = false) {
  const [items, setItems] = useState([]);
  const prev = useRef(null);
  const latest = useRef(game);
  latest.current = game;
  const timers = useRef([]);
  const busyUntil = useRef(0);

  const push = useCallback((title, sub, tone = 'info', delay = 0, sound = null, stillValid = null) => {
    const fire = () => {
      if (stillValid && !stillValid(latest.current)) return;
      const wait = busyUntil.current - Date.now();
      if (wait > 0) {
        timers.current.push(setTimeout(fire, wait));
        return;
      }
      busyUntil.current = Date.now() + 1900 + 250;
      const id = `${Date.now()}-${Math.random()}`;
      setItems((list) => [...list.slice(-1), { id, title, sub, tone }]);
      if (sound) sound();
      const t2 = setTimeout(() => setItems((list) => list.filter((i) => i.id !== id)), 1900);
      timers.current.push(t2);
    };
    timers.current.push(setTimeout(fire, delay));
  }, []);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  useEffect(() => {
    const p = prev.current;
    prev.current = game;
    if (!p) return;
    const roll = game.lastRoll;
    if (roll && roll.t !== p.lastRoll?.t && (roll.seat === mySeat || (local && roll.noMoves))) {
      if (roll.noMoves) push(`No moves`, `${local ? `${nameOf(roll.seat)} rolled a ${roll.die}` : `with a ${roll.die}`}${roll.die === 6 ? ', roll again!' : ''}`, 'muted', ROLL_REVEAL_MS);
      else if (roll.die === 6) push('Six!', 'Move, then roll again', 'gold', ROLL_REVEAL_MS, sfx.six);
    }
    const mv = game.lastMove;
    if (mv && mv.t !== p.lastMove?.t) {
      const hopMs = (mv.path?.length || 1) * 190;
      if (mv.capture) {
        const mine = mv.seat === mySeat;
        const victim = mv.capture.seat === mySeat;
        push(mine ? 'Captured!' : victim ? 'Ouch!' : 'Capture!', `${nameOf(mv.seat)} sent ${victim ? 'your' : `${nameOf(mv.capture.seat)}'s`} marble home`, victim ? 'bad' : 'hot', hopMs);
      } else if (mv.kind === 'enterCenter' && mv.seat === mySeat) push('Shortcut!', 'Roll a 1 or 6 to jump out', 'gold', hopMs, sfx.pop);
      if (mv.to.zone === 'home' && mv.from.zone !== 'home') setTimeout(sfx.home, hopMs + 50);
      else if (mv.kind === 'enter') sfx.pop();
    }
    if (game.phase === 'roll' && game.turn === mySeat && (p.turn !== mySeat || p.phase === 'over')) {
      const rollKey = game.lastRoll?.t;
      const justRolled = roll && roll.t !== p.lastRoll?.t;
      const justMoved = mv && mv.t !== p.lastMove?.t;
      const delay = justRolled ? ROLL_REVEAL_MS + (local ? NO_MOVES_HOLD_MS : 150) : justMoved ? (local ? handoffMs(mv) : 600) : 0;
      push(local ? `${nameOf(game.turn)}'s turn!` : 'Your turn!', 'Roll the dice', 'turn', delay, sfx.turn, (g) => g.phase === 'roll' && g.turn === mySeat && g.lastRoll?.t === rollKey);
    }
    if (game.phase === 'over' && p.phase !== 'over' && mySeat >= 0) {
      setTimeout(() => {
        duckMusic(3500);
        (game.winners.includes(mySeat) ? sfx.win : sfx.lose)();
      }, 1200);
    }
  }, [game, mySeat, nameOf, push, local]);

  return items;
}

function statusFor({ game, seats, mySeat, nameOf, rollPending, startPending, local = false, stuck = false, handoff = false, table = false }) {
  if (startPending) {
    return game.pick.reason === 'wheel' ? { title: 'Who starts?', sub: 'The wheel decides the first roll' } : { title: `${nameOf(game.pick.seat)} start${game.pick.seat === mySeat ? '' : 's'}`, sub: "Winner's privilege: first roll and their board" };
  }
  if (rollPending) {
    const roller = game.lastRoll.seat;
    return { title: roller === mySeat ? 'Rolling…' : `${nameOf(roller)} is rolling…`, sub: 'Fingers crossed…' };
  }
  if (stuck) {
    const { seat, die } = game.lastRoll;
    return { title: `No moves with a ${die}`, sub: die === 6 ? `${nameOf(seat)} rolls again` : `${nameOf(game.turn)} is up next` };
  }
  if (handoff) return { title: `${nameOf(game.turn)} is up next`, sub: table ? 'Get ready to roll' : 'Pass the device along' };
  const turn = game.turn;
  if (local && game.phase !== 'over' && !seats[turn]?.isBot) {
    const covering = game.mode === 'teams' && game.marbles[turn].length > 0 && homeCount(game.marbles[turn]) === game.marbles[turn].length;
    const extra = covering ? ` · moving ${nameOf(partnerOf(turn))}'s marbles` : '';
    return game.phase === 'roll' ? { title: `${nameOf(turn)}'s turn`, sub: `Roll the dice${extra}` } : { title: `${nameOf(turn)} rolled a ${game.die}`, sub: `Pick a glowing marble${extra}` };
  }
  const helping = game.mode === 'teams' && game.marbles[turn].length > 0 && homeCount(game.marbles[turn]) === game.marbles[turn].length;
  const helpText = helping ? ` · moving ${nameOf(partnerOf(turn))}'s marbles` : '';
  if (game.phase === 'over') return { title: 'Game over', sub: `${game.winners.map(nameOf).join(' & ')} won` };
  if (coveringTurn(game, seats, mySeat)) {
    const partner = seats[turn]?.name || 'your partner';
    return game.phase === 'roll'
      ? { title: `Play for ${partner}`, sub: 'They stepped away, so roll for them' }
      : { title: `You rolled a ${game.die} for ${partner}`, sub: 'Pick one of their glowing marbles' };
  }
  if (turn === mySeat) {
    if (seats[mySeat]?.away) {
      const cover = coverFor(game, seats, mySeat);
      return { title: 'Your turn (you stepped away)', sub: `${cover ? `${cover.name} is playing your turn for you.` : "The bot's got it."} Hit I'm back or roll to take over.` };
    }
    if (seats[mySeat]?.idle) return { title: 'Your turn!', sub: "You ran out of time, so we've been playing for you. Make a move to take back over." };
    return game.phase === 'roll'
      ? { title: 'Your turn!', sub: `Roll the dice${helpText}` }
      : { title: `You rolled a ${game.die}`, sub: `Pick a glowing marble${helpText}${FINE_POINTER ? ` (or 1-${game.spec?.marbles || 5} / Tab, then Enter)` : ''}` };
  }
  const p = seats[turn];
  if (p?.away && !p.isBot) {
    return { title: `${p.name} stepped away`, sub: coverFor(game, seats, turn) ? `${nameOf(partnerOf(turn))} ${partnerOf(turn) === mySeat ? 'are' : 'is'} playing for them…` : 'A bot is playing for them…' };
  }
  if (isAway(p)) return { title: `${p.name} is away`, sub: p.connected ? 'Playing for them until they’re back…' : p.coverGrace > 0 ? 'A bot will cover for them if they don’t reconnect…' : 'The bot is playing for them…' };
  return game.phase === 'roll'
    ? { title: `${nameOf(turn)}'s turn`, sub: `Rolling…${helpText}` }
    : { title: `${nameOf(turn)} rolled a ${game.die}`, sub: `Thinking…${helpText}` };
}

// Intro card for a fresh game: a wheel that lands on the starter, or a "champion starts" card after a rematch
function StartIntro({ game, seats, mySeat, nameOf, onDismiss }) {
  const { pick } = game;
  const wheel = pick.reason === 'wheel';
  const elapsedAtMount = useRef(Date.now() - pick.t).current;
  const [spun, setSpun] = useState(elapsedAtMount >= START_WHEEL_SPIN_MS);
  const [landed, setLanded] = useState(!wheel || elapsedAtMount >= START_WHEEL_SPIN_MS);
  const contenders = game.active;
  const slice = 360 / contenders.length;
  const index = contenders.indexOf(pick.seat);
  // The pointer sits at the top; land in the middle of the starter's slice after a few full turns, with a deterministic wobble
  const wobble = ((pick.t % 1000) / 1000 - 0.5) * slice * 0.6;
  const target = 360 * 5 - (index * slice + slice / 2) + wobble;

  useEffect(() => {
    if (!wheel || elapsedAtMount >= START_WHEEL_SPIN_MS) return undefined;
    const spin = requestAnimationFrame(() => setSpun(true));
    const elapsed = Date.now() - pick.t;
    const land = setTimeout(() => {
      setLanded(true);
      sfx.pop();
    }, Math.max(0, START_WHEEL_SPIN_MS - elapsed));
    return () => {
      cancelAnimationFrame(spin);
      clearTimeout(land);
    };
  }, [wheel, pick.t, elapsedAtMount]);

  const stops = contenders.map((s, i) => `${SEAT_COLORS[s].main} ${i * slice}deg ${(i + 1) * slice}deg`).join(', ');
  const color = SEAT_COLORS[pick.seat];
  const starter = nameOf(pick.seat);
  const boardSeat = game.boardSeat ?? pick.seat;
  const board = seats[boardSeat]?.cosmetics?.board;
  return (
    <div className={`start-intro${landed ? ' landed' : ''}`} aria-live="polite">
      {wheel && (
        <div className="start-wheel-wrap">
          <span className="start-wheel-pointer" />
          <div className="start-wheel" aria-hidden="true" style={{ background: `conic-gradient(${stops})`, transform: `rotate(${spun ? target : 0}deg)`, transition: spun && !landed ? `transform ${Math.max(0, START_WHEEL_SPIN_MS - elapsedAtMount)}ms cubic-bezier(0.2, 0.45, 0.22, 1)` : 'none' }} />
          <span className="start-wheel-hub" />
        </div>
      )}
      <div className="start-card" style={{ '--seat': color.main, '--seat-light': color.light }}>
        <div className="start-kicker">{wheel ? (landed ? 'The wheel says' : 'Who starts?') : 'Champion starts'}</div>
        <div className="start-name">
          <span className="marble-dot" />
          {landed ? `${starter} start${pick.seat === mySeat ? '' : 's'}!` : 'Spinning…'}
        </div>
        {landed && <div className="start-sub">Playing on {boardSeat === mySeat ? 'your' : `${nameOf(boardSeat)}'s`} board{ITEMS[board] ? ` · ${ITEMS[board].name}` : ''}</div>}
        {landed && <button type="button" className="btn secondary start-continue" onClick={onDismiss}>Continue</button>}
      </div>
    </div>
  );
}

const FINE_POINTER = typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: fine)').matches;
const APP_TITLE = document.title || 'Marralhinha Online';
const isAway = (p) => !!p && !p.isBot && (!p.connected || p.idle || p.away);
const TABLE_SIDES = ['bottom', 'right', 'top', 'left'];
const PORTRAIT_QUERY = '(orientation: portrait)';
const ROTATE_KEY = 'marralhinha:rotateHint';

// Shown once per device: a portrait phone game gets a nudge toward the roomier landscape layout
function RotateHint() {
  const [show, setShow] = useState(() => {
    try {
      return !localStorage.getItem(ROTATE_KEY);
    } catch {
      return false;
    }
  });
  const dismiss = useCallback(() => {
    setShow(false);
    try {
      localStorage.setItem(ROTATE_KEY, '1');
    } catch {}
  }, []);
  useEffect(() => {
    if (!show) return undefined;
    const t = setTimeout(dismiss, 8000);
    return () => clearTimeout(t);
  }, [show, dismiss]);
  if (!show) return null;
  return (
    <button type="button" className="rotate-hint" onClick={dismiss} aria-label="Turn your phone sideways for a bigger board. Tap to dismiss.">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="7" y="3" width="10" height="16" rx="2" />
        <path d="M3 14a8 8 0 0 0 6 7M21 10a8 8 0 0 0-6-7" />
      </svg>
      <span>Turn sideways for a bigger board</span>
      <Close />
    </button>
  );
}

// Speech bubbles live in <body> and follow their chip every frame, so the scrolling (clipped) mobile
// player bar can't hide them. Chat bubbles are capped to the chip's width so neighbours never overlap.
function Bubble({ anchor, className, style, fit = false, children }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    let frame;
    // Reads first, then only the writes that actually changed, so a settled bubble never forces a reflow
    const last = { width: null, left: null, top: null };
    const place = () => {
      const chip = anchor.current;
      const el = ref.current;
      if (chip && el) {
        const r = chip.getBoundingClientRect();
        if (fit && r.width !== last.width) el.style.maxWidth = `${(last.width = r.width)}px`;
        const half = el.offsetWidth / 2;
        const left = Math.min(Math.max(r.left + r.width / 2, half + 8), window.innerWidth - half - 8);
        const top = r.bottom + 12;
        if (left !== last.left) el.style.left = `${(last.left = left)}px`;
        if (top !== last.top) el.style.top = `${(last.top = top)}px`;
      }
      frame = requestAnimationFrame(place);
    };
    place();
    return () => cancelAnimationFrame(frame);
  }, [anchor, fit]);
  return createPortal(
    <div ref={ref} className={`${className} floating`} style={style}>
      {children}
    </div>,
    document.body
  );
}

// Ring around the avatar that drains over the room's turn time and turns red for the final 5s
function TurnClock({ deadline, total }) {
  const remaining = useRef(Math.max(0, deadline - Date.now())).current;
  const from = (1 - Math.min(1, remaining / total)) * 100;
  return (
    <svg
      className="turn-clock"
      viewBox="0 0 40 40"
      aria-hidden="true"
      style={{ '--from': from, '--dur': `${Math.min(remaining, total)}ms`, '--delay': `${Math.max(0, remaining - total)}ms`, '--urgent': `${Math.max(0, remaining - 5000)}ms` }}
    >
      <circle cx="20" cy="20" r="18.5" pathLength="100" />
    </svg>
  );
}

export function PlayerChip({ seat, player, game, activeSeat, mySeat, reaction, clock, viewing, onView, onStats, mini = false }) {
  const color = SEAT_COLORS[seat];
  const home = homeCount(game.marbles[seat]);
  const isTurn = game.phase !== 'over' && activeSeat === seat;
  const sticker = reaction && REACTION_BY_KEY[reaction.key];
  const emote = reaction && !sticker && !reaction.text && emoteFor(player, reaction.key);
  const chipRef = useRef(null);
  const seatVars = { '--seat': color.main, '--seat-light': color.light, '--seat-dark': color.dark };
  const who = seat === mySeat ? 'your' : `${player?.name || color.name}'s`;
  return (
    <div
      ref={chipRef}
      role="button"
      tabIndex={0}
      title={`View the board from ${who} side${onStats ? ' · right-click for stats' : ''}`}
      aria-label={`View the board from ${who} side`}
      aria-pressed={viewing}
      onClick={onView}
      onContextMenu={
        onStats
          ? (e) => {
              e.preventDefault();
              onStats();
            }
          : undefined
      }
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onView && (e.preventDefault(), e.stopPropagation(), onView())}
      className={`chip plate plate-${skinKey(player?.cosmetics?.nameplate) || 'basic'}${isTurn ? ' turn' : ''}${seat === mySeat ? ' me' : ''}${isAway(player) ? ' away' : ''}${viewing ? ' viewing' : ''}${mini ? ' mini' : ''}`}
      style={seatVars}
    >
      {sticker && (
        <Bubble key={reaction.id} anchor={chipRef} className="bubble" style={{ ...seatVars, '--sticker': sticker.color, '--tilt': `${sticker.tilt}deg` }}>
          {sticker.label}
        </Bubble>
      )}
      {emote && (
        <Bubble key={reaction.id} anchor={chipRef} className="bubble emote" style={seatVars}>
          <EmoteGlyph emote={emote} />
        </Bubble>
      )}
      {reaction?.text && (
        <Bubble key={reaction.id} anchor={chipRef} fit className={`bubble chat${reaction.team ? ' team' : ''}`} style={{ ...seatVars, '--sticker': reaction.team ? '#e6f4ff' : '#fff6e8', '--tilt': '0deg' }}>
          {reaction.text}
        </Bubble>
      )}
      <span className="avatar">
        {clock && <TurnClock key={`${clock.key}:${clock.deadline}`} deadline={clock.deadline} total={clock.total} />}
        {(player?.name || '?').slice(0, 1).toUpperCase()}
        {player?.avatar && <img className="avatar-img" src={player.avatar} alt="" draggable={false} onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
        {player?.level && <span className="avatar-level">{player.level}</span>}
      </span>
      <div className="chip-body">
        <div className="chip-name">
          <Marquee className="chip-name-text">{seat === mySeat ? 'You' : player?.name}</Marquee>
          <TagBadges tags={player?.tags} small />
          {player?.isBot && <span className="badge">bot</span>}
          {isAway(player) && <span className="badge warn">{player.away ? 'brb' : 'away'}</span>}
        </div>
        <div className="pips" aria-label={`${home} of ${game.marbles[seat].length} marbles home`}>
          {game.marbles[seat].map((_, i) => (
            <span key={i} className={i < home ? 'on' : ''} />
          ))}
        </div>
      </div>
    </div>
  );
}

// Dev-only: swap the whole table's board, or force anyone's marble, dice and kill effect skins mid-game
const TROLL_SLOTS = { marble: 'marbles', dice: 'dice', fx: 'kill effect', trail: 'move trail' };
export function BoardPicker({ current, seats, onPick, onSkin, game, mySeat = -1, onShoot, onUnshoot, onStunt, onBitStart, startOpen = false }) {
  const [open, setOpen] = useState(startOpen);
  const [tab, setTab] = useState('board');
  const [edit, setEdit] = useState(null);
  const [bit, setBit] = useState(null);
  const [picks, setPicks] = useState(null);
  const reopen = (nextBit) => {
    setTab('bits');
    setBit(nextBit);
    setOpen(true);
  };
  const [aiming, startAim, cancelAim] = useMarblePick(
    game,
    (pick, key) => {
      if (key !== 'hit') return onStunt?.({ kind: key, ...pick });
      setPicks(pick);
      reopen('hit');
    },
    () => reopen(null)
  );
  const aimOnBoard = (key = 'hit') => {
    setOpen(false);
    startAim(key);
    onBitStart?.();
  };
  const boards = itemsForSlot('board');
  // Opening prebuilds every board on idle; hovering rushes just that one
  useEffect(() => {
    if (open) warmBoardSkin();
  }, [open]);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  const items = edit ? itemsForSlot(edit.slot) : [];
  const victim = edit && seats[edit.seat];
  const slotLabel = TROLL_SLOTS[edit?.slot];
  const worn = victim ? cosmeticsOf(victim)[edit.slot] : null;
  const pickTab = (key) => {
    setTab(key);
    setEdit(null);
    setBit(null);
  };
  return (
    <div className="board-picker">
      <button
        className="icon-btn"
        onClick={() => {
          cancelAim();
          setOpen((o) => !o);
        }}
        aria-label="Dev tools: board and skins"
        title="Dev tools: board and skins"
        aria-expanded={open}
      >
        <BoardIcon />
      </button>
      {aiming && (
        <AimBanner
          step={aiming}
          seats={seats}
          onCancel={() => {
            cancelAim();
            reopen(null);
          }}
        />
      )}
      {open &&
        createPortal(
          <div className={`board-picker-backdrop${tab === 'bits' && bit ? ' see-through' : ''}`} onClick={() => setOpen(false)}>
            <div className="board-picker-pop" role="dialog" aria-label="Dev tools" onClick={(e) => e.stopPropagation()}>
              <div className="dev-head">
                <h2>Dev tools</h2>
                <TagBadge tag="dev" small />
                <button className="icon-close" onClick={() => setOpen(false)} aria-label="Close">
                  <Close />
                </button>
              </div>
              <div className="admin-tabs" role="tablist">
                {[
                  ['board', 'Table board'],
                  ['dress', 'Dress the table'],
                  ...(game && onShoot ? [['bits', 'Bits']] : []),
                ].map(([key, label]) => (
                  <button key={key} role="tab" aria-selected={tab === key} className={`board-tab${tab === key ? ' on' : ''}`} onClick={() => pickTab(key)}>
                    {label}
                  </button>
                ))}
              </div>
              <div className="dev-body">
                {tab === 'board' && (
                  <>
                    <div className="board-picker-grid">
                      {boards.map((b) => (
                        <button key={b.id} role="menuitemradio" aria-checked={current === b.id} className={`board-option${current === b.id ? ' on' : ''}`} onClick={() => onPick(b.id)} onPointerEnter={() => warmBoardSkin(b.id)} title={b.desc}>
                          <ItemThumb itemId={b.id} />
                          <span>{b.name}</span>
                        </button>
                      ))}
                    </div>
                    <button className="btn tiny ghost" onClick={() => onPick(null)}>
                      Back to the starter's board
                    </button>
                  </>
                )}
                {tab === 'bits' && !bit && (
                  <div className="bit-list">
                    {BITS.map((b) => (
                      <button key={b.key} className="bit-card" onClick={() => aimOnBoard(b.key)}>
                        <b>{b.name}</b>
                        <span>{b.desc}</span>
                      </button>
                    ))}
                  </div>
                )}
                {tab === 'bits' && bit === 'hit' && game && (
                  <>
                    <div className="board-picker-head">
                      <span>The hit</span>
                      <button className="btn tiny ghost" onClick={() => setBit(null)}>
                        Back
                      </button>
                    </div>
                    <HitTab
                      key={JSON.stringify(picks)}
                      game={game}
                      seats={seats}
                      mySeat={mySeat}
                      initial={picks}
                      onRepick={() => aimOnBoard('hit')}
                      onShoot={(shot) => {
                        onShoot(shot);
                        setOpen(false);
                        setBit(null);
                        setPicks(null);
                      }}
                      onUnshoot={onUnshoot}
                    />
                  </>
                )}
                {tab === 'dress' && edit && (
                  <>
                    <div className="board-picker-head" style={{ '--seat': SEAT_COLORS[edit.seat].main }}>
                      <span className="picker-victim">
                        {victim?.name}'s {slotLabel}
                      </span>
                      <span className="troll-actions">
                        <button className="btn tiny ghost" onClick={() => setEdit(null)}>
                          Back
                        </button>
                        <button className="btn tiny ghost" onClick={() => onSkin(edit.seat, edit.slot, null)}>
                          Their own {slotLabel}
                        </button>
                      </span>
                    </div>
                    <div className="board-picker-grid">
                      {items.map((b) => (
                        <button key={b.id} role="menuitemradio" aria-checked={worn === b.id} className={`board-option${worn === b.id ? ' on' : ''}`} onClick={() => onSkin(edit.seat, edit.slot, b.id)} title={b.desc}>
                          <ItemThumb itemId={b.id} seat={edit.seat} />
                          <span>{b.name}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
                {tab === 'dress' && !edit && (
                  <div className="troll-list">
                    {seats.map((p, s) =>
                      p ? (
                        <div className="troll-row" key={s} style={{ '--seat': SEAT_COLORS[s].main }}>
                          <span className="troll-name">{p.name}</span>
                          <div className="troll-slots">
                            {Object.keys(TROLL_SLOTS).map((slot) => (
                              <button key={slot} className="troll-slot" aria-label={`${p.name}'s ${TROLL_SLOTS[slot]}`} title={`${p.name}'s ${TROLL_SLOTS[slot]}`} onClick={() => setEdit({ seat: s, slot })}>
                                <ItemThumb itemId={cosmeticsOf(p)[slot]} seat={s} />
                                <span className="troll-slot-info">
                                  <b>{TROLL_SLOTS[slot][0].toUpperCase() + TROLL_SLOTS[slot].slice(1)}</b>
                                  <span>{ITEMS[cosmeticsOf(p)[slot]]?.name || 'None'}</span>
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : null
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

// Eye with a count when anyone is watching; hover, focus or tap lists who
function Spectators({ spectators, playerId }) {
  const [open, setOpen] = useState(false);
  const watching = spectators.filter((p) => p.connected);
  if (!watching.length) return null;
  const label = `${watching.length} spectating`;
  return (
    <div className={`spectators${open ? ' open' : ''}`} onMouseLeave={() => setOpen(false)}>
      <button type="button" className="icon-btn spectators-btn" onClick={() => setOpen((o) => !o)} onBlur={() => setOpen(false)} aria-label={`${label}: ${watching.map((p) => p.name).join(', ')}`} aria-expanded={open}>
        <Eye />
        <span className="spectators-count">{watching.length}</span>
      </button>
      <div className="spectators-pop" role="tooltip">
        <div className="spectators-title">{label}</div>
        {watching.map((p) => (
          <div key={p.id} className="spectators-name">
            {p.name}
            {p.id === playerId && <span className="muted"> (you)</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function RoomCode({ code }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      sfx.pop();
      setTimeout(() => setCopied(false), 1400);
    } catch {}
  };
  return (
    <button type="button" className={`room-pill${copied ? ' copied' : ''}`} onClick={copy} title="Copy room code" aria-label={`Room code ${code}, click to copy`}>
      {copied ? 'Copied!' : code}
    </button>
  );
}

export function ReactionBar({ onReact, spam = false, emotes = [], inline = false, collapse = false }) {
  const [panel, setPanel] = useState(inline ? 'chat' : null);
  const [cooling, setCooling] = useState(false);
  useEffect(() => {
    if (collapse && !inline) setPanel(null);
  }, [collapse, inline]);
  const send = (key) => {
    if (cooling) return;
    onReact(key);
    if (!spam && !inline) setPanel(null);
    setCooling(true);
    setTimeout(() => setCooling(false), spam ? 250 : 1200);
  };
  const toggle = (next) => setPanel((cur) => (cur === next && !inline ? null : next));
  return (
    <div className={`reactions${panel ? ' open' : ''}${inline ? ' inline' : ''}`}>
      <div className="reactions-toggles">
        <button className={`icon-btn reactions-toggle${panel === 'chat' ? ' on' : ''}`} onClick={() => toggle('chat')} aria-label="Quick chat" title="Quick chat" aria-expanded={panel === 'chat'}>
          <Chat />
          {inline && <span>Quick chat</span>}
        </button>
        <button className={`icon-btn reactions-toggle${panel === 'emotes' ? ' on' : ''}`} onClick={() => toggle('emotes')} aria-label="Emotes" title="Emotes" aria-expanded={panel === 'emotes'}>
          <Smiley />
          {inline && <span>Emotes</span>}
        </button>
      </div>
      {panel === 'chat' && (
        <div className="stickers">
          {REACTIONS.map((r) => (
            <button key={r.key} className="sticker" disabled={cooling} title={r.hint} style={{ '--sticker': r.color, '--tilt': `${r.tilt}deg` }} onClick={() => send(r.key)}>
              {r.label}
            </button>
          ))}
        </div>
      )}
      {panel === 'emotes' && (
        <div className="stickers emote-stickers">
          {emotes.map((e) => (
            <button key={e.key} className="sticker emote" disabled={cooling} title={e.hint} onClick={() => send(e.key)}>
              <EmoteGlyph emote={e} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Final table: winners first, then by marbles home; each player's awards ride on their own row.
// Awards are shuffled once per mount so the pop-in order varies game to game but never mid-screen.
export function Standings({ game, seats, mySeat, onPlayerStats }) {
  const [awards] = useState(() => computeAwards(game));
  const won = (s) => !!game.winners?.includes(s);
  const order = [...game.active].sort((a, b) => won(b) - won(a) || homeCount(game.marbles[b]) - homeCount(game.marbles[a]));
  return (
    <div className="win-players">
      {order.map((s) => {
        const p = seats[s];
        const human = p && !p.isBot && p.userId && s !== mySeat && onPlayerStats;
        const mine = awards.filter((a) => a.seat === s);
        const marbles = game.marbles[s] || [];
        const home = homeCount(marbles);
        return (
          <button
            key={s}
            type="button"
            className={`win-player${human ? '' : ' quiet'}${won(s) ? ' won' : ''}`}
            style={{ '--seat': SEAT_COLORS[s].main, '--seat-light': SEAT_COLORS[s].light, '--seat-dark': SEAT_COLORS[s].dark }}
            disabled={!human}
            onClick={() => human && onPlayerStats(p)}
            title={human ? `See ${p.name}'s stats` : undefined}
          >
            <span className="marble-dot" />
            <span className="win-player-main">
              <span className="win-player-head">
                <span className="win-player-name">{s === mySeat ? 'You' : p?.name || SEAT_COLORS[s].name}</span>
                <TagBadges tags={p?.tags} small />
                {p?.isBot && <span className="badge">bot</span>}
              </span>
              {mine.length > 0 && (
                <span className="win-player-awards">
                  {mine.map((a) => (
                    <span key={a.title} className="award-chip" title={a.blurb} style={{ '--i': awards.indexOf(a) }}>
                      <b>{a.value}</b>
                      {a.title}
                    </span>
                  ))}
                </span>
              )}
            </span>
            <span className="win-player-side">
              {won(s) && <span className="win-player-won">won</span>}
              {marbles.length > 0 && (
                <span className="pips" aria-label={`${home} of ${marbles.length} marbles home`}>
                  {marbles.map((_, i) => (
                    <span key={i} className={i < home ? 'on' : ''} />
                  ))}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function WinCard({ cardRef, activity = false, wide = false, local = false, game, seats, mySeat, nameOf, isHost, coins = 0, rematch = null, playerId = null, onAction, onShop, onLeave, onViewBoard, onPlayerStats }) {
  const [revealed, setRevealed] = useState(false);
  const reward = game.rewards?.[mySeat];
  const iWon = !local && !!game.winners?.includes(mySeat);
  const chests = Math.floor(coins / BOX_PRICE);
  const title = iWon ? (game.winners.length > 1 ? 'You and your partner win!' : 'You win!') : `${game.winners.map(nameOf).join(' & ')} win${game.winners.length === 1 ? 's' : ''}`;
  const nameOfId = (id) => {
    const s = seats.findIndex((p) => p?.id === id);
    return s === mySeat ? 'You' : s >= 0 ? seats[s]?.name : null;
  };
  const voters = (rematch?.voters || []).map(nameOfId).filter(Boolean);
  const pending = (rematch?.pending || []).map(nameOfId).filter(Boolean);
  const needed = voters.length + pending.length;
  const iVoted = !!rematch?.voters?.includes(playerId);
  const favourite = getSettings().favoriteSeat;
  const openSeat = Number.isInteger(favourite) && !seats[favourite] ? favourite : seats.findIndex((p) => !p);
  return (
    <div ref={cardRef} className={`panel win-card${iWon ? ' won' : ''}${activity || wide ? ' activity-win-card' : ''}${wide && !activity ? ' wide-win-card' : ''}${reward ? '' : ' no-payout'}`}>
      <div className="win-intro">
        <div className="win-marbles">
          {game.winners.map((s) => (
            <span key={s} className="marble-dot big" style={{ '--seat': SEAT_COLORS[s].main, '--seat-light': SEAT_COLORS[s].light }} />
          ))}
        </div>
        <div className="win-headline">
          <div className="win-kicker">{iWon ? 'Victory!' : 'Game over'}</div>
          <h2>{title}</h2>
        </div>
        <div className="win-meta">
          {game.mode === 'teams' ? 'Teams' : 'Free-for-all'} · {game.variant === 'blitz' ? 'Blitz' : 'Classic'}
        </div>
      </div>
      {reward && (
        <div className="win-payout">
          <div className="win-section-label">Your payout</div>
          <Rewards reward={reward} onRevealed={() => setRevealed(true)} />
          {/* Holds its slot but stays hidden until the payout counts in, so the offer reflects what you just earned */}
          {chests > 0 && (
            <button className={`btn secondary block open-box-cta${revealed ? '' : ' pending'}`} onClick={onShop}>
              You can afford {chests > 1 ? `${chests} chests` : 'a chest'}! Open one
            </button>
          )}
        </div>
      )}
      <div className="win-social">
        <div className="win-section-label">Standings</div>
        <Standings game={game} seats={seats} mySeat={mySeat} onPlayerStats={onPlayerStats} />
      </div>
      <div className="win-actions">
        {isHost ? (
          <button className="btn primary big block play-btn" onClick={() => onAction('game:rematch')}>
            Play again
          </button>
        ) : mySeat >= 0 ? (
          <button
            className={`btn big block play-btn ${iVoted ? 'secondary' : 'primary'}`}
            onClick={() => onAction('game:rematch')}
            title={iVoted ? 'Click again to back out' : 'Vote for another round; it starts the moment everyone is in'}
            aria-pressed={iVoted}
          >
            {iVoted ? `You're in! (${voters.length}/${needed})` : 'Rematch'}
          </button>
        ) : openSeat >= 0 ? (
          <button className="btn primary big block play-btn" onClick={() => onAction('lobby:seat', { seat: openSeat })} title="Grab an open seat and you'll be in the next round">
            Take a seat
          </button>
        ) : (
          <div className="waiting">Waiting for the host to start another round…</div>
        )}
        {voters.length > 0 && (
          <div className="win-rematch" aria-live="polite">
            <b>{voters.join(' · ')}</b>
            {` ${voters.length === 1 ? 'wants' : 'want'} a rematch`}
            {pending.length > 0 && <span className="win-rematch-wait"> · waiting on {pending.length === 1 ? pending[0] : `${pending.length} more`}</span>}
          </div>
        )}
        <div className={`win-minor${onLeave ? '' : ' single'}`}>
          <button className="btn ghost" onClick={onViewBoard}>
            View board
          </button>
          {mySeat >= 0 && !local && (
            <button className="btn ghost" onClick={() => onAction('lobby:spectate')} title="Step down and just watch the next round">
              Spectate
            </button>
          )}
          {onLeave && (
            <button className="btn ghost" onClick={onLeave}>
              Leave
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function Rewards({ reward, onRevealed }) {
  const [shownLines, setShownLines] = useState(0);
  const payout = reward ? reward.lines.map((l) => `${l.label}:${l.amount}`).join('|') : '';
  const lineCount = reward?.lines.length || 0;
  const done = !!reward && shownLines >= lineCount;
  useEffect(() => {
    if (!payout) return undefined;
    setShownLines(0);
    const timers = Array.from({ length: lineCount }, (_, i) =>
      setTimeout(() => {
        setShownLines(i + 1);
        sfx.coins();
      }, 500 + i * 280)
    );
    return () => timers.forEach(clearTimeout);
  }, [payout, lineCount]);
  // Once the coins have counted in, celebrate the big moments and let the win screen show its follow-ups
  useEffect(() => {
    if (!done) return undefined;
    onRevealed?.();
    if (!reward.leveledUp && !reward.luckyTag && !reward.goldenDie) return undefined;
    const t = setTimeout(() => sfx.reveal(reward.luckyTag ? 'legendary' : 'epic'), 150);
    return () => clearTimeout(t);
  }, [done]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!reward) return null;
  const total = reward.lines.slice(0, shownLines).reduce((sum, l) => sum + l.amount, 0);
  return (
    <div className="rewards">
      {reward.lines.map((line, i) => (
        <div key={line.label} className={`reward-line${i < shownLines ? ' shown' : ''}${line.levelUp ? ' level-up' : ''}`}>
          <span>{line.label}</span>
          <span className="reward-amount">
            +{line.amount} <Coin size={15} />
          </span>
        </div>
      ))}
      {reward.note && <div className="reward-note">{reward.note}</div>}
      {reward.leveledUp && (
        <div className={`reward-celebrate reward-levelup${done ? ' shown' : ''}`}>
          <span className="level-badge">{reward.level}</span>
          <span>
            <b>Level up!</b> You're now level {reward.level}.
          </span>
        </div>
      )}
      {reward.luckyTag && (
        <div className={`reward-celebrate reward-lucky${done ? ' shown' : ''}`}>
          <TagBadge tag="lucky" small />
          <span>
            <b>You're the Luckiest!</b> Your last 10 games have the highest luck score. Hold the title for three total days to unlock the Golden Die.
          </span>
        </div>
      )}
      {reward.goldenDie && (
        <div className={`reward-celebrate reward-lucky${done ? ' shown' : ''}`}>
          <span><b>Golden Die unlocked!</b> Three total days as Luckiest. It's yours permanently.</span>
        </div>
      )}
      <div className="reward-total">
        <span>You earned</span>
        <Coins amount={total} />
      </div>
    </div>
  );
}

export default function Game({ room, playerId, reactions = [], teamLog = [], isAdmin = false, cameraOff = false, rollPending = false, stuck = false, handoff = false, startPending = false, onDismissStart, onAction, onLeave, onResetView, onShop, onReport, onPlayerStats, coins = 0, viewSeat = 0, onViewSeat }) {
  const { game, seats } = room;
  const local = !!room.local;
  const mySeat = seats.findIndex((p) => p && p.id === playerId);
  const isHost = room.hostId === playerId;
  const [rulesOpen, setRulesOpen] = useState(false);
  const [feedOpen, setFeedOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [chatSeenAt, setChatSeenAt] = useState(() => Date.now());
  const [overOpen, setShowOver] = useState(game.phase === 'over');
  // The state lags a render behind a rematch, so gate on the live phase or WinCard renders a game with no winners
  const showOver = overOpen && game.phase === 'over';
  // Round the table spins the HUD itself, so it keeps the regular layout
  const phone = useMedia(PHONE_QUERY) && !room.table;
  const portrait = useMedia(PORTRAIT_QUERY);
  const wideResults = useMedia(WIDE_RESULTS_QUERY) && !room.activity;
  const closeSheet = useCallback(() => {
    setSheetOpen(false);
    setChatSeenAt(Date.now());
  }, []);
  useEffect(() => {
    if (!phone) setSheetOpen(false);
  }, [phone]);
  const [winScreenRef, winCardRef] = useFitPanel(room.activity && showOver, room, { maxWidth: 920 });

  // Results name the players who finished the game, not whoever grabbed a freed seat afterwards
  const over = game.phase === 'over';
  const nameOf = useCallback((s) => ((s === mySeat && !local) ? 'You' : (over ? game.names?.[s] : seats[s]?.name) || SEAT_COLORS[s].name), [mySeat, local, seats, over, game.names]);
  const announcements = useAnnouncements(game, mySeat, nameOf, local);

  const held = rollPending || stuck || handoff;
  const activeSeat = held ? game.lastRoll.seat : game.turn;
  const covering = coveringTurn(game, seats, mySeat);
  const myTurn = (activeSeat === mySeat || (covering && !held)) && game.phase !== 'over';
  const meAway = !!seats[mySeat]?.away;
  const setAway = useCallback((away) => onAction('game:away', { away }), [onAction]);

  // B toggles stepping away (not while typing or in a dialog)
  useEffect(() => {
    if (mySeat < 0 || game.phase === 'over') return undefined;
    const onKey = (e) => {
      if (e.key.toLowerCase() !== 'b' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      setAway(!meAway);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mySeat, game.phase, meAway, setAway]);
  const canRoll = myTurn && game.phase === 'roll' && !held && !startPending;
  const roll = useCallback(() => canRoll && onAction('game:roll'), [canRoll, onAction]);
  const { autoRoll, showLogs } = useSettings();

  useEffect(() => {
    // Auto-roll never plays for you while you've stepped away (that would bring you "back")
    if (!autoRoll || !canRoll || meAway) return undefined;
    const t = setTimeout(roll, 650);
    return () => clearTimeout(t);
  }, [autoRoll, canRoll, roll, game.lastRoll?.t, meAway]);

  useEffect(() => {
    if (!showOver) return;
    setFeedOpen(false);
    closeSheet();
  }, [showOver, closeSheet]);

  useEffect(() => {
    if (game.phase !== 'over') {
      setShowOver(false);
      return undefined;
    }
    const t = setTimeout(() => setShowOver(true), 1400);
    return () => clearTimeout(t);
  }, [game.phase]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === ' ' && !['INPUT', 'TEXTAREA', 'BUTTON'].includes(e.target.tagName)) {
        e.preventDefault();
        roll();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [roll]);

  // Turn clock: the server sends time left relative to when it sent the state; one key per turn step so
  // unrelated updates (chat, reactions) don't restart the ring
  const clockKey = `${game.turn}|${game.phase}|${game.lastRoll?.t}|${game.lastMove?.t}`;
  const deadline = useMemo(() => (room.turnEndsIn != null ? Date.now() + room.turnEndsIn : null), [clockKey, room.turnEndsIn != null]); // eslint-disable-line react-hooks/exhaustive-deps
  const clock = deadline && room.turnSeconds && game.phase !== 'over' && !rollPending ? { key: clockKey, deadline, total: room.turnSeconds * 1000 } : null;
  const myClock = clock && (game.turn === mySeat || covering) && !meAway;

  // Ticks for the last 5 seconds of your own turn
  useEffect(() => {
    if (!myClock) return undefined;
    const timers = [5, 4, 3, 2, 1].map((s) => {
      const at = deadline - s * 1000 - Date.now();
      return at > 0 ? setTimeout(() => sfx.tick(s <= 3), at) : null;
    });
    return () => timers.forEach(clearTimeout);
  }, [myClock, deadline]);

  // While the tab is hidden, the title calls you back when the table needs you
  const needsMe = myTurn && !meAway && !startPending;
  useEffect(() => {
    const apply = () => {
      document.title = needsMe && document.hidden ? `Your turn · ${APP_TITLE}` : APP_TITLE;
    };
    apply();
    document.addEventListener('visibilitychange', apply);
    return () => {
      document.removeEventListener('visibilitychange', apply);
      document.title = APP_TITLE;
    };
  }, [needsMe]);

  // Only Devs can swap the table mid-game, so only they prebuild every board; everyone else builds a skin when it's picked
  useEffect(() => {
    if (isAdmin) warmBoardSkin();
  }, [isAdmin]);

  const status = statusFor({ game, seats, mySeat, nameOf, rollPending, startPending, local, stuck, handoff, table: !!room.table });
  const badge = stuck ? game.lastRoll : game.phase === 'move' && !rollPending ? { die: game.die, seat: game.turn } : null;
  // Faces Red during the start wheel; bot turns stay facing the last human since nobody sits there
  const tableSide = !local || !room.table ? null : startPending ? 'bottom' : TABLE_SIDES[seats[activeSeat]?.isBot ? Math.max(mySeat, 0) : activeSeat];
  // The rules stay facing whoever opened them, even if the turn moves on underneath
  const side = typeof rulesOpen === 'string' ? rulesOpen : tableSide;
  const hudRef = useRef(null);
  useEffect(() => {
    if (!side) return undefined;
    document.body.dataset.tableSide = side;
    hudRef.current?.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 350, easing: 'ease-out' });
    return () => delete document.body.dataset.tableSide;
  }, [side]);
  const teams = game.mode === 'teams';
  const chip = (s) => {
    const viewing = !local && viewSeat === s && s !== Math.max(mySeat, 0);
    return (
      <PlayerChip
        key={s}
        seat={s}
        player={seats[s]}
        game={game}
        activeSeat={activeSeat}
        mySeat={local ? -1 : mySeat}
        reaction={reactions.find((r) => r.seat === s)}
        clock={clock && game.turn === s ? clock : null}
        viewing={viewing}
        mini={phone && portrait && s !== activeSeat && (local || s !== mySeat) && !viewing}
        onView={local ? undefined : () => onViewSeat?.(s)}
        onStats={!local && seats[s]?.userId && s !== mySeat ? () => onPlayerStats?.(seats[s]) : undefined}
      />
    );
  };
  const shared = rollPending ? game.log.filter((entry) => entry.chat || entry.t < game.lastRoll.t) : game.log;
  const log = [...(room.chat || []), ...shared, ...teamLog].sort((a, b) => a.t - b.t).reverse();
  const entries = showLogs ? log : log.filter((entry) => entry.chat);
  const isMine = (entry) => (entry.from ? entry.from === playerId : entry.seat === mySeat);
  const unread = feedOpen || sheetOpen ? 0 : log.filter((entry) => entry.chat && !isMine(entry) && entry.t > chatSeenAt).length;
  const iWon = local ? game.phase === 'over' : game.winners?.includes(mySeat);

  const announceEl = (
    <div className="announcements" aria-live="polite">
      {announcements.map((a) => (
        <div key={a.id} className={`announce ${a.tone}`}>
          <div className="announce-title">{a.title}</div>
          {a.sub && <div className="announce-sub">{a.sub}</div>}
        </div>
      ))}
    </div>
  );
  const actionPanel = (
    <div className={`action-panel${myTurn ? ' mine' : ''}`} style={{ '--seat': SEAT_COLORS[activeSeat].main }}>
      {badge && (
        <span key={game.lastRoll?.t} className={`roll-badge${badge.die === 6 ? ' six' : ''}`} style={{ '--seat': SEAT_COLORS[badge.seat].main }}>
          {badge.die}
        </span>
      )}
      <div className="action-text">
        <div className="action-title">{status.title}</div>
        <div className="action-sub">{canRoll && !autoRoll && !FINE_POINTER ? status.sub.replace(/^Roll the dice/, 'Tap the board or hit Roll') : status.sub}</div>
      </div>
      {mySeat >= 0 && game.phase !== 'over' && (
        <button className={`roll-btn${canRoll ? ' ready' : ''}${autoRoll ? ' auto' : ''}`} disabled={!canRoll} onClick={roll} title={autoRoll ? 'Auto-roll is on (change in Settings)' : 'Roll (Space)'}>
          <DieIcon />
          <span>{autoRoll && canRoll ? 'Auto' : 'Roll'}</span>
        </button>
      )}
      {game.phase === 'over' && (
        <button className="btn primary" onClick={() => setShowOver(true)}>
          Results
        </button>
      )}
    </div>
  );

  const brandChip = (
    <div className="brand-chip">
      <span className="brand">Marralhinha</span>
      {!room.activity && !local && <RoomCode code={room.code} />}
      {local && <span className="room-pill local-pill">{room.table ? 'Round the table' : 'Pass & play'}</span>}
      {mySeat < 0 && !local && <span className="badge">Spectating</span>}
      {!local && <Coins amount={coins} className="hud-coins" />}
    </div>
  );
  const playersBar = (
    <div className="players-bar">
      {teams ? (
        <>
          <div className="team">{[0, 2].map(chip)}</div>
          <span className="vs">VS</span>
          <div className="team">{[1, 3].map(chip)}</div>
        </>
      ) : (
        game.active.map(chip)
      )}
    </div>
  );
  const devPicker = isAdmin && !local && (
    <BoardPicker
      current={game.boardOverride || seats[game.boardSeat ?? -1]?.cosmetics?.board || null}
      seats={seats}
      onPick={(item) => onAction('game:setBoard', { item })}
      onSkin={(seat, slot, item) => onAction('game:setSkin', { seat, slot, item })}
      game={game}
      mySeat={mySeat}
      onShoot={(shot) => onAction('game:shoot', shot)}
      onUnshoot={(id) => onAction('game:unshoot', { id })}
      onStunt={(stunt) => onAction('game:stunt', stunt)}
      onBitStart={() => onAction('game:pauseClock')}
    />
  );
  const cameraBtn = !(local && room.table) && (
    <button className={`icon-btn${cameraOff ? ' attention' : ''}`} onClick={onResetView} aria-label="Reset camera" title="Reset camera">
      <Camera />
    </button>
  );
  const endTable = async () => {
    const ok = await ask({ title: 'End this game?', message: 'Everyone returns to the lobby. This round ends without rewards.', confirm: 'End game', cancel: 'Keep playing', tone: 'danger' });
    if (ok) onAction('game:endTable');
  };
  const canEnd = room.activity && isHost && game.phase !== 'over';
  const canAway = !local && mySeat >= 0 && game.phase !== 'over';
  const spam = isAdmin || (seats[mySeat]?.tags || []).some((tag) => tag === 'beta' || tag === 'dev');
  const feed = (docked) => (
    <Feed
      entries={entries}
      open={feedOpen}
      onToggle={() => {
        setFeedOpen((o) => !o);
        setChatSeenAt(Date.now());
      }}
      showLogs={showLogs}
      onToggleLogs={() => updateSettings({ showLogs: !showLogs })}
      unread={unread}
      isMine={isMine}
      teams={teams && mySeat >= 0}
      onSend={(text, channel) => onAction('game:chat', { text, channel })}
      lifted={!docked && showOver}
      docked={docked}
    />
  );
  const overlays = (
    <>
      {startPending && <StartIntro key={game.pick.t} game={game} seats={seats} mySeat={local ? -1 : mySeat} nameOf={nameOf} onDismiss={onDismissStart} />}
      {announceEl}
      {!!game.hits?.length && <HitOverlay hits={game.hits} names={seats.map((p) => p?.name)} onUndo={isAdmin && !local ? (id) => onAction('game:unshoot', { id }) : undefined} />}
      {!!game.stunts?.length && <StuntOverlay stunts={game.stunts} names={seats.map((p) => p?.name)} onCut={isAdmin && !local ? (id) => onAction('game:cutStunt', { id }) : undefined} />}
    </>
  );
  const partner = teams ? seats[partnerOf(mySeat)] : null;
  const partnerCovers = !!partner && !!seats[mySeat] && coverFor(game, seats, mySeat) === partner;
  const canCover = teams && !local && !meAway && !seats[mySeat]?.idle && !!partner && !partner.isBot && partner.away && game.phase !== 'over';
  const coverOn = canCover && partner.coveredBy === seats[mySeat]?.id;
  const endings = (
    <>
      {canCover && (
        <div className="away-banner cover" role="status">
          <div className="away-title">{partner.name} stepped away</div>
          <div className="away-sub">{coverOn ? "You're playing their turns." : 'A bot is playing their turns.'}</div>
          <button className="btn primary" onClick={() => onAction('game:cover', { on: !coverOn })}>
            {coverOn ? 'Let the bot play' : `Play for ${partner.name}`}
          </button>
        </div>
      )}
      {meAway && !local && game.phase !== 'over' && (
        <div className="away-banner" role="status">
          <div className="away-title">You stepped away</div>
          <div className="away-sub">
            {partnerCovers ? `${partner.name} is playing your turn for you.` : 'The bot is playing your turns.'}
            {!isAdmin && " If the bot plays more than half your turns this game, you won't earn rewards."}
          </div>
          <button className="btn primary big" onClick={() => setAway(false)}>
            I'm back
          </button>
        </div>
      )}

      {showOver && (
        <div ref={winScreenRef} className={`win-screen${room.activity ? ' activity-win-screen' : ''}${wideResults ? ' wide-win-screen' : ''}`}>
          {iWon && <Confetti />}
          <WinCard
            cardRef={winCardRef}
            activity={room.activity}
            wide={wideResults}
            local={local}
            game={game}
            seats={seats}
            mySeat={mySeat}
            nameOf={nameOf}
            isHost={isHost}
            coins={coins}
            rematch={room.rematch}
            playerId={playerId}
            onAction={onAction}
            onShop={onShop}
            onLeave={onLeave}
            onViewBoard={() => setShowOver(false)}
            onPlayerStats={onPlayerStats}
          />
        </div>
      )}

      {rulesOpen && <RulesModal onClose={() => setRulesOpen(false)} />}
    </>
  );

  if (phone) {
    const watching = (room.spectators || []).filter((p) => p.connected);
    const fromSheet = (fn) => () => {
      closeSheet();
      fn();
    };
    return (
      <div ref={hudRef} className={`hud phone-hud ${portrait ? 'portrait' : 'landscape'}`}>
        <div className="hud-top">
          {brandChip}
          {playersBar}
          <div className="hud-buttons">
            {devPicker}
            {cameraBtn}
          </div>
        </div>

        {overlays}
        {portrait && !startPending && !room.activity && game.phase !== 'over' && <RotateHint />}

        <div className="hud-bottom">
          <button type="button" className="icon-btn more-btn" onClick={() => setSheetOpen(true)} aria-label={local ? 'Menu' : 'Menu, chat and emotes'} aria-expanded={sheetOpen} title="Menu">
            <Dots />
            {unread > 0 && <span className="unread">{unread}</span>}
          </button>
          {actionPanel}
        </div>

        <HudSheet open={sheetOpen} onClose={closeSheet}>
          <div className="sheet-tools">
            {canAway && (
              <button type="button" className={`sheet-tool${meAway ? ' on' : ''}`} onClick={fromSheet(() => setAway(!meAway))} aria-pressed={meAway}>
                <Coffee />
                <span>{meAway ? "I'm back" : 'Step away'}</span>
              </button>
            )}
            <SettingsButton className="sheet-tool" label onReport={local ? undefined : onReport} />
            <button type="button" className="sheet-tool" onClick={fromSheet(() => setRulesOpen(true))}>
              <Help />
              <span>How to play</span>
            </button>
            {onLeave && (
              <button type="button" className="sheet-tool" onClick={fromSheet(onLeave)}>
                <Exit />
                <span>Leave</span>
              </button>
            )}
            {canEnd && (
              <button type="button" className="sheet-tool" onClick={fromSheet(endTable)}>
                <Exit />
                <span>End game</span>
              </button>
            )}
          </div>
          {!local && mySeat >= 0 && (
            <ReactionBar
              inline
              spam={spam}
              emotes={emotesOf(seats[mySeat])}
              onReact={(key) => {
                onAction('game:react', { key });
                if (!spam) closeSheet();
              }}
            />
          )}
          {!local && feed(true)}
          {watching.length > 0 && (
            <p className="sheet-spectators">
              <Eye /> {watching.map((p) => (p.id === playerId ? `${p.name} (you)` : p.name)).join(', ')}
            </p>
          )}
        </HudSheet>

        {endings}
      </div>
    );
  }

  return (
    <div ref={hudRef} className="hud">
      <div className="hud-top">
        {brandChip}
        {playersBar}
        <div className="hud-buttons">
          {devPicker}
          <SettingsButton onReport={local ? undefined : onReport} />
          {cameraBtn}
          <button className="icon-btn" onClick={() => setRulesOpen(tableSide || true)} aria-label="How to play" title="How to play">
            <Help />
          </button>
          {onLeave && (
            <button className="icon-btn" onClick={onLeave} aria-label="Leave game" title="Leave game">
              <Exit />
            </button>
          )}
          {canEnd && (
            <button className="icon-btn" onClick={endTable} aria-label="End game for everyone" title="End game for everyone">
              <Exit />
            </button>
          )}
        </div>
      </div>

      {overlays}

      <div className="hud-bottom">
        {local ? <span aria-hidden="true" /> : feed(false)}

        {actionPanel}
        <div className="hud-right">
          {!local && <Spectators spectators={room.spectators || []} playerId={playerId} />}
          {canAway && (
            <button className={`icon-btn away-btn${meAway ? ' on' : ''}`} onClick={() => setAway(!meAway)} aria-pressed={meAway} title={meAway ? "I'm back (B)" : 'Step away: the bot plays for you (B)'} aria-label={meAway ? "I'm back" : 'Step away'}>
              <Coffee />
            </button>
          )}
          {!local && mySeat >= 0 && <ReactionBar collapse={showOver} spam={spam} emotes={emotesOf(seats[mySeat])} onReact={(key) => onAction('game:react', { key })} />}
        </div>
      </div>

      {endings}
    </div>
  );
}
