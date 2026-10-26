import React, { useCallback, useEffect, useState } from 'react';
import '../App.css';
import { api, post } from '../net/api';
import { CURRENCY } from '../game/catalog';
import { sfx } from '../game/sound';
import { Coin, TagBadges } from './Economy';
import { DiscordMark } from './Icons';

const DAY_MS = 86400000;
const CHART_DAYS = 30;

const ago = (t) => {
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

const dayKey = (t) => new Date(t).toISOString().slice(0, 10);
const lastDays = (now, n) => Array.from({ length: n }, (_, i) => dayKey(now - (n - 1 - i) * DAY_MS));

const REASON_LABEL = {
  welcome: 'Welcome bonus',
  daily: 'Daily claims',
  game: 'Game rewards',
  box: 'Chest buys',
  shop: 'Shop buys',
  admin: 'Dev grants',
  report: 'Report gifts',
  luckiest: 'Luckiest payout',
};

const Stat = ({ label, value, sub }) => (
  <div className="stat-card">
    <div className="stat-value">{typeof value === 'number' ? value.toLocaleString() : value}</div>
    <div className="stat-label">{label}</div>
    {sub && <div className="stat-sub muted">{sub}</div>}
  </div>
);

// Zero-filled day buckets with a pure-CSS bar per day; hover a bar for the exact count
function Chart({ title, rows, field = 'n', now }) {
  const map = Object.fromEntries((rows || []).map((r) => [r.day, r]));
  const data = lastDays(now, CHART_DAYS).map((day) => ({ day, n: map[day]?.[field] || 0 }));
  const max = Math.max(1, ...data.map((r) => r.n));
  const total = data.reduce((sum, r) => sum + r.n, 0);
  return (
    <div className="stat-card">
      <div className="stat-card-head">
        {title} <span className="muted">{total.toLocaleString()} in {CHART_DAYS}d</span>
      </div>
      <div className="chart">
        {data.map((r) => (
          <div key={r.day} className="chart-col" style={{ height: `${(r.n / max) * 100}%` }} title={`${r.day} · ${r.n}`} />
        ))}
      </div>
      <div className="chart-axis muted">
        <span>{data[0]?.day.slice(5)}</span>
        <span>{data[data.length - 1]?.day.slice(5)}</span>
      </div>
    </div>
  );
}

const Person = ({ u }) => (
  <div className="admin-row static">
    <span className="admin-row-name">
      {u.discordLinked ? <DiscordMark size={14} className="admin-row-discord" /> : <span className="admin-row-guest" aria-label="Guest" title="Guest account" />}
      {u.name}
      <TagBadges tags={u.tags} small full />
      {u.fresh && <span className="badge gold">new</span>}
    </span>
    <span className="admin-row-meta">
      made {ago(u.createdAt)} · seen {ago(u.lastSeen)} · {u.stats.games} games · <Coin size={12} /> {u.coins.toLocaleString()}
    </span>
  </div>
);

function Economy({ economy }) {
  const max = Math.max(1, ...economy.reasons.map((r) => Math.abs(r.total)));
  return (
    <div className="stat-card">
      <div className="stat-card-head">
        {CURRENCY} flow <span className="muted">all time</span>
      </div>
      <div className="econ-flow">
        <div>
          <span className="econ-big">{economy.earned.toLocaleString()}</span>
          <span className="muted"> earned</span>
        </div>
        <div>
          <span className="econ-big">{economy.spent.toLocaleString()}</span>
          <span className="muted"> spent</span>
        </div>
        <div>
          <span className="econ-big">+{economy.grantedDay.toLocaleString()}</span>
          <span className="muted"> last 24h</span>
        </div>
      </div>
      <div className="econ-reasons">
        {economy.reasons.slice(0, 8).map((r) => (
          <div key={r.kind} className={`econ-row${r.total < 0 ? ' neg' : ''}`}>
            <span className="econ-kind">{REASON_LABEL[r.kind] || r.kind}</span>
            <span className="econ-bar">
              <span style={{ width: `${(Math.abs(r.total) / max) * 100}%` }} />
            </span>
            <span className="econ-total">
              {r.total > 0 ? '+' : ''}
              {r.total.toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Analytics() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () =>
      api('/admin/analytics')
        .then((res) => {
          setData(res);
          setError(null);
        })
        .catch(setError),
    []
  );

  useEffect(() => {
    document.title = 'Marralhinha analytics';
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  const markSeen = async () => {
    setBusy(true);
    try {
      await post('/admin/users/seen');
      sfx.pop();
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  let body;
  if (!data) {
    body = error ? (
      <div className="stat-card analytics-error">
        <h2>{error.status === 401 ? 'Sign in first' : error.status === 403 ? 'Admins only' : 'Hmm'}</h2>
        <p className="muted">
          {error.status === 401 ? 'Open the game once on this browser so your session exists, then come back.' : error.status === 403 ? 'This page is for the dev account.' : error.message}
        </p>
        <a className="btn primary" href="/">
          Back to the game
        </a>
      </div>
    ) : (
      <div className="boot-spinner analytics-loading">
        <span className="marble-dot" />
        <span>Crunching the marbles…</span>
      </div>
    );
  } else {
    const { users, activity, joined, matches, live, economy, packs, reports, recent, strangers } = data;
    body = (
      <>
        <div className="stat-grid">
          <Stat label="players" value={users.real} sub={`${users.throwaway.toLocaleString()} drive-by guests · ${users.linked} on Discord`} />
          <Stat label="active today" value={activity.day} sub={`${activity.week} this week · ${activity.month} this month`} />
          <Stat label="joined this week" value={joined.week.players} sub={`+${joined.day.players} today · ${joined.week.guests} guests passed by`} />
          <Stat label="strangers" value={strangers.total} sub="non-beta, never at your table" />
          <Stat label="live right now" value={live.playing + live.lobbies} sub={`${live.humans} seated · ${live.spectators} watching · ${live.lobbies} in lobby`} />
          <Stat label="games played" value={matches.total} sub={`${matches.day} today · ${matches.week} this week · ${matches.humans} seats filled`} />
          <Stat label={`${CURRENCY} out there`} value={economy.circulation} sub={`+${economy.grantedDay.toLocaleString()} in the last 24h`} />
          <Stat label="packs" value={packs.supporter + packs.halloween + packs.painter} sub={`${packs.supporter} supporter · ${packs.halloween} halloween · ${packs.painter} painter`} />
          <Stat label="open reports" value={reports.open} sub={`${users.banned} accounts banned`} />
        </div>

        <div className="analytics-cols">
          <div className="stat-card">
            <div className="stat-card-head">
              Recent signups {data.newCount > 0 && <span className="badge gold">{data.newCount} new</span>}
              {data.newCount > 0 && (
                <button className="btn tiny secondary analytics-mark" disabled={busy} onClick={markSeen} title={`Clear the NEW badges (checked ${ago(data.newSince)})`}>
                  mark seen
                </button>
              )}
            </div>
            {data.newCount === 0 && <div className="muted small-text">No new players since your last check {ago(data.newSince)}.</div>}
            <div className="analytics-list">
              {recent.map((u) => (
                <Person key={u.id} u={u} />
              ))}
              {!recent.length && <div className="muted small-text">Nobody yet.</div>}
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-card-head">
              Random players {strangers.total > strangers.list.length && <span className="badge">{strangers.total}</span>}
            </div>
            <div className="muted small-text">Played a game, not beta, never shared a table with you.</div>
            <div className="analytics-list">
              {strangers.list.map((u) => (
                <Person key={u.id} u={u} />
              ))}
              {!strangers.list.length && <div className="muted small-text">Only friends and beta testers so far.</div>}
            </div>
          </div>
          <Economy economy={economy} />
        </div>

        <div className="chart-grid">
          <Chart title="New players" rows={data.signups} now={data.now} />
          <Chart title="People signed in" rows={data.sessions} field="users" now={data.now} />
          <Chart title="Games finished" rows={matches.byDay} now={data.now} />
        </div>
      </>
    );
  }

  return (
    <div className="analytics-page">
      <div className="analytics-wrap">
        <div className="analytics-head">
          <div>
            <h1>
              Marralhinha <span className="muted">analytics</span>
            </h1>
            <div className="muted small-text">{data ? `updated ${ago(data.now)} · refreshes every 30s` : 'dev only'}</div>
          </div>
          <div className="analytics-head-actions">
            {data && (
              <button className="btn tiny secondary" onClick={load}>
                Refresh
              </button>
            )}
            <a className="btn tiny ghost" href="/">
              Back to the game
            </a>
          </div>
        </div>
        {body}
      </div>
    </div>
  );
}
