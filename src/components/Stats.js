import React, { useState } from 'react';
import { SEAT_COLORS } from '../game/geometry';
import { TagBadge } from './Economy';

export const ago = (t) => {
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return new Date(t).toLocaleDateString();
};

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

const pct = (rate) => `${(rate * 100).toFixed(1)}%`;
const left = (t) => {
  const s = Math.max(0, (t - Date.now()) / 1000);
  return s >= 86400 ? `${Math.floor(s / 86400)}d left` : s >= 3600 ? `${Math.floor(s / 3600)}h left` : `${Math.ceil(s / 60)}m left`;
};

export function LuckiestPanel({ lucky, onClaim }) {
  if (!lucky?.month) return null;
  const { best, leader, holder } = lucky;
  const owned = lucky.setOwned?.length || 0;
  const status = holder ? `Leading ${lucky.monthName}` : best ? `${pct(leader.rate - best.rate)} behind ${leader.name}` : `No qualifying game yet · ${lucky.minRolls}+ of your own rolls`;
  return (
    <details className={`profile-lucky${holder ? ' holder' : ''}`}>
      <summary className="profile-lucky-head">
        <TagBadge tag="lucky" small />
        <span className="profile-lucky-overview">
          <span>{holder ? 'Current holder' : best ? `Best this month ${pct(best.rate)}` : 'Not in the race yet'}</span>
          <span className="profile-lucky-track" role="progressbar" aria-label="Your best six rate against this month's leader" aria-valuemin={0} aria-valuemax={100} aria-valuenow={leader && best ? Math.round((best.rate / leader.rate) * 100) : 0}>
            <span style={{ width: `${leader && best ? (best.rate / leader.rate) * 100 : 0}%` }} />
          </span>
        </span>
        {onClaim && lucky.pending?.length > 0 && <button type="button" className="btn primary small profile-lucky-claim" onClick={(e) => { e.preventDefault(); onClaim(); }}>Claim reward</button>}
        <span className="profile-lucky-chevron" aria-hidden="true" />
      </summary>
      <div className="profile-lucky-details">
        <div className="profile-lucky-status">{status}</div>
        <div className="profile-lucky-metrics">
          <div><b>{best ? pct(best.rate) : '–'}</b><span>Best game <small>· {pct(lucky.expectedRate)} expected</small></span></div>
          <div><b>{best ? `${best.sixes} / ${best.rolls}` : '–'}</b><span>Sixes / rolls</span></div>
          <div><b>{lucky.monthsWon}</b><span>Months won</span></div>
        </div>
        <div className="profile-lucky-section">
          <div className="profile-lucky-gold-head"><h4>{lucky.monthName}</h4><span>{left(lucky.endsAt)}</span></div>
          <div className="profile-lucky-leader">{leader ? <><b>{leader.name}</b> leads with {pct(leader.rate)} <small>({leader.sixes} sixes in {leader.rolls} rolls)</small></> : 'Nobody has qualified yet. Finish a game to take it.'}</div>
        </div>
        <div className="profile-lucky-section">
          <div className="profile-lucky-gold-head"><h4>Luckiest set</h4><span>{owned} / {lucky.set.length} collected</span></div>
          <span className="profile-lucky-track gold" role="progressbar" aria-label="Luckiest set pieces collected" aria-valuemin={0} aria-valuemax={lucky.set.length} aria-valuenow={owned}>
            <span style={{ width: `${(owned / lucky.set.length) * 100}%` }} />
          </span>
        </div>
      </div>
    </details>
  );
}

// Compact per-match rows: result, mode, who was at the table and when
export const MATCH_LIMIT = 20;

export function MatchHistory({ matches, meId, preview = 3 }) {
  const [open, setOpen] = useState(false);
  if (!matches) return <div className="muted small-text center match-empty">Loading games…</div>;
  if (!matches.length) return <div className="muted small-text center match-empty">No games yet. Match history shows up after the first game.</div>;
  const shown = open ? matches : matches.slice(0, preview);
  return (
    <div className="match-list">
      {shown.map((m) => (
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
      {matches.length > preview && (
        <button className="btn link" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? 'Show less' : `Show all ${matches.length} games`}
        </button>
      )}
    </div>
  );
}
