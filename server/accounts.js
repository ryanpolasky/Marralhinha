const { randomBytes, createHash } = require('crypto');
const { transaction } = require('./db');
const { ITEMS, SLOTS, DEFAULTS, REWARDS } = require('./catalog');

const SESSION_TOUCH_MS = 5 * 60 * 1000;

class AccountError extends Error {}

const newId = () => randomBytes(9).toString('base64url');
const hashToken = (token) => createHash('sha256').update(String(token)).digest('hex');
const cleanName = (name) => String(name ?? '').replace(/[\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);
const parse = (json, fallback) => {
  try {
    return JSON.parse(json) ?? fallback;
  } catch {
    return fallback;
  }
};

function levelInfo(xp) {
  let level = 1;
  let floor = 0;
  let need = 200;
  while (xp >= floor + need) {
    floor += need;
    level += 1;
    need = 200 + 75 * (level - 1);
  }
  return { level, into: xp - floor, need };
}

class Accounts {
  constructor(db) {
    this.db = db;
    this.q = {
      insertUser: db.prepare(
        'INSERT INTO users (id, discord_id, name, avatar, coins, created_at, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ),
      user: db.prepare('SELECT * FROM users WHERE id = ?'),
      userByDiscord: db.prepare('SELECT * FROM users WHERE discord_id = ?'),
      insertSession: db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, last_used) VALUES (?, ?, ?, ?)'),
      session: db.prepare('SELECT * FROM sessions WHERE token_hash = ?'),
      touchSession: db.prepare('UPDATE sessions SET last_used = ? WHERE token_hash = ?'),
      touchUser: db.prepare('UPDATE users SET last_seen = ? WHERE id = ?'),
      deleteSession: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
      inventory: db.prepare('SELECT item_id FROM inventory WHERE user_id = ? ORDER BY acquired_at'),
      addItem: db.prepare('INSERT OR IGNORE INTO inventory (user_id, item_id, acquired_at) VALUES (?, ?, ?)'),
      rename: db.prepare('UPDATE users SET name = ? WHERE id = ?'),
      setEquipped: db.prepare('UPDATE users SET equipped = ? WHERE id = ?'),
      linkDiscord: db.prepare('UPDATE users SET discord_id = ?, avatar = ? WHERE id = ?'),
      updateAvatar: db.prepare('UPDATE users SET avatar = ? WHERE id = ?'),
      mergeInto: db.prepare(
        `UPDATE users SET coins = coins + ?, xp = xp + ?, games = games + ?, wins = wins + ?, captures = captures + ?, boxes_opened = boxes_opened + ? WHERE id = ?`
      ),
      moveInventory: db.prepare('INSERT OR IGNORE INTO inventory (user_id, item_id, acquired_at) SELECT ?, item_id, acquired_at FROM inventory WHERE user_id = ?'),
      moveSessions: db.prepare('UPDATE sessions SET user_id = ? WHERE user_id = ?'),
      moveLedger: db.prepare('UPDATE ledger SET user_id = ? WHERE user_id = ?'),
      deleteUser: db.prepare('DELETE FROM users WHERE id = ?'),
      ledger: db.prepare('INSERT INTO ledger (user_id, delta, reason, created_at) VALUES (?, ?, ?, ?)'),
    };
  }

  createUser({ name, discordId = null, avatar = null }) {
    const id = newId();
    const now = Date.now();
    transaction(this.db, () => {
      this.q.insertUser.run(id, discordId, cleanName(name) || 'Player', avatar, REWARDS.starting, now, now);
      this.q.ledger.run(id, REWARDS.starting, 'welcome', now);
    });
    return this.getUser(id);
  }

  getUser(id) {
    return this.q.user.get(id) || null;
  }

  createSession(userId) {
    const token = randomBytes(32).toString('base64url');
    const now = Date.now();
    this.q.insertSession.run(hashToken(token), userId, now, now);
    return token;
  }

  userForToken(token) {
    if (!token || typeof token !== 'string') return null;
    const hash = hashToken(token);
    const session = this.q.session.get(hash);
    if (!session) return null;
    const now = Date.now();
    if (now - session.last_used > SESSION_TOUCH_MS) {
      this.q.touchSession.run(now, hash);
      this.q.touchUser.run(now, session.user_id);
    }
    return this.getUser(session.user_id);
  }

  deleteSession(token) {
    this.q.deleteSession.run(hashToken(token));
  }

  inventory(userId) {
    return this.q.inventory.all(userId).map((row) => row.item_id);
  }

  owns(userId, itemId) {
    const item = ITEMS.get(itemId);
    if (!item) return false;
    return item.rarity === 'default' || this.inventory(userId).includes(itemId);
  }

  equipped(user) {
    const stored = parse(user.equipped, {});
    return Object.fromEntries(SLOTS.map((slot) => [slot, ITEMS.get(stored[slot])?.slot === slot ? stored[slot] : DEFAULTS[slot]]));
  }

  equip(userId, slot, itemId) {
    const user = this.getUser(userId);
    const item = ITEMS.get(itemId);
    if (!user || !item || item.slot !== slot || !SLOTS.includes(slot)) throw new AccountError('Unknown item');
    if (!this.owns(userId, itemId)) throw new AccountError("You don't own that yet");
    this.q.setEquipped.run(JSON.stringify({ ...this.equipped(user), [slot]: itemId }), userId);
  }

  rename(userId, name) {
    const clean = cleanName(name);
    if (!clean) throw new AccountError('Pick a name first');
    this.q.rename.run(clean, userId);
  }

  loginDiscord(discordUser, guestId = null) {
    const discordId = String(discordUser.id);
    const avatar = discordUser.avatar || null;
    const displayName = cleanName(discordUser.global_name || discordUser.username) || 'Player';
    return transaction(this.db, () => {
      const existing = this.q.userByDiscord.get(discordId);
      const guest = guestId ? this.getUser(guestId) : null;
      if (existing) {
        this.q.updateAvatar.run(avatar, existing.id);
        if (guest && guest.id !== existing.id && !guest.discord_id) this.mergeGuest(guest, existing.id);
        return this.getUser(existing.id);
      }
      if (guest && !guest.discord_id) {
        this.q.linkDiscord.run(discordId, avatar, guest.id);
        return this.getUser(guest.id);
      }
      return this.createUser({ name: displayName, discordId, avatar });
    });
  }

  mergeGuest(guest, intoId) {
    this.q.mergeInto.run(guest.coins, guest.xp, guest.games, guest.wins, guest.captures, guest.boxes_opened, intoId);
    this.q.moveInventory.run(intoId, guest.id);
    this.q.moveSessions.run(intoId, guest.id);
    this.q.moveLedger.run(intoId, guest.id);
    this.q.deleteUser.run(guest.id);
  }

  profile(userOrId, extras = {}) {
    const user = typeof userOrId === 'string' ? this.getUser(userOrId) : userOrId;
    if (!user) return null;
    return {
      id: user.id,
      name: user.name,
      discordLinked: !!user.discord_id,
      coins: user.coins,
      xp: user.xp,
      ...levelInfo(user.xp),
      equipped: this.equipped(user),
      inventory: this.inventory(user.id),
      pity: parse(user.pity, {}),
      stats: { games: user.games, wins: user.wins, captures: user.captures, boxes: user.boxes_opened },
      ...extras,
    };
  }

  publicInfo(user) {
    return { userId: user.id, name: user.name, cosmetics: this.equipped(user), level: levelInfo(user.xp).level };
  }
}

module.exports = { Accounts, AccountError, levelInfo, cleanName, hashToken };
