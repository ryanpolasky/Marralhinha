import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import useFitPanel from './useFitPanel';
import { SEATS, SEAT_COLORS } from '../game/geometry';
import { COLOR_PALETTE, MIN_LOBBY_DIST, colorDistance, rawTripletFromHex } from '../game/colors';
import { saveCustomColor, useSettings } from '../game/settings';
import { useRainbow } from '../game/rainbow';
import { TURN_SECONDS } from '../game/moves';
import { sfx } from '../game/sound';
import RulesButton from './Rules';
import { Bug, Copy, Crown, Lock } from './Icons';
import { Nameplate, TagBadges } from './Economy';
import { Credit } from './About';
import { ask } from './Dialog';
import Marquee from './Marquee';
import Feed from './Feed';
import HexInput from './HexInput';
import BOARDS from '../shared/boards.json';

// Short-lived "Rui joined" / "Ana left" notices, with a sound, when other people come and go
function useSeatEvents(room, playerId) {
  const [events, setEvents] = useState([]);
  const prev = useRef(null);
  useEffect(() => {
    const humans = new Map([...room.seats, ...(room.spectators || [])].filter((p) => p && !p.isBot).map((p) => [p.id, p.name]));
    const before = prev.current;
    prev.current = humans;
    if (!before) return;
    const joined = [...humans].filter(([id]) => !before.has(id) && id !== playerId).map(([, name]) => `${name} joined`);
    const left = [...before].filter(([id]) => !humans.has(id) && id !== playerId).map(([, name]) => `${name} left`);
    const fresh = [...joined, ...left].map((text) => ({ id: `${Date.now()}-${Math.random()}`, text, joined: joined.includes(text) }));
    if (!fresh.length) return;
    if (joined.length) sfx.pop();
    else sfx.click();
    setEvents((list) => [...list, ...fresh].slice(-3));
    fresh.forEach((event) => setTimeout(() => setEvents((list) => list.filter((e) => e.id !== event.id)), 3500));
  }, [room.seats, room.spectators, playerId]);
  return events;
}

// Host-only slider: 15-45 seconds per turn, with "no limit" at the far right. Sends once the thumb settles
function TurnTimer({ seconds, isHost, onChange }) {
  const serverIndex = Math.max(0, TURN_SECONDS.indexOf(seconds));
  const [index, setIndex] = useState(serverIndex);
  useEffect(() => setIndex(serverIndex), [serverIndex]);
  useEffect(() => {
    if (index === serverIndex) return undefined;
    const t = setTimeout(() => onChange(TURN_SECONDS[index]), 250);
    return () => clearTimeout(t);
  }, [index]); // eslint-disable-line react-hooks/exhaustive-deps
  const value = TURN_SECONDS[index];
  const label = value === null ? 'No limit' : `${value}s per turn`;
  return (
    <div className={`turn-timer${isHost ? '' : ' readonly'}`} style={{ '--pct': index / (TURN_SECONDS.length - 1) }}>
      <div className="turn-timer-head">
        <span>Turn timer</span>
        <b>{label}</b>
      </div>
      <input
        type="range"
        min="0"
        max={TURN_SECONDS.length - 1}
        step="1"
        value={index}
        disabled={!isHost}
        onChange={(e) => setIndex(Number(e.target.value))}
        aria-label="Turn timer"
        aria-valuetext={label}
        title={isHost ? 'How long each player gets to roll or move before the game plays for them' : 'The host picks the turn timer'}
      />
      <div className="turn-timer-scale" aria-hidden="true">
        <span>15s</span>
        <span>45s</span>
        <span>∞</span>
      </div>
    </div>
  );
}

