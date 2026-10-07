import React from 'react';
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

const duration = (seconds) => {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return days ? `${days}d ${hours}h` : hours ? `${hours}h ${minutes}m` : `${minutes}m`;
};

export function LuckiestPanel({ lucky }) {
  if (!lucky) return null;
  const games = Math.min(lucky.games, lucky.requiredGames);
  const remaining = lucky.requiredGames - games;
  const goldRequired = lucky.goldenDieRequiredSeconds || 259200;
  const goldProgress = lucky.goldenDieUnlocked ? goldRequired : Math.min(lucky.totalSeconds, goldRequired);
  const status = lucky.holder ? 'Current holder' : remaining ? `${remaining} more ${remaining === 1 ? 'game' : 'games'} to qualify` : lucky.eligible ? `Eligible · luck score ${lucky.score.toFixed(2)}` : lucky.rolls ? 'Inactive · finish a game to rejoin' : 'No recorded rolls yet';
  return (
    <details className={`profile-lucky${lucky.holder ? ' holder' : ''}`}>
      <summary className="profile-lucky-head">
        <TagBadge tag="lucky" small />
        <span className="profile-lucky-overview">
          <span>{lucky.holder ? 'Current holder' : !remaining && !lucky.eligible ? 'Play a game to requalify' : `${games} / ${lucky.requiredGames} games`}</span>
          <span className="profile-lucky-track" role="progressbar" aria-label="Games toward Luckiest eligibility" aria-valuemin={0} aria-valuemax={lucky.requiredGames} aria-valuenow={games}>
            <span style={{ width: `${(games / lucky.requiredGames) * 100}%` }} />
          </span>
        </span>
        <span className="profile-lucky-chevron" aria-hidden="true" />
      </summary>
      <div className="profile-lucky-details">
        <div className="profile-lucky-status">{status}</div>
        <div className="profile-lucky-metrics">
          <div><b>{lucky.sixes.toLocaleString()}</b><span>Sixes</span></div>
          <div><b>{lucky.rolls.toLocaleString()}</b><span>Rolls</span></div>
          <div><b>{(lucky.rate * 100).toFixed(1)}%</b><span>Six rate <small>· {(lucky.expectedRate * 100).toFixed(1)}% expected</small></span></div>
        </div>
        <div className="profile-lucky-section">
          <h4>Time holding Luckiest</h4>
          <div className="profile-lucky-metrics">
            <div><b>{duration(lucky.totalSeconds)}</b><span>Total</span></div>
            <div><b>{duration(lucky.longestSeconds)}</b><span>Longest reign</span></div>
            <div><b>{lucky.reignCount}</b><span>Reigns</span></div>
          </div>
        </div>
        <div className="profile-lucky-section">
          <div className="profile-lucky-gold-head"><h4>Progress to Golden Die</h4><span>{lucky.goldenDieUnlocked ? 'Unlocked permanently' : `${duration(lucky.goldenDieRemainingSeconds)} left`}</span></div>
          <span className="profile-lucky-track gold" role="progressbar" aria-label="Golden Die reign time" aria-valuemin={0} aria-valuemax={goldRequired} aria-valuenow={goldProgress}>
            <span style={{ width: `${(goldProgress / goldRequired) * 100}%` }} />
          </span>
        </div>
      </div>
    </details>
  );
}

// Compact per-match rows: result, mode, who was at the table and when
export function MatchHistory({ matches, meId }) {
  if (!matches) return <div className="muted small-text center match-empty">Loading games…</div>;
  if (!matches.length) return <div className="muted small-text center match-empty">No games yet. Match history shows up after the first game.</div>;
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
