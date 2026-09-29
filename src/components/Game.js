import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SEAT_COLORS } from '../game/geometry';
import { homeCount, partnerOf, ROLL_REVEAL_MS, START_WHEEL_SPIN_MS, TURN_MS } from '../game/moves';
import { sfx } from '../game/sound';
import { duckMusic } from '../game/music';
import { RulesModal } from './Rules';
import Confetti from './Confetti';
import { Help, Camera, Exit, DieIcon, Chat } from './Icons';
import { REACTIONS, REACTION_BY_KEY, computeAwards } from '../game/fun';
import { BOXES, ITEMS, skinKey } from '../game/catalog';
import { Coins, Coin, TagBadge, TagBadges } from './Economy';
import { SettingsButton } from './Settings';
import { useSettings } from '../game/settings';

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
  const helping = game.mode === 'teams' && homeCount(game.marbles[turn]) === 5;
  const helpText = helping ? ` · moving ${nameOf(partnerOf(turn))}'s marbles` : '';
  if (game.phase === 'over') return { title: 'Game over', sub: `${game.winners.map(nameOf).join(' & ')} won` };
  if (turn === mySeat) {
    if (seats[mySeat]?.idle) return { title: 'Your turn!', sub: "You ran out of time, so we've been playing for you. Make a move to take back over." };
    return game.phase === 'roll'
      ? { title: 'Your turn!', sub: `Roll the dice${helpText}` }
      : { title: `You rolled a ${game.die}`, sub: `Pick a glowing marble${helpText}${FINE_POINTER ? ' (or Tab, then Enter)' : ''}` };
  }
  const p = seats[turn];
  if (isAway(p)) return { title: `${p.name} is away`, sub: p.connected ? 'Playing for them until they’re back…' : 'A bot will play for them shortly…' };
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
const isAway = (p) => !!p && !p.isBot && (!p.connected || p.idle);

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

// Ring around the avatar that drains over the last TURN_MS of the turn and turns red for the final 5s
function TurnClock({ deadline }) {
  const remaining = useRef(Math.max(0, deadline - Date.now())).current;
  const from = (1 - Math.min(1, remaining / TURN_MS)) * 100;
  return (
    <svg
      className="turn-clock"
      viewBox="0 0 40 40"
      aria-hidden="true"
      style={{ '--from': from, '--dur': `${Math.min(remaining, TURN_MS)}ms`, '--delay': `${Math.max(0, remaining - TURN_MS)}ms`, '--urgent': `${Math.max(0, remaining - 5000)}ms` }}
    >
      <circle cx="20" cy="20" r="18.5" pathLength="100" />
    </svg>
  );
}

function PlayerChip({ seat, player, game, activeSeat, mySeat, reaction, clock }) {
  const color = SEAT_COLORS[seat];
  const home = homeCount(game.marbles[seat]);
  const isTurn = game.phase !== 'over' && activeSeat === seat;
  const sticker = reaction && REACTION_BY_KEY[reaction.key];
  const chipRef = useRef(null);
  const seatVars = { '--seat': color.main, '--seat-light': color.light, '--seat-dark': color.dark };
  return (
    <div
      ref={chipRef}
      className={`chip plate plate-${skinKey(player?.cosmetics?.nameplate) || 'basic'}${isTurn ? ' turn' : ''}${seat === mySeat ? ' me' : ''}${isAway(player) ? ' away' : ''}`}
      style={seatVars}
    >
      {sticker && (
        <Bubble key={reaction.id} anchor={chipRef} className="bubble" style={{ ...seatVars, '--sticker': sticker.color, '--tilt': `${sticker.tilt}deg` }}>
          {sticker.label}
        </Bubble>
      )}
      {reaction?.text && (
        <Bubble key={reaction.id} anchor={chipRef} fit className="bubble chat" style={{ ...seatVars, '--sticker': '#fff6e8', '--tilt': '0deg' }}>
          {reaction.text}
        </Bubble>
      )}
      <span className="avatar">
        {(player?.name || '?').slice(0, 1).toUpperCase()}
        {player?.level && <span className="avatar-level">{player.level}</span>}
        {clock && <TurnClock key={`${clock.key}:${clock.deadline}`} deadline={clock.deadline} />}
      </span>
      <div className="chip-body">
        <div className="chip-name">
          <span className="chip-name-text">{seat === mySeat ? 'You' : player?.name}</span>
          <TagBadges tags={player?.tags} small />
          {player?.isBot && <span className="badge">bot</span>}
          {isAway(player) && <span className="badge warn">away</span>}
        </div>
        <div className="pips" aria-label={`${home} of 5 marbles home`}>
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} className={i < home ? 'on' : ''} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ChatInput({ onSend }) {
  const [text, setText] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    const message = text.trim();
    if (!message) return;
    if (await onSend(message)) setText((current) => (current.trim() === message ? '' : current));
  };
  return (
    <form className="chat-form" onSubmit={submit}>
      <input value={text} onChange={(e) => setText(e.target.value)} maxLength={140} placeholder="Say something…" aria-label="Chat message" />
      <button className="chat-send" type="submit" disabled={!text.trim()} aria-label="Send message">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 12h15M13 6l6 6-6 6" />
        </svg>
      </button>
    </form>
  );
}

