import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SEAT_COLORS } from '../game/geometry';
import { coveringTurn, homeCount, partnerOf, ROLL_REVEAL_MS, START_WHEEL_SPIN_MS } from '../game/moves';
import { sfx } from '../game/sound';
import { duckMusic } from '../game/music';
import { RulesModal } from './Rules';
import Confetti from './Confetti';
import { Help, Camera, Exit, DieIcon, Chat, Eye, BoardIcon, Coffee, Bug } from './Icons';
import { REACTIONS, REACTION_BY_KEY, computeAwards } from '../game/fun';
import { BOXES, ITEMS, skinKey, itemsForSlot } from '../game/catalog';
import { Coins, Coin, ItemThumb, TagBadge, TagBadges } from './Economy';
import { SettingsButton } from './Settings';
import { useSettings, updateSettings } from '../game/settings';
import useFitPanel from './useFitPanel';

const BOX_PRICE = BOXES[0].price;

function useAnnouncements(game, mySeat, nameOf) {
  const [items, setItems] = useState([]);
  const prev = useRef(null);
  const latest = useRef(game);
  latest.current = game;
  const timers = useRef([]);

  const push = useCallback((title, sub, tone = 'info', delay = 0, sound = null, stillValid = null) => {
    const t1 = setTimeout(() => {
      if (stillValid && !stillValid(latest.current)) return;
      const id = `${Date.now()}-${Math.random()}`;
      setItems((list) => [...list.slice(-1), { id, title, sub, tone }]);
      if (sound) sound();
      const t2 = setTimeout(() => setItems((list) => list.filter((i) => i.id !== id)), 1900);
      timers.current.push(t2);
    }, delay);
    timers.current.push(t1);
  }, []);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  useEffect(() => {
    const p = prev.current;
    prev.current = game;
    if (!p) return;
    const roll = game.lastRoll;
    if (roll && roll.t !== p.lastRoll?.t && roll.seat === mySeat) {
      if (roll.noMoves) push(`No moves`, `with a ${roll.die}${roll.die === 6 ? ', roll again!' : ''}`, 'muted', ROLL_REVEAL_MS);
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
      push('Your turn!', 'Roll the dice', 'turn', justRolled ? ROLL_REVEAL_MS + 150 : mv && mv.t !== p.lastMove?.t ? 600 : 0, sfx.turn, (g) => g.phase === 'roll' && g.turn === mySeat && g.lastRoll?.t === rollKey);
    }
    if (game.phase === 'over' && p.phase !== 'over' && mySeat >= 0) {
      setTimeout(() => {
        duckMusic(3500);
        (game.winners.includes(mySeat) ? sfx.win : sfx.lose)();
      }, 1200);
    }
  }, [game, mySeat, nameOf, push]);

  return items;
}

