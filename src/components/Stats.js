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

const raceInfo = (lucky, race) => {
  const isLucky = race === 'lucky';
  const { best, leader, holder } = lucky;
  const ratio = leader && best ? (isLucky
    ? (leader.rate ? best.rate / leader.rate : best.rate === 0 ? 1 : 0)
    : (best.rate ? leader.rate / best.rate : leader.rate === 0 ? 1 : 0)) : 0;
  return {
    isLucky,
    label: isLucky ? 'Luckiest' : 'Unluckiest',
    width: Math.max(0, Math.min(100, ratio * 100)),
    short: holder ? 'Holder' : best ? pct(best.rate) : 'Not in yet',
    status: holder
      ? `${isLucky ? 'Leading' : 'Trailing'} ${lucky.monthName}`
      : best && leader
        ? `${pct(isLucky ? leader.rate - best.rate : best.rate - leader.rate)} ${isLucky ? 'behind' : 'ahead of'} ${leader.name}`
        : `No qualifying game yet · ${lucky.minRolls}+ of your own rolls`,
  };
};

function RaceTrack({ race, width }) {
  return (
    <span className="profile-lucky-track" role="progressbar" aria-label={`Your ${race === 'lucky' ? 'best' : 'worst'} six rate against this month's ${race === 'lucky' ? 'leader' : 'holder'}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(width)}>
      <span style={{ width: `${width}%` }} />
    </span>
  );
}

function RaceDetails({ lucky, race }) {
  const { isLucky, label, status } = raceInfo(lucky, race);
  const { best, leader } = lucky;
  const owned = lucky.setOwned?.length || 0;
  return (
    <div className="profile-lucky-details">
      <div className="profile-lucky-status">{status}</div>
      <div className="profile-lucky-metrics">
        <div><b>{best ? pct(best.rate) : '–'}</b><span>{isLucky ? 'Best' : 'Worst'} game <small>· {pct(lucky.expectedRate)} expected</small></span></div>
        <div><b>{best ? `${best.sixes} / ${best.rolls}` : '–'}</b><span>Sixes / rolls</span></div>
        <div><b>{lucky.monthsWon}</b><span>{isLucky ? 'Months won' : 'Months lost'}</span></div>
      </div>
      <div className="profile-lucky-section">
        <div className="profile-lucky-gold-head"><h4>{lucky.monthName}</h4><span>{left(lucky.endsAt)}</span></div>
        <div className="profile-lucky-leader">{leader ? <><b>{leader.name}</b> {isLucky ? 'leads' : 'trails'} with {pct(leader.rate)} <small>({leader.sixes} sixes in {leader.rolls} rolls)</small></> : 'Nobody has qualified yet. Finish a game to take it.'}</div>
      </div>
      <div className="profile-lucky-section">
        <div className="profile-lucky-gold-head"><h4>{label} set</h4><span>{owned} / {lucky.set.length} collected</span></div>
        <span className="profile-lucky-track gold" role="progressbar" aria-label={`${label} set pieces collected`} aria-valuemin={0} aria-valuemax={lucky.set.length} aria-valuenow={owned}>
          <span style={{ width: `${(owned / lucky.set.length) * 100}%` }} />
        </span>
      </div>
    </div>
  );
}

const ClaimButton = ({ onClaim }) => <button type="button" className="btn primary small profile-lucky-claim" onClick={(e) => { e.stopPropagation(); onClaim(); }}>Claim reward</button>;

export function RacePanels({ lucky, unlucky, onClaimLucky, onClaimUnlucky }) {
  const [open, setOpen] = useState(null);
  const races = [['lucky', lucky, onClaimLucky], ['unlucky', unlucky, onClaimUnlucky]].filter(([, data]) => data?.month);
  if (!races.length) return null;
  const shown = races.find(([race]) => race === open);
  const toggle = (race) => setOpen(open === race ? null : race);
  return (
    <div className="race-split">
      <div className="race-tiles">
        {races.map(([race, data, onClaim]) => {
          const { short, width } = raceInfo(data, race);
          return (
            <div key={race} role="button" tabIndex={0} aria-expanded={open === race} className={`race-tile ${race}${data.holder ? ' holder' : ''}${open === race ? ' on' : ''}`} onClick={() => toggle(race)} onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggle(race); } }}>
              <span className="race-tile-top"><TagBadge tag={race} small /><span className="profile-lucky-chevron" aria-hidden="true" /></span>
              <b>{short}</b>
              <RaceTrack race={race} width={width} />
              {onClaim && data.pending?.length > 0 && <ClaimButton onClaim={onClaim} />}
            </div>
          );
        })}
      </div>
      {shown && <div className={`profile-lucky race-flat${shown[0] === 'unlucky' ? ' unlucky' : ''}`}><RaceDetails lucky={shown[1]} race={shown[0]} /></div>}
    </div>
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
