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
  ['lucky', 'Luckiest', (u) => `${u.luckyMonths}×`, (u) => `last won ${new Date(`${u.luckyLast}-01T00:00:00Z`).toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })}`],
  ['unlucky', 'Unluckiest', (u) => `${u.unluckyMonths}×`, (u) => `last lost ${new Date(`${u.unluckyLast}-01T00:00:00Z`).toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })}`],
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
  const poised = tab === 'lucky' ? data?.luckyNow : tab === 'unlucky' ? data?.unluckyNow : null;
  const daysLeft = poised && Math.max(1, Math.ceil((poised.endsAt - Date.now()) / 86400000));

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={`panel modal board-modal${tab === 'unlucky' ? ' unlucky' : ''}`} role="dialog" aria-modal="true" aria-label="Leaderboards" onClick={(e) => e.stopPropagation()}>
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
          {poised && (
            <button
              type="button"
              className={`board-row board-poised${poised.id === meId ? ' me' : ''}`}
              onClick={() => onPlayer?.(poised)}
              title={`See ${poised.name}'s stats`}
            >
              <span className="board-poised-kicker">Poised to {tab === 'lucky' ? 'win' : 'lose'} {poised.monthName.split(' ')[0]}</span>
              <span className="board-name">
                {poised.id === meId ? 'You' : poised.name}
                <TagBadges tags={poised.tags} badges={poised.badges} small />
              </span>
              <span className="board-detail muted">
                {poised.sixes}/{poised.rolls} sixes · {daysLeft} day{daysLeft === 1 ? '' : 's'} left
              </span>
              <b className="board-value">{(poised.rate * 100).toFixed(1)}%</b>
            </button>
          )}
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
                <TagBadges tags={u.tags} badges={u.badges} small />
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
