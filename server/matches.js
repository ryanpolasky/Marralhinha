const { transaction } = require('./db');
const { levelInfo } = require('./accounts');

const HISTORY_LIMIT = 30;
const BOARD_SIZE = 10;
// Wipeout-rate boards need a few games under your belt to mean anything
const BOARD_MIN_GAMES = 5;

class Matches {
  constructor(db, accounts) {
    this.db = db;
    this.accounts = accounts;
    this.q = {
      insertMatch: db.prepare(
        'INSERT INTO matches (code, mode, players, bots, turns, seats, winners, started_at, ended_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ),
      insertPlayer: db.prepare('INSERT OR IGNORE INTO match_players (match_id, user_id, seat, won, roll_count, six_count) VALUES (?, ?, ?, ?, ?, ?)'),
      history: db.prepare(
        `SELECT m.*, mp.seat AS my_seat, mp.won AS my_won FROM match_players mp JOIN matches m ON m.id = mp.match_id
         WHERE mp.user_id = ? ORDER BY m.ended_at DESC LIMIT ?`
      ),
      leadersWins: db.prepare("SELECT * FROM users WHERE games >= ? ORDER BY wins DESC, games DESC LIMIT ?"),
      leadersSixes: db.prepare("SELECT * FROM users WHERE sixes > 0 ORDER BY sixes DESC, games DESC LIMIT ?"),
      leadersCaptures: db.prepare("SELECT * FROM users WHERE captures > 0 ORDER BY captures DESC, games DESC LIMIT ?"),
      leadersRate: db.prepare("SELECT * FROM users WHERE games >= ? ORDER BY (wins * 1.0 / games) DESC, wins DESC LIMIT ?"),
      leadersLevel: db.prepare("SELECT * FROM users ORDER BY xp DESC LIMIT ?"),
      leadersHome: db.prepare("SELECT * FROM users WHERE marbles_home > 0 ORDER BY marbles_home DESC, games DESC LIMIT ?"),
    };
  }

  // Snapshot a finished game: one match row + one match_players row per human who sat at the table
  record(room, now = Date.now()) {
    const game = room.game;
    const seats = room.seats;
    const humans = seats.filter((p) => p && !p.isBot && p.userId);
    if (!game || game.phase !== 'over' || !humans.length || !Array.isArray(game.winners) || !game.winners.length || !game.winners.every((seat) => game.active.includes(seat))) return;
    const winners = game.winners || [];
    const seatRows = game.active.map((seat) => {
      const p = seats[seat];
      const stats = game.stats?.[seat] || {};
      const home = game.marbles[seat]?.filter((m) => m.zone === 'home').length || 0;
      return {
        seat,
        name: p?.name || null,
        userId: p && !p.isBot ? p.userId : null,
        bot: !p || p.isBot,
        won: winners.includes(seat),
        home,
        captures: stats.captures || 0,
        sixes: stats.sixes || 0,
      };
    });
    const turns = (game.stats || []).reduce((sum, s) => sum + (s?.rolls || 0), 0);
    transaction(this.db, () => {
      const info = this.q.insertMatch.run(
        room.code,
        game.mode || 'solo',
        humans.length,
        game.active.length - humans.length,
        turns,
        JSON.stringify(seatRows),
        JSON.stringify(winners),
        game.pick?.t || now,
        now
      );
      const matchId = info.lastInsertRowid;
      for (const row of seatRows) {
        if (!row.userId) continue;
        const stats = game.stats?.[row.seat];
        const played = game.played?.[row.seat];
        const rolls = stats?.rolls == null ? null : Math.max(0, stats.rolls - (played?.coveredRolls || 0));
        const sixes = stats?.sixes == null ? null : Math.max(0, stats.sixes - (played?.coveredSixes || 0));
        this.q.insertPlayer.run(matchId, row.userId, row.seat, row.won ? 1 : 0, rolls, sixes);
      }
    });
  }

  // A player's recent games, shaped for the profile's match-history list
  history(userId, limit = HISTORY_LIMIT) {
    return this.q.history.all(userId, limit).map((m) => ({
      id: m.id,
      mode: m.mode,
      players: m.players,
      bots: m.bots,
      turns: m.turns,
      endedAt: m.ended_at,
      mySeat: m.my_seat,
      won: !!m.my_won,
      seats: JSON.parse(m.seats || '[]'),
    }));
  }

  // The leaderboard tabs: each returns up to BOARD_SIZE public mini-cards
  leaders() {
    const mini = (u) => ({
      id: u.id,
      name: u.name,
      level: levelInfo(u.xp).level,
      tags: this.accounts.tags(u),
      wins: u.wins,
      games: u.games,
      captures: u.captures,
      sixes: u.sixes || 0,
      home: u.marbles_home || 0,
      xp: u.xp,
    });
    return {
      wins: this.q.leadersWins.all(BOARD_MIN_GAMES, BOARD_SIZE).map(mini),
      winRate: this.q.leadersRate.all(BOARD_MIN_GAMES, BOARD_SIZE).map(mini),
      sixes: this.q.leadersSixes.all(BOARD_SIZE).map(mini),
      captures: this.q.leadersCaptures.all(BOARD_SIZE).map(mini),
      home: this.q.leadersHome.all(BOARD_SIZE).map(mini),
      level: this.q.leadersLevel.all(BOARD_SIZE).map(mini),
    };
  }
}

module.exports = { Matches };
