import React, { useCallback, useEffect, useRef, useState } from 'react';
import { SEAT_COLORS } from '../game/geometry';
import { homeCount, partnerOf, ROLL_REVEAL_MS } from '../game/moves';
import { sfx, isMuted, setMuted, onMuteChange } from '../game/sound';
import { RulesModal } from './Rules';
import Confetti from './Confetti';
import { SoundOn, SoundOff, Help, Camera, Exit, DieIcon, Chat } from './Icons';
import { REACTIONS, REACTION_BY_KEY, computeAwards } from '../game/fun';
import { BOXES, skinKey } from '../game/catalog';
import { Coins, Coin } from './Economy';

const BOX_PRICE = BOXES[0].price;

function useMuted() {
  const [muted, set] = useState(isMuted());
  useEffect(() => onMuteChange(set), []);
  return muted;
}

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
    if (game.phase === 'over' && p.phase !== 'over') setTimeout(game.winners.includes(mySeat) ? sfx.win : sfx.lose, 1200);
  }, [game, mySeat, nameOf, push]);

  return items;
}

function statusFor(game, seats, mySeat, nameOf, rollPending) {
  if (rollPending) {
    const roller = game.lastRoll.seat;
    return { title: roller === mySeat ? 'Rolling…' : `${nameOf(roller)} is rolling…`, sub: 'Fingers crossed…' };
  }
  const turn = game.turn;
  const helping = game.mode === 'teams' && homeCount(game.marbles[turn]) === 5;
  const helpText = helping ? ` · moving ${nameOf(partnerOf(turn))}'s marbles` : '';
  if (game.phase === 'over') return { title: 'Game over', sub: `${game.winners.map(nameOf).join(' & ')} won` };
  if (turn === mySeat) {
    return game.phase === 'roll'
      ? { title: 'Your turn!', sub: `Roll the dice${helpText}` }
      : { title: `You rolled a ${game.die}`, sub: `Pick a glowing marble${helpText}` };
  }
  const p = seats[turn];
  if (p && !p.isBot && !p.connected) return { title: `${p.name} is away`, sub: 'A bot will play for them shortly…' };
  return game.phase === 'roll'
    ? { title: `${nameOf(turn)}'s turn`, sub: `Rolling…${helpText}` }
    : { title: `${nameOf(turn)} rolled a ${game.die}`, sub: `Thinking…${helpText}` };
}

function PlayerChip({ seat, player, game, activeSeat, mySeat, reaction }) {
  const color = SEAT_COLORS[seat];
  const home = homeCount(game.marbles[seat]);
  const isTurn = game.phase !== 'over' && activeSeat === seat;
  const sticker = reaction && REACTION_BY_KEY[reaction.key];
  return (
    <div
      className={`chip plate plate-${skinKey(player?.cosmetics?.nameplate) || 'basic'}${isTurn ? ' turn' : ''}${seat === mySeat ? ' me' : ''}${player && !player.isBot && !player.connected ? ' away' : ''}`}
      style={{ '--seat': color.main, '--seat-light': color.light, '--seat-dark': color.dark }}
    >
      {sticker && (
        <div key={reaction.id} className="bubble" style={{ '--sticker': sticker.color, '--tilt': `${sticker.tilt}deg` }}>
          {sticker.label}
        </div>
      )}
      {reaction?.text && (
        <div key={reaction.id} className="bubble chat" style={{ '--sticker': '#fff6e8', '--tilt': '0deg' }}>
          {reaction.text}
        </div>
      )}
      <span className="avatar">
        {(player?.name || '?').slice(0, 1).toUpperCase()}
        {player?.level && <span className="avatar-level">{player.level}</span>}
      </span>
      <div className="chip-body">
        <div className="chip-name">
          {seat === mySeat ? 'You' : player?.name}
          {player?.isBot && <span className="badge">bot</span>}
          {player && !player.isBot && !player.connected && <span className="badge warn">away</span>}
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

function Rewards({ reward }) {
  const [shownLines, setShownLines] = useState(0);
  useEffect(() => {
    if (!reward) return undefined;
    const timers = reward.lines.map((_, i) =>
      setTimeout(() => {
        setShownLines(i + 1);
        sfx.coins();
      }, 500 + i * 280)
    );
    return () => timers.forEach(clearTimeout);
  }, [reward]);
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
      <div className="reward-total">
        <span>You earned</span>
        <Coins amount={total} />
      </div>
    </div>
  );
}

export default function Game({ room, playerId, reactions = [], rollPending = false, onAction, onLeave, onResetView, onShop, coins = 0 }) {
  const { game, seats } = room;
  const mySeat = seats.findIndex((p) => p && p.id === playerId);
  const isHost = room.hostId === playerId;
  const muted = useMuted();
  const [rulesOpen, setRulesOpen] = useState(false);
  const [feedOpen, setFeedOpen] = useState(false);
  const [chatSeenAt, setChatSeenAt] = useState(() => Date.now());
  const [showOver, setShowOver] = useState(game.phase === 'over');

  const nameOf = useCallback((s) => (s === mySeat ? 'You' : seats[s]?.name || SEAT_COLORS[s].name), [mySeat, seats]);
  const announcements = useAnnouncements(game, mySeat, nameOf);

  const activeSeat = rollPending ? game.lastRoll.seat : game.turn;
  const myTurn = activeSeat === mySeat && game.phase !== 'over';
  const canRoll = myTurn && game.phase === 'roll' && !rollPending;
  const roll = useCallback(() => canRoll && onAction('game:roll'), [canRoll, onAction]);

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

  const status = statusFor(game, seats, mySeat, nameOf, rollPending);
  const teams = game.mode === 'teams';
  const chip = (s) => <PlayerChip key={s} seat={s} player={seats[s]} game={game} activeSeat={activeSeat} mySeat={mySeat} reaction={reactions.find((r) => r.seat === s)} />;
  const log = (rollPending ? game.log.filter((entry) => entry.chat || entry.t < game.lastRoll.t) : game.log).slice().reverse();
  const unread = feedOpen ? 0 : log.filter((entry) => entry.chat && entry.seat !== mySeat && entry.t > chatSeenAt).length;
  const iWon = game.winners?.includes(mySeat);

  return (
    <div className="hud">
      <div className="hud-top">
        <div className="brand-chip">
          <span className="brand">Marralhinha</span>
          {!room.activity && <span className="room-pill">{room.code}</span>}
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
          <button className="icon-btn" onClick={() => setMuted(!muted)} aria-label={muted ? 'Unmute' : 'Mute'} title={muted ? 'Unmute' : 'Mute'}>
            {muted ? <SoundOff /> : <SoundOn />}
          </button>
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
          {mySeat >= 0 && <ChatInput onSend={(text) => onAction('game:chat', { text })} />}
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
            <button className={`roll-btn${canRoll ? ' ready' : ''}`} disabled={!canRoll} onClick={roll} title="Roll (Space)">
              <DieIcon />
              <span>Roll</span>
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
            <Rewards reward={game.rewards?.[mySeat]} />
            <Awards game={game} nameOf={nameOf} />
            {coins >= BOX_PRICE && (
              <button className="btn secondary block open-box-cta" onClick={onShop}>
                You can afford a box! Open one
              </button>
            )}
            <div className="row center">
              {isHost ? (
                <button className="btn primary big" onClick={() => onAction('game:rematch')}>
                  Play again
                </button>
              ) : (
                <span className="muted">Waiting for the host to start another round…</span>
              )}
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
      )}

      {rulesOpen && <RulesModal onClose={() => setRulesOpen(false)} />}
    </div>
  );
}
