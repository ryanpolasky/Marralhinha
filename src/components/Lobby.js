import React, { useState } from 'react';
import { SEATS, SEAT_COLORS } from '../game/geometry';
import RulesButton from './Rules';
import { Copy } from './Icons';
import { Nameplate, TagBadges } from './Economy';
import { Credit } from './About';

export default function Lobby({ room, playerId, onAction, onLeave }) {
  const [copied, setCopied] = useState(false);
  const isHost = room.hostId === playerId;
  const seated = room.seats.filter(Boolean).length;
  const inviteUrl = `${window.location.origin}${window.location.pathname}?room=${room.code}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt('Copy this invite link:', inviteUrl);
    }
  };

  return (
    <div className="screen">
      <div className="panel lobby">
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

        <div className="seats">
          {SEATS.map((s) => {
            const p = room.seats[s];
            const color = SEAT_COLORS[s];
            const mine = p && p.id === playerId;
            return (
              <div key={s} className={`seat${p ? ' filled' : ''}${mine ? ' mine' : ''}`} style={{ '--seat': color.main, '--seat-light': color.light }}>
                <span className="marble-dot" />
                <div className="seat-info">
                  <div className="seat-color">
                    {color.name}
                    {room.teams && seated === 4 && <span className="seat-team"> · Team {s % 2 === 0 ? 'A' : 'B'}</span>}
                  </div>
                  {p ? (
                    <Nameplate plate={p.cosmetics?.nameplate} className="seat-name">
                      {p.level && <span className="level-badge small">{p.level}</span>}
                      <span className="seat-name-text">{p.name}</span>
                      <TagBadges tags={p.tags} small />
                      {mine && <span className="badge">you</span>}
                      {p.id === room.hostId && <span className="badge gold">host</span>}
                      {p.isBot && <span className="badge">bot</span>}
                      {!p.isBot && !p.connected && <span className="badge warn">away</span>}
                    </Nameplate>
                  ) : (
                    <div className="seat-empty">Empty seat</div>
                  )}
                </div>
                <div className="seat-actions">
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
              </div>
            );
          })}
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
        <p className="lobby-mode">
          {seated < 2
            ? 'You need at least 2 players. Invite a friend or add a bot.'
            : !room.teams
              ? 'Every player for themselves.'
              : seated === 4
                ? 'Partners sit across from each other: Red & Yellow vs Blue & Green.'
                : "Teams need all 4 seats filled, otherwise it's free-for-all."}
        </p>

        {isHost && seated < 4 && (
          <button
            className="btn ghost block"
            onClick={async () => {
              for (const s of SEATS.filter((seat) => !room.seats[seat])) await onAction('lobby:addBot', { seat: s });
            }}
          >
            Fill empty seats with bots
          </button>
        )}
        {isHost ? (
          <button className={`btn primary big block${seated >= 2 ? ' play-btn' : ''}`} disabled={seated < 2} onClick={() => onAction('game:start')}>
            Start game
          </button>
        ) : (
          <div className="waiting">Waiting for the host to start…</div>
        )}

        <div className="row">
          {onLeave ? (
            <button className="btn link" onClick={onLeave}>
              Leave room
            </button>
          ) : (
            <span className="muted small-text">Everyone in this voice channel joins this table.</span>
          )}
          <RulesButton className="btn link" />
        </div>
      </div>
      <Credit className="corner" />
    </div>
  );
}