function statusFor(game, seats, mySeat, nameOf, rollPending, startPending) {
  if (startPending) {
    return game.pick.reason === 'wheel' ? { title: 'Who starts?', sub: 'The wheel decides the first roll' } : { title: `${nameOf(game.pick.seat)} start${game.pick.seat === mySeat ? '' : 's'}`, sub: "Winner's privilege: first roll and their board" };
  }
  if (rollPending) {
    const roller = game.lastRoll.seat;
    return { title: roller === mySeat ? 'Rolling…' : `${nameOf(roller)} is rolling…`, sub: 'Fingers crossed…' };
  }
  const turn = game.turn;
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
    if (seats[mySeat]?.away) return { title: 'Your turn (you stepped away)', sub: "The bot's got it. Hit I'm back or roll to take over." };
    if (seats[mySeat]?.idle) return { title: 'Your turn!', sub: "You ran out of time, so we've been playing for you. Make a move to take back over." };
    return game.phase === 'roll'
      ? { title: 'Your turn!', sub: `Roll the dice${helpText}` }
      : { title: `You rolled a ${game.die}`, sub: `Pick a glowing marble${helpText}${FINE_POINTER ? ` (or 1-${game.spec?.marbles || 5} / Tab, then Enter)` : ''}` };
  }
  const p = seats[turn];
  if (p?.away && !p.isBot) {
    const cover = game.mode === 'teams' ? seats[partnerOf(turn)] : null;
    const covered = cover && !cover.isBot && cover.connected && !cover.away && !cover.idle;
    return { title: `${p.name} stepped away`, sub: covered ? `${nameOf(partnerOf(turn))} ${partnerOf(turn) === mySeat ? 'are' : 'is'} playing for them…` : 'A bot is playing for them…' };
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
const isAway = (p) => !!p && !p.isBot && (!p.connected || p.idle || p.away);

// Speech bubbles live in <body> and follow their chip every frame, so the scrolling (clipped) mobile
// player bar can't hide them. Chat bubbles are capped to the chip's width so neighbours never overlap.
function Bubble({ anchor, className, style, fit = false, children }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    let frame;
    const place = () => {
      const chip = anchor.current;
      const el = ref.current;
      if (chip && el) {
        const r = chip.getBoundingClientRect();
        if (fit) el.style.maxWidth = `${r.width}px`;
        const half = el.offsetWidth / 2;
        el.style.left = `${Math.min(Math.max(r.left + r.width / 2, half + 8), window.innerWidth - half - 8)}px`;
        el.style.top = `${r.bottom + 12}px`;
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

function PlayerChip({ seat, player, game, activeSeat, mySeat, reaction, clock, viewing, onView, onStats }) {
  const color = SEAT_COLORS[seat];
  const home = homeCount(game.marbles[seat]);
  const isTurn = game.phase !== 'over' && activeSeat === seat;
  const sticker = reaction && REACTION_BY_KEY[reaction.key];
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
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), e.stopPropagation(), onView())}
      className={`chip plate plate-${skinKey(player?.cosmetics?.nameplate) || 'basic'}${isTurn ? ' turn' : ''}${seat === mySeat ? ' me' : ''}${isAway(player) ? ' away' : ''}${viewing ? ' viewing' : ''}`}
      style={seatVars}
    >
      {sticker && (
        <Bubble key={reaction.id} anchor={chipRef} className="bubble" style={{ ...seatVars, '--sticker': sticker.color, '--tilt': `${sticker.tilt}deg` }}>
          {sticker.label}
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
        {player?.level && <span className="avatar-level">{player.level}</span>}
      </span>
      <div className="chip-body">
        <div className="chip-name">
          <span className="chip-name-text">{seat === mySeat ? 'You' : player?.name}</span>
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

// Dev-only: swap the whole table's board mid-game
function BoardPicker({ current, onPick }) {
  const [open, setOpen] = useState(false);
  const boards = itemsForSlot('board');
  return (
    <div className="board-picker">
      <button className="icon-btn" onClick={() => setOpen((o) => !o)} aria-label="Change the table board (Dev)" title="Change the table board (Dev)" aria-expanded={open}>
        <BoardIcon />
      </button>
      {open && (
        <>
          <div className="board-picker-backdrop" onClick={() => setOpen(false)} />
          <div className="board-picker-pop" role="menu" aria-label="Table board">
            <div className="board-picker-head">
              <span>Table board</span>
              <TagBadge tag="dev" small />
            </div>
            <div className="board-picker-grid">
              {boards.map((b) => (
                <button key={b.id} role="menuitemradio" aria-checked={current === b.id} className={`board-option${current === b.id ? ' on' : ''}`} onClick={() => onPick(b.id)} title={b.desc}>
                  <ItemThumb itemId={b.id} />
                  <span>{b.name}</span>
                </button>
              ))}
            </div>
            <button className="btn tiny ghost block" onClick={() => onPick(null)}>
              Back to the starter's board
            </button>
          </div>
        </>
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

// In 2v2 the chat has a Team / All channel: Tab (while typing) or the pill switches it, and
// "/t message" or "/a message" sends one message to a channel without switching
function ChatInput({ onSend, teams = false }) {
  const [text, setText] = useState('');
  const [channel, setChannel] = useState('all');
  const active = teams ? channel : 'all';
  const toggle = () => setChannel((c) => (c === 'team' ? 'all' : 'team'));
  const submit = async (e) => {
    e.preventDefault();
    let message = text.trim();
    let target = active;
    const shortcut = teams && message.match(/^\/(t|a)\s+(.+)/i);
    if (shortcut) {
      target = shortcut[1].toLowerCase() === 't' ? 'team' : 'all';
      message = shortcut[2].trim();
    }
    if (!message) return;
    if (await onSend(message, target)) setText((current) => (current.trim() === text.trim() ? '' : current));
  };
  return (
    <form className={`chat-form${active === 'team' ? ' team' : ''}`} onSubmit={submit}>
      {teams && (
        <button type="button" className={`chat-channel ${active}`} onClick={toggle} title="Switch between team and all chat (Tab)" aria-label={`Chatting to ${active === 'team' ? 'your team' : 'everyone'}, click to switch`}>
          {active === 'team' ? 'Team' : 'All'}
        </button>
      )}
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (teams && e.key === 'Tab') {
            e.preventDefault();
            toggle();
          }
        }}
        maxLength={280}
        placeholder={active === 'team' ? 'Message your team… (Tab: all)' : teams ? 'Message everyone… (Tab: team)' : 'Say something…'}
        aria-label={active === 'team' ? 'Team chat message' : 'Chat message'}
      />
      <button className="chat-send" type="submit" disabled={!text.trim()} aria-label="Send message">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 12h15M13 6l6 6-6 6" />
        </svg>
      </button>
    </form>
  );
}

// The chat/log feed. Game-event lines are hidden until "Show logs" is on; the live announcements
// above the board still narrate the important moments, so nothing critical is lost when they're hidden
export function Feed({ entries, open, onToggle, showLogs, onToggleLogs, unread, isMine, teams, onSend }) {
  const shown = open ? entries : entries.slice(0, 4);
  return (
    <div className={`feed${open ? ' open' : ''}`}>
      <div className="feed-tools">
        <button type="button" className="feed-toggle" onClick={onToggle} aria-expanded={open} aria-controls="feed-list">
          {open ? 'Hide' : 'Chat & log'}
          {unread > 0 && <span className="unread">{unread}</span>}
        </button>
        <button type="button" className={`feed-logs${showLogs ? ' on' : ''}`} onClick={onToggleLogs} aria-pressed={showLogs} title="Show moves, rolls and captures in the chat">
          {showLogs ? 'Hide logs' : 'Show logs'}
        </button>
      </div>
      <div className="feed-list" id="feed-list">
        {shown.map((entry, i) => (
          <div
            key={`${entry.t}-${i}`}
            className={`feed-entry${entry.chat ? ' chat' : ''}${entry.team ? ' team' : ''}`}
            style={{ '--seat': entry.seat === null ? '#8aa' : SEAT_COLORS[entry.seat].main }}
          >
            {entry.chat && (
              <b className="chat-name">
                {entry.team && <span className="chat-team-tag">Team</span>}
                {isMine(entry) ? 'You' : entry.name}
                {entry.spectator && <span className="chat-watching"> · watching</span>}{' '}
              </b>
            )}
            {entry.text}
          </div>
        ))}
      </div>
      <ChatInput teams={teams} onSend={onSend} />
    </div>
  );
}

export function ReactionBar({ onReact }) {
  const [open, setOpen] = useState(false);
  const [cooling, setCooling] = useState(false);
  const send = (key) => {
    if (cooling) return;
    onReact(key);
    setOpen(false);
    setCooling(true);
    setTimeout(() => setCooling(false), 1200);
  };
  return (
    <div className={`reactions${open ? ' open' : ''}`}>
      <button className="icon-btn reactions-toggle" onClick={() => setOpen((o) => !o)} aria-label="Reactions" title="Reactions">
        <Chat />
      </button>
      <div className="stickers">
        {REACTIONS.map((r) => (
          <button key={r.key} className="sticker" disabled={cooling} title={r.hint} style={{ '--sticker': r.color, '--tilt': `${r.tilt}deg` }} onClick={() => send(r.key)}>
            {r.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Awards({ game, nameOf }) {
  const awards = computeAwards(game);
  if (!awards.length) return null;
  return (
    <div className="awards">
      {awards.map((a, i) => (
        <div key={a.title} className="award" style={{ '--seat': SEAT_COLORS[a.seat].main, '--seat-light': SEAT_COLORS[a.seat].light, '--i': i }}>
          <span className="award-medal">{a.value}</span>
          <div>
            <div className="award-title">{a.title}</div>
            <div className="award-who">
              {nameOf(a.seat)} · {a.blurb}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Rewards({ reward, onRevealed }) {
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
      {reward.lines.slice(0, shownLines).map((line) => (
        <div key={line.label} className={`reward-line${line.levelUp ? ' level-up' : ''}`}>
          <span>{line.label}</span>
          <span className="reward-amount">
            +{line.amount} <Coin size={15} />
          </span>
        </div>
      ))}
      {reward.note && <div className="reward-note">{reward.note}</div>}
      {done && reward.leveledUp && (
        <div className="reward-celebrate reward-levelup">
          <span className="level-badge">{reward.level}</span>
          <span>
            <b>Level up!</b> You're now level {reward.level}.
          </span>
        </div>
      )}
      {done && reward.luckyTag && (
        <div className="reward-celebrate reward-lucky">
          <TagBadge tag="lucky" small />
          <span>
            <b>You're the Luckiest!</b> Your last 10 games have the highest luck score. Hold the title for three total days to unlock the Golden Die.
          </span>
        </div>
      )}
      {done && reward.goldenDie && (
        <div className="reward-celebrate reward-lucky">
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

export default function Game({ room, playerId, reactions = [], teamLog = [], isAdmin = false, cameraOff = false, rollPending = false, startPending = false, onDismissStart, onAction, onLeave, onResetView, onShop, onReport, onPlayerStats, coins = 0, viewSeat = 0, onViewSeat }) {
  const { game, seats } = room;
  const mySeat = seats.findIndex((p) => p && p.id === playerId);
  const isHost = room.hostId === playerId;
  const [rulesOpen, setRulesOpen] = useState(false);
  const [feedOpen, setFeedOpen] = useState(false);
  const [chatSeenAt, setChatSeenAt] = useState(() => Date.now());
  const [showOver, setShowOver] = useState(game.phase === 'over');
  const [winScreenRef, winCardRef] = useFitPanel(room.activity && showOver, room, { maxWidth: 920 });

  const nameOf = useCallback((s) => (s === mySeat ? 'You' : seats[s]?.name || SEAT_COLORS[s].name), [mySeat, seats]);
  const announcements = useAnnouncements(game, mySeat, nameOf);

  const activeSeat = rollPending ? game.lastRoll.seat : game.turn;
  const covering = coveringTurn(game, seats, mySeat);
  const myTurn = (activeSeat === mySeat || (covering && !rollPending)) && game.phase !== 'over';
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
  const canRoll = myTurn && game.phase === 'roll' && !rollPending && !startPending;
  const roll = useCallback(() => canRoll && onAction('game:roll'), [canRoll, onAction]);
  const { autoRoll, showLogs } = useSettings();

  useEffect(() => {
    // Auto-roll never plays for you while you've stepped away (that would bring you "back")
    if (!autoRoll || !canRoll || meAway) return undefined;
    const t = setTimeout(roll, 650);
    return () => clearTimeout(t);
  }, [autoRoll, canRoll, roll, game.lastRoll?.t, meAway]);

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

  const [revealed, setRevealed] = useState(false);
  useEffect(() => setRevealed(false), [game.phase]);
  const myReward = game.rewards?.[mySeat];

  const status = statusFor(game, seats, mySeat, nameOf, rollPending, startPending);
  const teams = game.mode === 'teams';
  const chip = (s) => (
    <PlayerChip
      key={s}
      seat={s}
      player={seats[s]}
      game={game}
      activeSeat={activeSeat}
      mySeat={mySeat}
      reaction={reactions.find((r) => r.seat === s)}
      clock={clock && game.turn === s ? clock : null}
      viewing={viewSeat === s && s !== Math.max(mySeat, 0)}
      onView={() => onViewSeat?.(s)}
      onStats={seats[s]?.userId && s !== mySeat ? () => onPlayerStats?.(seats[s]) : undefined}
    />
  );
  const shared = rollPending ? game.log.filter((entry) => entry.chat || entry.t < game.lastRoll.t) : game.log;
  const log = [...shared, ...teamLog].sort((a, b) => a.t - b.t).reverse();
  const entries = showLogs ? log : log.filter((entry) => entry.chat);
  const isMine = (entry) => (entry.from ? entry.from === playerId : entry.seat === mySeat);
  const unread = feedOpen ? 0 : log.filter((entry) => entry.chat && !isMine(entry) && entry.t > chatSeenAt).length;
  const iWon = game.winners?.includes(mySeat);

  return (
    <div className="hud">
      <div className="hud-top">
        <div className="brand-chip">
          <span className="brand">Marralhinha</span>
          {!room.activity && <RoomCode code={room.code} />}
          {mySeat < 0 && <span className="badge">Spectating</span>}
          <Coins amount={coins} className="hud-coins" />
        </div>

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

        <div className="hud-buttons">
          {isAdmin && <BoardPicker current={game.boardOverride || seats[game.boardSeat ?? -1]?.cosmetics?.board || null} onPick={(item) => onAction('game:setBoard', { item })} />}
          <SettingsButton />
          {onReport && (
            <button className="icon-btn" onClick={onReport} aria-label="Report a bug or suggest a feature" title="Report a bug or suggest a feature">
              <Bug />
            </button>
          )}
          <button className={`icon-btn${cameraOff ? ' attention' : ''}`} onClick={onResetView} aria-label="Reset camera" title="Reset camera">
            <Camera />
          </button>
          <button className="icon-btn" onClick={() => setRulesOpen(true)} aria-label="How to play" title="How to play">
            <Help />
          </button>
          {onLeave && (
            <button className="icon-btn" onClick={onLeave} aria-label="Leave game" title="Leave game">
              <Exit />
            </button>
          )}
        </div>
      </div>

      {startPending && <StartIntro key={game.pick.t} game={game} seats={seats} mySeat={mySeat} nameOf={nameOf} onDismiss={onDismissStart} />}

      <div className="announcements" aria-live="polite">
        {announcements.map((a) => (
          <div key={a.id} className={`announce ${a.tone}`}>
            <div className="announce-title">{a.title}</div>
            {a.sub && <div className="announce-sub">{a.sub}</div>}
          </div>
        ))}
      </div>

      <div className="hud-bottom">
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
        />

        <div className={`action-panel${myTurn ? ' mine' : ''}`} style={{ '--seat': SEAT_COLORS[activeSeat].main }}>
          {game.phase === 'move' && !rollPending && (
            <span key={game.lastRoll?.t} className={`roll-badge${game.die === 6 ? ' six' : ''}`} style={{ '--seat': SEAT_COLORS[game.turn].main }}>
              {game.die}
            </span>
          )}
          <div className="action-text">
            <div className="action-title">{status.title}</div>
            <div className="action-sub">{status.sub}</div>
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
        <div className="hud-right">
          <Spectators spectators={room.spectators || []} playerId={playerId} />
          {mySeat >= 0 && game.phase !== 'over' && (
            <button className={`icon-btn away-btn${meAway ? ' on' : ''}`} onClick={() => setAway(!meAway)} aria-pressed={meAway} title={meAway ? "I'm back (B)" : 'Step away: the bot plays for you (B)'} aria-label={meAway ? "I'm back" : 'Step away'}>
              <Coffee />
            </button>
          )}
          {mySeat >= 0 && <ReactionBar onReact={(key) => onAction('game:react', { key })} />}
        </div>
      </div>

      {meAway && game.phase !== 'over' && (
        <div className="away-banner" role="status">
          <div className="away-title">You stepped away</div>
          <div className="away-sub">
            {teams && seats[partnerOf(mySeat)] && !seats[partnerOf(mySeat)].isBot && seats[partnerOf(mySeat)].connected && !seats[partnerOf(mySeat)].away
              ? `${seats[partnerOf(mySeat)].name} is playing your turns.`
              : 'The bot is playing your turns.'}
            {!isAdmin && " If the bot plays more than half your turns this game, you won't earn rewards."}
          </div>
          <button className="btn primary big" onClick={() => setAway(false)}>
            I'm back
          </button>
        </div>
      )}

      {showOver && (
        <div ref={winScreenRef} className={`win-screen${room.activity ? ' activity-win-screen' : ''}`}>
          {iWon && <Confetti />}
          <div ref={winCardRef} className={`panel win-card${iWon ? ' won' : ''}${room.activity ? ' activity-win-card' : ''}`}>
            <div className="win-intro">
            <div className="win-kicker">{iWon ? 'Victory!' : 'Game over'}</div>
            <h2>{iWon ? (game.winners.length > 1 ? 'You and your partner win!' : 'You win!') : `${game.winners.map(nameOf).join(' & ')} win${game.winners.length === 1 ? 's' : ''}`}</h2>
            <div className="win-marbles">
              {game.winners.map((s) => (
                <span key={s} className="marble-dot big" style={{ '--seat': SEAT_COLORS[s].main, '--seat-light': SEAT_COLORS[s].light }} />
              ))}
            </div>
            </div>
            <div className="win-payout"><Rewards reward={myReward} onRevealed={() => setRevealed(true)} /></div>
            <div className="win-social">
            <Awards game={game} nameOf={nameOf} />
            {onPlayerStats && (
              <div className="win-players">
                {game.active.map((s) => {
                  const p = seats[s];
                  const human = p && !p.isBot && p.userId && s !== mySeat;
                  return (
                    <button
                      key={s}
                      type="button"
                      className={`win-player${human ? '' : ' quiet'}`}
                      style={{ '--seat': SEAT_COLORS[s].main, '--seat-light': SEAT_COLORS[s].light }}
                      disabled={!human}
                      onClick={() => human && onPlayerStats(p)}
                      title={human ? `See ${p.name}'s stats` : undefined}
                    >
                      <span className="marble-dot" />
                      <span className="win-player-name">{s === mySeat ? 'You' : p?.name || SEAT_COLORS[s].name}</span>
                      <TagBadges tags={p?.tags} small />
                      {p?.isBot && <span className="badge">bot</span>}
                      {game.winners?.includes(s) && <span className="win-player-won">won</span>}
                    </button>
                  );
                })}
              </div>
            )}
            </div>
            <div className="win-actions">
              {isHost ? (
                <button className="btn primary big block play-btn" onClick={() => onAction('game:rematch')}>
                  Play again
                </button>
              ) : (
                <div className="waiting">Waiting for the host to start another round…</div>
              )}
              {/* Wait for the payout to count in, so the offer reflects what you just earned */}
              {(revealed || !myReward) && coins >= BOX_PRICE && (
                <button className="btn secondary block open-box-cta" onClick={onShop}>
                  You can afford {Math.floor(coins / BOX_PRICE) > 1 ? `${Math.floor(coins / BOX_PRICE)} chests` : 'a chest'}! Open one
                </button>
              )}
              <div className={`win-minor${onLeave ? '' : ' single'}`}>
                <button className="btn ghost" onClick={() => setShowOver(false)}>
                  View board
                </button>
                {onLeave && (
                  <button className="btn ghost" onClick={onLeave}>
                    Leave
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {rulesOpen && <RulesModal onClose={() => setRulesOpen(false)} />}
    </div>
  );
}
