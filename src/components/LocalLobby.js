import React, { useState } from 'react';
import useFitPanel from './useFitPanel';
import { SEATS, SEAT_COLORS } from '../game/geometry';
import RulesButton from './Rules';
import { Credit } from './About';
import BOARDS from '../shared/boards.json';

const KINDS = [
  ['human', 'Player'],
  ['bot', 'Bot'],
  ['empty', 'Empty'],
];
const kindOf = (p) => (!p ? 'empty' : p.isBot ? 'bot' : 'human');

// Where each colour sits when the camera is locked: Red bottom, Blue right, Yellow top, Green left
const SIDES = ['bottom', 'right', 'top', 'left'];
const FINE_POINTER = typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: fine)').matches && !window.matchMedia('(any-pointer: coarse)').matches;

export default function LocalLobby({ room, onAction, onBack }) {
  const [screenRef, panelRef] = useFitPanel(false, room, { reserveBar: true, bottom: 100 });
  const [error, setError] = useState('');
  const seated = room.seats.filter(Boolean).length;
  const humans = room.seats.filter((p) => p && !p.isBot).length;
  const variant = room.variant || 'classic';

  const start = async () => {
    try {
      await onAction('game:start');
      setError('');
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div ref={screenRef} className="screen">
      <div ref={panelRef} className="panel lobby local-lobby">
        <div className="lobby-table">
          <div className="lobby-head">
            <div>
              <div className="kicker">One device</div>
              <div className="room-code small">Pass &amp; play</div>
            </div>
          </div>
          <div className="seats">
            {SEATS.map((s) => {
              const p = room.seats[s];
              const color = SEAT_COLORS[s];
              return (
                <div key={s} className={`seat${p ? ' filled' : ''}`} style={{ '--seat': color.main, '--seat-light': color.light }}>
                  <span className="seat-dot">
                    <span className="marble-dot" />
                  </span>
                  <div className="seat-info">
                    <div className="seat-color">
                      {color.name}
                      {room.table && <span className="seat-team"> · {SIDES[s]} side</span>}
                      {room.teams && seated === 4 && <span className="seat-team"> · Team {s % 2 === 0 ? 'A' : 'B'}</span>}
                    </div>
                    {p && !p.isBot ? (
                      <input className="local-name" value={p.name} maxLength={16} aria-label={`${color.name} player name`} onChange={(e) => onAction('local:rename', { seat: s, name: e.target.value })} />
                    ) : (
                      <div className={p ? 'seat-name' : 'seat-empty'}>{p ? `${p.name} (bot)` : 'Empty seat'}</div>
                    )}
                  </div>
                  <div className="seat-actions local-kinds" role="radiogroup" aria-label={`${color.name} seat`}>
                    {KINDS.map(([kind, label]) => (
                      <button key={kind} role="radio" aria-checked={kindOf(p) === kind} className={`btn tiny ${kindOf(p) === kind ? 'secondary' : 'ghost'}`} onClick={() => kindOf(p) !== kind && onAction('local:seat', { seat: s, kind })}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="lobby-controls">
          <div className="mode-picker" role="radiogroup" aria-label="Board variant">
            {Object.values(BOARDS).map((spec) => (
              <button key={spec.id} role="radio" aria-checked={variant === spec.id} className={`mode-option${variant === spec.id ? ' on' : ''}`} onClick={() => variant !== spec.id && onAction('lobby:variant', { variant: spec.id })}>
                {spec.label}
              </button>
            ))}
          </div>
          <div className="mode-picker" role="radiogroup" aria-label="Game mode">
            {[
              [false, 'Free-for-all'],
              [true, 'Teams 2v2'],
            ].map(([value, label]) => (
              <button key={label} role="radio" aria-checked={room.teams === value} className={`mode-option${room.teams === value ? ' on' : ''}`} onClick={() => room.teams !== value && onAction('lobby:teams', { teams: value })}>
                {label}
              </button>
            ))}
          </div>
          <div className="mode-picker" role="radiogroup" aria-label="Seating">
            {[
              [false, 'Pass the device'],
              [true, 'Round the table'],
            ].map(([value, label]) => (
              <button key={label} role="radio" aria-checked={room.table === value} className={`mode-option${room.table === value ? ' on' : ''}`} onClick={() => room.table !== value && onAction('local:table', { table: value })}>
                {label}
              </button>
            ))}
          </div>
          <div className="lobby-notes">
            {room.table ? (
              <>
                <p className="lobby-mode">Lay the device flat. Everyone sits on the side that matches their colour and the camera stays put.</p>
                {FINE_POINTER && <p className="lobby-notice tight">Heads up: this mode is built for phones and tablets lying flat on a table. It'll feel awkward on a desktop or laptop.</p>}
              </>
            ) : (
              <p className="lobby-mode">The board turns to face whoever's turn it is. Pass the device along when the turn changes.</p>
            )}
            <p className="lobby-mode">
              {seated < 2 ? 'You need at least 2 seats filled.' : !humans ? 'Seat at least one player.' : !room.teams ? 'Every player for themselves. No Marbucks or stats on this mode.' : seated === 4 ? 'Partners sit across from each other: Red & Yellow vs Blue & Green.' : "Teams need all 4 seats filled, otherwise it's free-for-all."}
            </p>
          </div>
          {error && <p className="lobby-notice">{error}</p>}
          <button className={`btn primary big block${seated >= 2 && humans ? ' play-btn' : ''}`} disabled={seated < 2 || !humans} onClick={start}>
            Start game
          </button>
          <div className="row">
            <button className="btn link" onClick={onBack}>
              Back
            </button>
            <RulesButton className="btn link" />
          </div>
        </div>
      </div>
      <Credit className="corner" />
    </div>
  );
}