function ReactionBar({ onReact }) {
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
    if (!reward.leveledUp && !reward.luckyTag) return undefined;
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
            <b>You're the Luckiest!</b> More sixes than anyone, ever. The Fortune die is yours to keep.
          </span>
        </div>
      )}
      <div className="reward-total">
        <span>You earned</span>
        <Coins amount={total} />
      </div>
    </div>
  );
}

export default function Game({ room, playerId, reactions = [], rollPending = false, startPending = false, onDismissStart, onAction, onLeave, onResetView, onShop, coins = 0 }) {
  const { game, seats } = room;
  const mySeat = seats.findIndex((p) => p && p.id === playerId);
  const isHost = room.hostId === playerId;
  const [rulesOpen, setRulesOpen] = useState(false);
  const [feedOpen, setFeedOpen] = useState(false);
  const [chatSeenAt, setChatSeenAt] = useState(() => Date.now());
  const [showOver, setShowOver] = useState(game.phase === 'over');

  const nameOf = useCallback((s) => (s === mySeat ? 'You' : seats[s]?.name || SEAT_COLORS[s].name), [mySeat, seats]);
  const announcements = useAnnouncements(game, mySeat, nameOf);

  const activeSeat = rollPending ? game.lastRoll.seat : game.turn;
  const myTurn = activeSeat === mySeat && game.phase !== 'over';
  const canRoll = myTurn && game.phase === 'roll' && !rollPending && !startPending;
  const roll = useCallback(() => canRoll && onAction('game:roll'), [canRoll, onAction]);
  const { autoRoll } = useSettings();

  useEffect(() => {
    if (!autoRoll || !canRoll) return undefined;
    const t = setTimeout(roll, 650);
    return () => clearTimeout(t);
  }, [autoRoll, canRoll, roll, game.lastRoll?.t]);

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
  const clock = deadline && game.phase !== 'over' && !rollPending ? { key: clockKey, deadline } : null;
  const myClock = clock && game.turn === mySeat;

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
    <PlayerChip key={s} seat={s} player={seats[s]} game={game} activeSeat={activeSeat} mySeat={mySeat} reaction={reactions.find((r) => r.seat === s)} clock={clock && game.turn === s ? clock : null} />
  );
  const log = (rollPending ? game.log.filter((entry) => entry.chat || entry.t < game.lastRoll.t) : game.log).slice().reverse();
  const unread = feedOpen ? 0 : log.filter((entry) => entry.chat && entry.seat !== mySeat && entry.t > chatSeenAt).length;
  const iWon = game.winners?.includes(mySeat);

  return (
    <div className="hud">
      <div className="hud-top">
        <div className="brand-chip">
          <span className="brand">Marralhinha</span>
          {!room.activity && <span className="room-pill">{room.code}</span>}
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
          <SettingsButton />
          <button className="icon-btn" onClick={onResetView} aria-label="Reset camera" title="Reset camera">
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
        <div className={`feed${feedOpen ? ' open' : ''}`}>
          <button
            className="feed-toggle"
            onClick={() => {
              setFeedOpen((o) => !o);
              setChatSeenAt(Date.now());
            }}
          >
            {feedOpen ? 'Hide' : 'Chat & log'}
            {unread > 0 && <span className="unread">{unread}</span>}
          </button>
          <div className="feed-list">
            {(feedOpen ? log : log.slice(0, 4)).map((entry, i) => (
              <div
                key={`${entry.t}-${i}`}
                className={`feed-entry${entry.chat ? ' chat' : ''}`}
                style={{ '--seat': entry.seat === null ? '#8aa' : SEAT_COLORS[entry.seat].main }}
              >
                {entry.chat && <b className="chat-name">{entry.seat === mySeat ? 'You' : entry.name}</b>}
                {entry.text}
              </div>
            ))}
          </div>
          {mySeat >= 0 ? <ChatInput onSend={(text) => onAction('game:chat', { text })} /> : <div className="chat-spectator">Chat is for players at the table. You can still read along.</div>}
        </div>

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
        <div className="hud-right">{mySeat >= 0 && <ReactionBar onReact={(key) => onAction('game:react', { key })} />}</div>
      </div>

      {showOver && (
        <div className="win-screen">
          {iWon && <Confetti />}
          <div className={`panel win-card${iWon ? ' won' : ''}`}>
            <div className="win-kicker">{iWon ? 'Victory!' : 'Game over'}</div>
            <h2>{iWon ? (game.winners.length > 1 ? 'You and your partner win!' : 'You win!') : `${game.winners.map(nameOf).join(' & ')} win${game.winners.length === 1 ? 's' : ''}`}</h2>
            <div className="win-marbles">
              {game.winners.map((s) => (
                <span key={s} className="marble-dot big" style={{ '--seat': SEAT_COLORS[s].main, '--seat-light': SEAT_COLORS[s].light }} />
              ))}
            </div>
            <Rewards reward={myReward} onRevealed={() => setRevealed(true)} />
            <Awards game={game} nameOf={nameOf} />
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