function useAnchoredPop(anchor, onClose) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  useLayoutEffect(() => {
    const place = () => {
      const el = ref.current;
      if (!el || !anchor?.isConnected) return;
      const a = anchor.getBoundingClientRect();
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const left = Math.max(8, Math.min(a.left, vw - w - 8));
      const below = a.bottom + 6;
      const top = below + h <= vh - 8 || a.top - h - 6 < 8 ? Math.min(below, vh - h - 8) : a.top - h - 6;
      setPos({ left, top: Math.max(8, top) });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [anchor]);
  useEffect(() => {
    const onDown = (e) => !ref.current?.contains(e.target) && !anchor?.contains(e.target) && onClose();
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [anchor, onClose]);
  return [ref, pos];
}

export function SeatColorPopover({ seat, room, anchor, owner, dev, onPick, onClose }) {
  const [ref, pos] = useAnchoredPop(anchor, onClose);
  const [note, setNote] = useState(null);
  const { painterCustoms } = useSettings();
  const colors = SEATS.map((s) => room.colors?.[s] || room.seats[s]?.color || SEAT_COLORS[s]);
  const current = colors[seat];
  const classic = SEAT_COLORS[seat];
  const isClassic = !current.rainbow && current.main.toLowerCase() === classic.main.toLowerCase();
  const names = SEATS.map((s) => room.seats[s]?.name?.trim() || '');
  const tag = (s) => (names.some((n, o) => o !== s && n && n[0]?.toUpperCase() === names[s][0]?.toUpperCase()) ? names[s].slice(0, 2) : names[s].slice(0, 1));
  const others = SEATS.filter((s) => s !== seat && room.seats[s]).map((s) => ({ name: room.seats[s].name, tag: tag(s), color: colors[s] }));
  const unlockedBy = (room.painter?.owners || []).map((s) => room.seats[s]?.name).filter(Boolean)[0];
  const pick = async (spec, steal = false) => {
    sfx.click();
    setNote(null);
    if (spec?.startsWith?.('#')) saveCustomColor(spec);
    const res = await onPick(spec, steal);
    if (res?.nudged) setNote(`Nudged to ${res.color?.main?.toUpperCase() || 'a nearby shade'} so it doesn't blend in`);
    else if (res && (spec === null || !spec.startsWith('#'))) onClose();
  };
  return createPortal(
    <div ref={ref} className="paint-pop" role="dialog" aria-label="Pick your colour" style={pos ? { left: pos.left, top: pos.top } : { visibility: 'hidden' }}>
      <div className="paint-pop-head">
        <b>{dev ? `Paint ${room.seats[seat]?.name || classic.name}` : 'Your colour'}</b>
        <span>{dev ? 'Dev' : owner ? 'Painter Pack' : unlockedBy ? `Thanks to ${unlockedBy}` : 'Painter Pack'}</span>
      </div>
      <div className="paint-grid" role="radiogroup" aria-label="Colours">
        {COLOR_PALETTE.map((swatch) => {
          const selected = !current.rainbow && current.main.toLowerCase() === swatch.main.toLowerCase();
          const near = selected || dev ? null : others.map((o) => ({ ...o, d: colorDistance(swatch.main, o.color.main) })).filter((o) => o.d < MIN_LOBBY_DIST).sort((a, b) => a.d - b.d)[0];
          const taken = near && near.color.main.toLowerCase() === swatch.main.toLowerCase();
          const title = !near ? swatch.name : owner ? `${swatch.name}: take it from ${near.name}` : taken ? `${swatch.name}: ${near.name} has it` : `${swatch.name}: too close to ${near.name}'s ${near.color.name}`;
          return (
            <button
              key={swatch.id}
              type="button"
              role="radio"
              aria-checked={selected}
              className={`seat-swatch${selected ? ' on' : ''}${near ? ' clash' : ''}`}
              style={{ '--sw': swatch.main, '--sw-light': swatch.light, '--sw-dark': swatch.dark }}
              title={title}
              aria-label={title}
              disabled={!!near && !owner}
              onClick={() => pick(swatch.id, !!near)}
            >
              {taken ? <span className="seat-swatch-owner">{near.tag}</span> : near && <span className="seat-swatch-slash" />}
            </button>
          );
        })}
      </div>
      {(owner || dev) && painterCustoms?.length > 0 && (
        <div className="paint-grid paint-saved" aria-label="Saved colours">
          {painterCustoms.map((hex) => {
            const sw = rawTripletFromHex(hex);
            const selected = current.main.toLowerCase() === hex;
            return (
              <button key={hex} type="button" className={`seat-swatch${selected ? ' on' : ''}`} style={{ '--sw': sw.main, '--sw-light': sw.light, '--sw-dark': sw.dark }} title={hex.toUpperCase()} aria-label={`Saved ${hex.toUpperCase()}`} onClick={() => pick(hex)} />
            );
          })}
        </div>
      )}
      <div className="paint-pop-foot">
        <button type="button" className="paint-chip" disabled={isClassic} onClick={() => pick(null)}>
          <span className="marble-dot mini" style={{ '--seat': classic.main, '--seat-light': classic.light }} />
          {classic.name}
        </button>
        {dev && (
          <button type="button" className={`paint-chip${current.rainbow ? ' on' : ''}`} onClick={() => pick('rainbow')}>
            <span className="marble-dot mini rainbow" />
            Rainbow
          </button>
        )}
        {owner || dev ? (
          <label className={`paint-chip hex${current.custom ? ' on' : ''}`} title="Pick any colour">
            <span className="marble-dot mini" style={{ '--seat': current.main, '--seat-light': current.light }} />
            {current.custom ? current.main.toUpperCase() : 'Custom'}
            <HexInput value={current.main} onCommit={(hex) => pick(hex)} aria-label="Custom colour" />
          </label>
        ) : (
          <span className="paint-chip locked" title="Custom colours come with the Painter Pack">
            <Lock />
            Custom
          </span>
        )}
      </div>
      {note && <p className="paint-note">{note}</p>}
    </div>,
    document.body
  );
}

export default function Lobby({ room, playerId, isAdmin, onAction, onLeave, onReport, onPlayerStats }) {
  const [copied, setCopied] = useState(false);
  const [swapFrom, setSwapFrom] = useState(null);
  const [paint, setPaint] = useState(null);
  const closePaint = useCallback(() => setPaint(null), []);
  const [busy, setBusy] = useState(false);
  const [feedOpen, setFeedOpen] = useState(false);
  const [chatSeenAt, setChatSeenAt] = useState(() => Date.now());
  const [screenRef, panelRef] = useFitPanel(room.activity, room, { reserveBar: true, bottom: 100 });
  const events = useSeatEvents(room, playerId);
  const liveColors = useRainbow(SEATS.map((s) => room.colors?.[s] || room.seats[s]?.color || SEAT_COLORS[s]));
  const act = async (fn) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };
  const isHost = room.hostId === playerId;
  const mySeat = room.seats.findIndex((p) => p?.id === playerId);
  const spectator = mySeat === -1;
  const seated = room.seats.filter(Boolean).length;
  const offered = room.swapOffers?.find((offer) => offer.fromId === playerId);
  const incoming = room.swapOffers?.filter((offer) => offer.toId === playerId) || [];
  const inviteUrl = `${window.location.origin}${window.location.pathname}?room=${room.code}`;
  const chatEntries = [...(room.chat || [])].reverse();
  const isMine = (entry) => (entry.from ? entry.from === playerId : entry.seat === mySeat);
  const unread = feedOpen ? 0 : chatEntries.filter((entry) => entry.chat && !isMine(entry) && entry.t > chatSeenAt).length;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      ask({
        title: 'Copy this invite link',
        body: <input className="dialog-input" readOnly value={inviteUrl} autoFocus onFocus={(e) => e.target.select()} aria-label="Invite link" />,
        confirm: 'Done',
        cancel: null,
      });
    }
  };

  return (
    <div ref={screenRef} className={`screen${room.activity ? ' activity-lobby-screen' : ''}`}>
      {/* Outside the panel: its backdrop-filter would otherwise trap this fixed overlay inside it */}
      <div className="lobby-events" aria-live="polite">
        {events.map((e) => (
          <span key={e.id} className={`lobby-event${e.joined ? ' joined' : ''}`}>
            {e.text}
          </span>
        ))}
      </div>
      <div ref={panelRef} className={`panel lobby${room.activity ? ' activity-lobby' : ''}`}>
        <div className="lobby-table">
        {room.activity ? (
          <div className="lobby-head">
            <div>
              <div className="kicker">Discord table</div>
              <div className="room-code small">Voice channel</div>
            </div>
          </div>
        ) : (
          <div className="lobby-head">
            <div>
              <div className="kicker">Room code</div>
              <div className="room-code">{room.code}</div>
            </div>
            <button className="btn secondary" onClick={copy}>
              <Copy /> {copied ? 'Copied!' : 'Invite link'}
            </button>
          </div>
        )}

        {spectator && <p className="lobby-notice">You're spectating. If a seat opens up before the game starts, tap Sit to join.{isAdmin && ' You can also pick two occupied seats to swap as Dev.'}</p>}
        {offered && (
          <div className="lobby-notice">
            Swap offered to {room.seats[offered.to]?.name}. Waiting for their answer.
            <button className="btn tiny ghost" onClick={() => onAction('lobby:cancelSwap')}>Cancel</button>
          </div>
        )}
        {incoming.map((offer) => {
          const toCol = room.colors?.[offer.to] || room.seats[offer.to]?.color || SEAT_COLORS[offer.to];
          const fromCol = room.colors?.[offer.from] || room.seats[offer.from]?.color || SEAT_COLORS[offer.from];
          return (
            <div key={offer.fromId} className="lobby-notice">
              {room.seats[offer.from]?.name} wants to trade your {toCol.name} seat for {fromCol.name}.
              <button className="btn tiny secondary" onClick={() => onAction('lobby:respondSwap', { fromId: offer.fromId, accept: true })}>Accept</button>
              <button className="btn tiny ghost" onClick={() => onAction('lobby:respondSwap', { fromId: offer.fromId, accept: false })}>Decline</button>
            </div>
          );
        })}
        <div className="seats">
          {SEATS.map((s) => {
            const p = room.seats[s];
            const color = liveColors[s];
            const mine = p && p.id === playerId;
            const viewable = p && !p.isBot && p.userId && !mine && onPlayerStats;
            const canPaint = isAdmin || (mine && !!room.painter?.on);
            const drawerOpen = canPaint && paint?.seat === s;
            const toggleColor = (e) => {
              sfx.click();
              const anchor = e.currentTarget.closest('.seat');
              setPaint((cur) => (cur?.seat === s ? null : { seat: s, anchor }));
            };
            return (
              <div
                key={s}
                className={`seat${p ? ' filled' : ''}${mine ? ' mine' : ''}${viewable ? ' viewable' : ''}${canPaint ? ' paintable' : ''}${drawerOpen ? ' color-open' : ''}`}
                style={{ '--seat': color.main, '--seat-light': color.light, ...(viewable ? { cursor: 'pointer' } : null) }}
                onClick={viewable ? (e) => !e.target.closest('button') && onPlayerStats(p) : undefined}
              >
                {canPaint ? (
                  <button type="button" className="seat-dot seat-dot-btn" onClick={toggleColor} title={mine ? 'Pick your colour' : `Paint ${p?.name || SEAT_COLORS[s].name}'s seat`} aria-label={mine ? 'Pick your colour' : `Paint ${p?.name || SEAT_COLORS[s].name}'s seat`} aria-expanded={drawerOpen}>
                    <span className="marble-dot" />
                    {p && p.id === room.hostId && <Crown />}
                  </button>
                ) : (
                  <span className="seat-dot">
                    <span className="marble-dot" />
                    {p && p.id === room.hostId && <Crown />}
                  </span>
                )}
                <div className="seat-info">
                  <div className="seat-color">
                    {canPaint ? (
                      <button type="button" className="seat-color-btn" onClick={toggleColor} aria-expanded={drawerOpen}>
                        <span>{color.name}</span>
                        <span className="seat-color-caret" aria-hidden="true">▾</span>
                      </button>
                    ) : (
                      color.name
                    )}
                    {room.teams && seated === 4 && <span className="seat-team"> · Team {s % 2 === 0 ? 'A' : 'B'}</span>}
                  </div>
                  {p ? (
                    <Nameplate plate={p.cosmetics?.nameplate} className="seat-name">
                      {p.level && <span className="level-badge small">{p.level}</span>}
                      <Marquee className="seat-name-text">{p.name}</Marquee>
                      <TagBadges tags={p.tags} small />
                      {p.isBot && <span className="badge">bot</span>}
                      {!p.isBot && !p.connected && <span className="badge warn">away</span>}
                    </Nameplate>
                  ) : (
                    <div className="seat-empty">Empty seat</div>
                  )}
                </div>
                <div className="seat-actions">
                  {p && isAdmin && spectator && (
                    <button className="btn tiny secondary" onClick={() => {
                      if (swapFrom === null || swapFrom === s) setSwapFrom(swapFrom === s ? null : s);
                      else {
                        onAction('lobby:forceSwap', { fromSeat: swapFrom, seat: s });
                        setSwapFrom(null);
                      }
                    }}>
                      {swapFrom === s ? 'Cancel' : swapFrom === null ? 'Select seat' : 'Swap here'}
                    </button>
                  )}
                  {/* Bots don't need to agree: swap straight into their seat, or take it outright as a spectator */}
                  {p && p.isBot && !isAdmin && (
                    <button className="btn tiny secondary" onClick={() => onAction('lobby:takeBotSeat', { seat: s })}>
                      Take seat
                    </button>
                  )}
                  {mine && (
                    <button className="btn tiny ghost" onClick={() => onAction('lobby:spectate')}>
                      Spectate
                    </button>
                  )}
                  {p && !mine && mySeat >= 0 && (isAdmin || !p.isBot) && (
                    <button className="btn tiny secondary" onClick={() => onAction(isAdmin ? 'lobby:forceSwap' : 'lobby:offerSwap', { seat: s })} disabled={!isAdmin && offered?.to === s}>
                      {isAdmin ? 'Take seat' : offered?.to === s ? 'Offered' : 'Offer swap'}
                    </button>
                  )}
                  {p && isHost && p.isBot && (
                    <button className="btn tiny ghost" onClick={() => onAction('lobby:removeBot', { seat: s })}>
                      Remove
                    </button>
                  )}
                  {!p && (
                    <>
                      <button className="btn tiny secondary" onClick={() => onAction('lobby:seat', { seat: s })}>
                        Sit
                      </button>
                      {isHost && (
                        <button className="btn tiny ghost" onClick={() => onAction('lobby:addBot', { seat: s })}>
                          + Bot
                        </button>
                      )}
                    </>
                  )}
                </div>
                {drawerOpen && (
                  <SeatColorPopover
                    seat={s}
                    room={room}
                    anchor={paint.anchor}
                    owner={!!room.painter?.owners?.includes(s)}
                    dev={isAdmin && !mine}
                    onClose={closePaint}
                    onPick={(color, steal) => onAction(mine ? 'game:pickColor' : 'game:setColor', mine ? { color, steal } : { seat: s, color })}
                  />
                )}
              </div>
            );
          })}
        </div>

        {!!room.spectators?.length && <p className="lobby-spectators">Spectating: {room.spectators.map((p) => p.name).join(', ')}</p>}
        </div>
        <div className="lobby-controls">
        <div className="mode-picker" role="radiogroup" aria-label="Board variant">
          {Object.values(BOARDS).map((spec) => (
            <button
              key={spec.id}
              role="radio"
              aria-checked={(room.variant || 'classic') === spec.id}
              className={`mode-option${(room.variant || 'classic') === spec.id ? ' on' : ''}`}
              disabled={!isHost}
              onClick={() => (room.variant || 'classic') !== spec.id && onAction('lobby:variant', { variant: spec.id })}
            >
              {spec.label}
            </button>
          ))}
        </div>
        <div className="mode-picker" role="radiogroup" aria-label="Game mode">
          {[
            [false, 'Free-for-all'],
            [true, 'Teams 2v2'],
          ].map(([value, label]) => (
            <button
              key={label}
              role="radio"
              aria-checked={room.teams === value}
              className={`mode-option${room.teams === value ? ' on' : ''}`}
              disabled={!isHost}
              onClick={() => room.teams !== value && onAction('lobby:teams', { teams: value })}
            >
              {label}
            </button>
          ))}
        </div>
        <TurnTimer seconds={room.turnSeconds === undefined ? 30 : room.turnSeconds} isHost={isHost} onChange={(seconds) => onAction('lobby:turnTime', { seconds })} />
        <p className="lobby-mode">
          {(room.variant || 'classic') === 'blitz' ? 'Blitz: 3 marbles, smaller board, about a third of the time. Pays 60%.' : 'Classic: 5 marbles, full board, full rewards.'}
        </p>
        <p className="lobby-mode">
          {seated < 2
            ? 'You need at least 2 players. Invite a friend or add a bot.'
            : !room.teams
              ? 'Every player for themselves.'
              : seated === 4
                ? (() => {
                    const c = (i) => ((room.colorMode !== 'classic' && (room.colors?.[i] || room.seats[i]?.color)) || SEAT_COLORS[i]).name;
                    return `Partners sit across from each other: ${c(0)} & ${c(2)} vs ${c(1)} & ${c(3)}.`;
                  })()
                : "Teams need all 4 seats filled, otherwise it's free-for-all."}
        </p>

        {isHost && seated < 4 && (
          <button
            className="btn ghost block"
            disabled={busy}
            onClick={() =>
              act(async () => {
                for (const s of SEATS.filter((seat) => !room.seats[seat])) await onAction('lobby:addBot', { seat: s });
              })
            }
          >
            Fill empty seats with bots
          </button>
        )}
        {isHost ? (
          <button className={`btn primary big block${seated >= 2 ? ' play-btn' : ''}`} disabled={seated < 2 || busy} onClick={() => act(() => onAction('game:start'))}>
            {busy ? 'Starting…' : 'Start game'}
          </button>
        ) : (
          <div className="waiting">{spectator ? 'Watching this table. Waiting for the host to start…' : 'Waiting for the host to start…'}</div>
        )}

        <div className="row">
          {onLeave ? (
            <button className="btn link" onClick={onLeave}>
              Leave room
            </button>
          ) : spectator ? (
            <span className="muted small-text">Everyone in this voice channel joins this table.</span>
          ) : (
            <button className="btn link" onClick={() => onAction('lobby:spectate')}>
              Spectate instead
            </button>
          )}
          <RulesButton className="btn link" />
        </div>
        </div>
      </div>
      <Feed
        entries={chatEntries}
        open={feedOpen}
        onToggle={() => {
          setFeedOpen((o) => !o);
          setChatSeenAt(Date.now());
        }}
        unread={unread}
        isMine={isMine}
        onSend={(text, channel) => onAction('game:chat', { text, channel })}
        lifted
      />
      <div className="screen-foot">
        <button type="button" className="home-report" onClick={onReport} title="Report a bug or suggest a feature">
          <Bug /> Report & ideas
        </button>
        <Credit className="corner" />
      </div>
    </div>
  );
}
