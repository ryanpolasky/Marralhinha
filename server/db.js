const fs = require('fs');
const path = require('path');
const { randomBytes } = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const DB_FILE = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'marralhinha.db');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  discord_id TEXT UNIQUE,
  name TEXT NOT NULL,
  avatar TEXT,
  coins INTEGER NOT NULL DEFAULT 0,
  xp INTEGER NOT NULL DEFAULT 0,
  equipped TEXT NOT NULL DEFAULT '{}',
  pity TEXT NOT NULL DEFAULT '{}',
  games INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  captures INTEGER NOT NULL DEFAULT 0,
  boxes_opened INTEGER NOT NULL DEFAULT 0,
  daily_day TEXT,
  streak INTEGER NOT NULL DEFAULT 0,
  counter_day TEXT,
  bot_games_today INTEGER NOT NULL DEFAULT 0,
  won_today INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  last_used INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS inventory (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  acquired_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, item_id)
);
CREATE TABLE IF NOT EXISTS ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ledger_user ON ledger(user_id);
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT
);
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  response TEXT,
  gift TEXT,
  created_at INTEGER NOT NULL,
  resolved_at INTEGER,
  seen_at INTEGER,
  claimed_at INTEGER
);
CREATE INDEX IF NOT EXISTS reports_user ON reports(user_id);
CREATE INDEX IF NOT EXISTS reports_status ON reports(status);
CREATE TABLE IF NOT EXISTS matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL,
  mode TEXT NOT NULL,
  players INTEGER NOT NULL,
  bots INTEGER NOT NULL,
  turns INTEGER NOT NULL,
  seats TEXT NOT NULL,
  winners TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS matches_ended ON matches(ended_at);
CREATE TABLE IF NOT EXISTS match_players (
  match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  seat INTEGER NOT NULL,
  won INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (match_id, user_id)
);
CREATE INDEX IF NOT EXISTS match_players_user ON match_players(user_id);
CREATE TABLE IF NOT EXISTS luckiest_reigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  duration_seconds INTEGER
);
CREATE INDEX IF NOT EXISTS luckiest_reigns_player ON luckiest_reigns(player_id);
CREATE UNIQUE INDEX IF NOT EXISTS luckiest_reigns_open ON luckiest_reigns ((1)) WHERE ended_at IS NULL;
`;

// Columns added after the first release; applied to existing databases on startup
const MIGRATIONS = [
  ['users', 'tags', "TEXT NOT NULL DEFAULT '[]'"],
  ['users', 'sixes', 'INTEGER NOT NULL DEFAULT 0'],
  ['users', 'captured', 'INTEGER NOT NULL DEFAULT 0'],
  ['users', 'shortcuts', 'INTEGER NOT NULL DEFAULT 0'],
  ['users', 'marbles_home', 'INTEGER NOT NULL DEFAULT 0'],
  ['users', 'luckiest_total_seconds', 'INTEGER NOT NULL DEFAULT 0'],
  ['users', 'luckiest_reign_count', 'INTEGER NOT NULL DEFAULT 0'],
  ['users', 'luckiest_longest_reign_seconds', 'INTEGER NOT NULL DEFAULT 0'],
  ['users', 'golden_die_unlocked', 'INTEGER NOT NULL DEFAULT 0'],
  ['users', 'golden_die_unlocked_at', 'INTEGER'],
  ['users', 'supporter_entitlement_id', 'TEXT'],
  ['match_players', 'roll_count', 'INTEGER'],
  ['match_players', 'six_count', 'INTEGER'],
];

function migrate(db) {
  for (const [table, column, type] of MIGRATIONS) {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
    if (!columns.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
  db.exec("UPDATE users SET golden_die_unlocked = 1 WHERE golden_die_unlocked = 0 AND id IN (SELECT user_id FROM inventory WHERE item_id = 'dice.lucky')");
}

function openDb(file = DB_FILE) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

function backupDb(db, file = DB_FILE, now = Date.now(), directory = process.env.DB_BACKUP_DIR || path.join(path.dirname(path.resolve(file)), 'backups')) {
  if (file === ':memory:') return null;
  const day = new Date(now).toISOString().slice(0, 10);
  const prefix = `${path.basename(file, path.extname(file))}-${day}-`;
  fs.mkdirSync(directory, { recursive: true });
  const valid = (snapshotFile) => {
    let snapshot;
    try {
      snapshot = new DatabaseSync(snapshotFile, { readOnly: true });
      return snapshot.prepare('PRAGMA integrity_check').get().integrity_check === 'ok' && !!snapshot.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'").get();
    } catch {
      return false;
    } finally {
      snapshot?.close();
    }
  };
  if (fs.readdirSync(directory).some((name) => name.startsWith(prefix) && name.endsWith('.sqlite') && valid(path.join(directory, name)))) return null;
  const name = `${prefix}${new Date(now).toISOString().slice(11, 19).replace(/:/g, '')}-${randomBytes(8).toString('hex')}`;
  const partial = path.join(directory, `${name}.partial`);
  const complete = path.join(directory, `${name}.sqlite`);
  db.prepare('VACUUM INTO ?').run(partial);
  if (!valid(partial)) throw new Error(`SQLite backup failed integrity check: ${partial}`);
  if (fs.existsSync(complete)) throw new Error(`SQLite backup destination already exists: ${complete}`);
  fs.renameSync(partial, complete);
  return complete;
}

const depth = new WeakMap();
function transaction(db, fn) {
  const level = depth.get(db) || 0;
  if (level > 0) return fn();
  db.exec('BEGIN IMMEDIATE');
  depth.set(db, 1);
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  } finally {
    depth.set(db, 0);
  }
}

module.exports = { openDb, transaction, migrate, backupDb };
