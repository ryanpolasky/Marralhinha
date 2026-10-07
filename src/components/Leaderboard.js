import React, { useEffect, useState } from 'react';
import { api } from '../net/api';
import { TagBadges } from './Economy';
import { Close, Trophy } from './Icons';

const BOARDS = [
  ['wins', 'Wins', (u) => `${u.wins.toLocaleString()} wins`, (u) => `${u.games} games`],
  ['winRate', 'Win rate', (u) => `${Math.round((u.wins / u.games) * 100)}%`, (u) => `${u.wins} / ${u.games} games`],
  ['sixes', 'Sixes', (u) => u.sixes.toLocaleString(), () => 'all-time sixes rolled'],
  ['captures', 'Captures', (u) => u.captures.toLocaleString(), () => 'marbles sent home'],
  ['home', 'Marbles home', (u) => u.home.toLocaleString(), () => 'marbles brought home'],
  ['level', 'Level', (u) => `Lv ${u.level}`, (u) => `${u.xp.toLocaleString()} XP`],
];

// One tab per stat; rows click through to that player's card when onPlayer is wired up
export default function Leaderboard({ meId, boards, onClose, onPlayer }) {
  const [data, setData] = useState(boards || null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('wins');

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (boards) return undefined;
    let cancelled = false;
    api('/leaderboard')
      .then((res) => !cancelled && setData(res.boards))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [boards]);

  const board = BOARDS.find(([key]) => key === tab);
  const rows = data?.[tab] || [];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="panel modal board-modal" role="dialog" aria-modal="true" aria-label="Leaderboards" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>
            <Trophy /> Leaderboards
          </h2>
          <button className="icon-close" onClick={onClose} aria-label="Close">
            <Close />
          </button>
        </div>

        <div className="board-tabs" role="tablist" aria-label="Leaderboard stat">
          {BOARDS.map(([key, label]) => (
            <button key={key} role="tab" aria-selected={tab === key} className={`board-tab${tab === key ? ' on' : ''}`} onClick={() => setTab(key)}>
              {label}
            </button>
          ))}
        </div>

        {error && <p className="muted center">{error}</p>}
        {!data && !error && <p className="muted center">Loading…</p>}

        <div className="board-list" role="tabpanel">
          {rows.map((u, i) => (
            <button
              key={u.id}
              type="button"
              className={`board-row${u.id === meId ? ' me' : ''}`}
              onClick={() => onPlayer?.(u)}
              title={`See ${u.name}'s stats`}
            >
              <span className={`board-rank${i < 3 ? ` top${i + 1}` : ''}`}>{i + 1}</span>
              <span className="board-name">
                {u.id === meId ? 'You' : u.name}
                <TagBadges tags={u.tags} small />
              </span>
              <span className="board-detail muted">{board[3](u)}</span>
              <b className="board-value">{board[2](u)}</b>
            </button>
          ))}
          {data && rows.length === 0 && <p className="muted center match-empty">Nobody here yet, be the first!</p>}
        </div>
      </div>
    </div>
  );
}
