import React from 'react';
import { SEAT_COLORS } from '../game/geometry';

export const ago = (t) => {
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return new Date(t).toLocaleDateString();
};

// The lifetime numbers we track per account — shared between your profile and other players' cards
export function StatGrid({ stats }) {
  const winRate = stats.games ? Math.round((stats.wins / stats.games) * 100) : 0;
  const tiles = [
    ['Games', stats.games],
    ['Wins', stats.wins],
    ['Win rate', `${winRate}%`],
    ['Captures', stats.captures],
    ['Times captured', stats.captured || 0],
    ['Sixes', stats.sixes || 0],
    ['Shortcuts', stats.shortcuts || 0],
    ['Marbles home', stats.home || 0],
    ['Chests opened', stats.boxes || 0],
  ];
  return (
    <div className="profile-stats">
      {tiles.map(([label, value]) => (
        <div key={label} className="profile-stat">
          <b>{typeof value === 'number' ? value.toLocaleString() : value}</b>
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}

// Compact per-match rows: result, mode, who was at the table and when
export function MatchHistory({ matches, meId }) {
  if (!matches) return <div className="muted small-text center match-empty">Loading games…</div>;
  if (!matches.length) return <div className="muted small-text center match-empty">No games yet — match history shows up after the first game.</div>;
  return (
    <div className="match-list">
      {matches.map((m) => (
        <div key={m.id} className={`match${m.won ? ' won' : ''}`}>
          <span className={`match-result${m.won ? ' won' : ''}`}>{m.won ? 'Won' : 'Lost'}</span>
          <div className="match-body">
            <div className="match-title">
              <b>{m.mode === 'teams' ? '2v2 teams' : 'Free for all'}</b>
              {m.bots > 0 && <span className="muted"> · vs bots</span>}
            </div>
            <div className="match-players">
              {m.seats.map((s) => (
                <span key={s.seat} className={`match-player${s.won ? ' won' : ''}${s.userId && s.userId === meId ? ' me' : ''}`} style={{ '--seat': SEAT_COLORS[s.seat]?.main }}>
                  <i className="match-dot" aria-hidden="true" />
                  {s.name || 'Bot'}
                  {s.won && <b className="match-crown" title="Won">✓</b>}
                </span>
              ))}
            </div>
          </div>
          <span className="match-when muted">{ago(m.endedAt)}</span>
        </div>
      ))}
    </div>
  );
}
