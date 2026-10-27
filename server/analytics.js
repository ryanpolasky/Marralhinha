const { THROWAWAY } = require('./accounts');
const { PACKS } = require('./discord');

const DAY_MS = 24 * 60 * 60 * 1000;

// Server-side rollup for the dev-only /analytics page: signups, activity, games and coins
class Analytics {
  constructor(db, accounts) {
    this.accounts = accounts;
    this.q = {
      totals: db.prepare(
        `SELECT COUNT(*) AS total, SUM(${THROWAWAY}) AS throwaway, SUM(discord_id IS NOT NULL) AS linked,
         SUM(banned_at IS NOT NULL) AS banned, SUM(NOT ${THROWAWAY} AND games > 0) AS played, COALESCE(SUM(coins), 0) AS coins FROM users`
      ),
      createdSince: db.prepare(`SELECT COUNT(*) AS n, SUM(${THROWAWAY}) AS guests FROM users WHERE created_at >= ?`),
      activeSince: db.prepare(`SELECT COUNT(*) AS n FROM users WHERE last_seen >= ? AND NOT ${THROWAWAY}`),
      signupsByDay: db.prepare(
        `SELECT date(created_at / 1000, 'unixepoch') AS day, COUNT(*) AS n FROM users WHERE created_at >= ? AND NOT ${THROWAWAY} GROUP BY day`
      ),
      sessionsByDay: db.prepare(
        `SELECT date(created_at / 1000, 'unixepoch') AS day, COUNT(*) AS n, COUNT(DISTINCT user_id) AS users FROM sessions WHERE created_at >= ? GROUP BY day`
      ),
      matchTotals: db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(players), 0) AS humans, COALESCE(SUM(bots), 0) AS bots, COALESCE(SUM(turns), 0) AS turns FROM matches'),
      matchesSince: db.prepare('SELECT COUNT(*) AS n FROM matches WHERE ended_at >= ?'),
      matchesByDay: db.prepare(`SELECT date(ended_at / 1000, 'unixepoch') AS day, COUNT(*) AS n FROM matches WHERE ended_at >= ? GROUP BY day`),
      ledgerReasons: db.prepare('SELECT reason, SUM(delta) AS total, COUNT(*) AS n FROM ledger GROUP BY reason'),
      flow: db.prepare('SELECT COALESCE(SUM(CASE WHEN delta > 0 THEN delta END), 0) AS earned, COALESCE(SUM(CASE WHEN delta < 0 THEN -delta END), 0) AS spent FROM ledger'),
      grantedSince: db.prepare('SELECT COALESCE(SUM(delta), 0) AS n FROM ledger WHERE delta > 0 AND created_at >= ?'),
      openReports: db.prepare("SELECT COUNT(*) AS n FROM reports WHERE status = 'open'"),
      purchasers: db.prepare(`SELECT ${Object.keys(PACKS).map((pack) => `SUM(${pack}_entitlement_id IS NOT NULL) AS ${pack}`).join(', ')} FROM users`),
      recentReal: db.prepare(`SELECT * FROM users WHERE NOT ${THROWAWAY} ORDER BY created_at DESC LIMIT 8`),
      // Organic players: played at least once, never beta or dev tagged, never shared a table with the admin
      strangerCount: db.prepare(
        `SELECT COUNT(*) AS n FROM users WHERE games > 0 AND id != ? AND tags NOT LIKE '%"beta"%' AND tags NOT LIKE '%"dev"%'
         AND NOT EXISTS (SELECT 1 FROM match_players mp JOIN match_players mine ON mine.match_id = mp.match_id WHERE mp.user_id = users.id AND mine.user_id = ?)`
      ),
      strangers: db.prepare(
        `SELECT * FROM users WHERE games > 0 AND id != ? AND tags NOT LIKE '%"beta"%' AND tags NOT LIKE '%"dev"%'
         AND NOT EXISTS (SELECT 1 FROM match_players mp JOIN match_players mine ON mine.match_id = mp.match_id WHERE mp.user_id = users.id AND mine.user_id = ?)
         ORDER BY last_seen DESC LIMIT 8`
      ),
    };
  }

  joined(since) {
    const row = this.q.createdSince.get(since);
    return { players: row.n - (row.guests || 0), guests: row.guests || 0 };
  }

  snapshot(rooms, meId, now = Date.now()) {
    const dayAgo = now - DAY_MS;
    const weekAgo = now - 7 * DAY_MS;
    const monthAgo = now - 30 * DAY_MS;
    const totals = this.q.totals.get();
    const flow = this.q.flow.get();
    const matches = this.q.matchTotals.get();
    const live = rooms ? rooms.list() : [];
    const newSince = this.accounts.newSince();

    // Ledger reasons carry suffixes (daily:3, admin:<id>, box:box.basic); roll them up to the prefix
    const kinds = new Map();
    for (const row of this.q.ledgerReasons.all()) {
      const kind = row.reason.split(':')[0];
      const cur = kinds.get(kind) || { kind, total: 0, n: 0 };
      cur.total += row.total;
      cur.n += row.n;
      kinds.set(kind, cur);
    }
    const reasons = [...kinds.values()].sort((a, b) => Math.abs(b.total) - Math.abs(a.total));

    return {
      now,
      users: {
        total: totals.total,
        real: totals.total - (totals.throwaway || 0),
        throwaway: totals.throwaway || 0,
        linked: totals.linked || 0,
        banned: totals.banned || 0,
        played: totals.played || 0,
      },
      activity: {
        day: this.q.activeSince.get(dayAgo).n,
        week: this.q.activeSince.get(weekAgo).n,
        month: this.q.activeSince.get(monthAgo).n,
      },
      joined: { day: this.joined(dayAgo), week: this.joined(weekAgo), month: this.joined(monthAgo) },
      newSince,
      newCount: this.accounts.newCount(newSince),
      signups: this.q.signupsByDay.all(monthAgo),
      sessions: this.q.sessionsByDay.all(monthAgo),
      matches: {
        total: matches.n,
        humans: matches.humans,
        bots: matches.bots,
        turns: matches.turns,
        day: this.q.matchesSince.get(dayAgo).n,
        week: this.q.matchesSince.get(weekAgo).n,
        byDay: this.q.matchesByDay.all(monthAgo),
      },
      live: {
        playing: live.filter((r) => r.phase === 'playing').length,
        lobbies: live.filter((r) => r.phase === 'lobby').length,
        humans: live.reduce((sum, r) => sum + r.players.filter((p) => !p.isBot).length, 0),
        spectators: live.reduce((sum, r) => sum + r.spectators, 0),
      },
      economy: {
        circulation: totals.coins,
        earned: flow.earned,
        spent: flow.spent,
        grantedDay: this.q.grantedSince.get(dayAgo).n,
        reasons,
      },
      packs: Object.fromEntries(Object.keys(PACKS).map((pack) => [pack, this.q.purchasers.get()[pack] || 0])),
      reports: { open: this.q.openReports.get().n },
      recent: this.q.recentReal.all().map((u) => this.accounts.adminView(u)),
      strangers: { total: this.q.strangerCount.get(meId, meId).n, list: this.q.strangers.all(meId, meId).map((u) => this.accounts.adminView(u)) },
    };
  }
}

module.exports = { Analytics };
