const { randomBytes, createHash } = require('crypto');
const { transaction } = require('./db');
const discord = require('./discord');
const { ITEMS, SLOTS, DEFAULTS, REWARDS, TAGS, TAG_KEYS, ADMIN_TAGS, AUTO_TAGS } = require('./catalog');

const LUCKY_ITEM = 'dice.lucky';
const LUCK_WINDOW_GAMES = 10;
const LUCK_ACTIVITY_DAYS = 14;
const LUCK_EXPECTED_SIX_RATE = 1 / 6;
const GOLDEN_DIE_REQUIRED_SECONDS = 3 * 86400;
const LUCK_ACTIVITY_MS = LUCK_ACTIVITY_DAYS * 86400000;

const SESSION_TOUCH_MS = 5 * 60 * 1000;
const MAX_COIN_GRANT = 1000000;

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
// Discord user ids that get the dev tag automatically when they log in (comma-separated env var)
const devDiscordIds = () => new Set(String(process.env.DEV_DISCORD_IDS || '').split(',').map((s) => s.trim()).filter(Boolean));
const normalizeTags = (tags) => TAG_KEYS.filter((key) => Array.isArray(tags) && tags.includes(key));
const storableTags = (tags) => normalizeTags(tags).filter((tag) => !AUTO_TAGS.includes(tag));
// Guest accounts every fresh browser creates that never played, linked Discord or got a tag
const THROWAWAY = "(discord_id IS NULL AND games = 0 AND boxes_opened = 0 AND tags = '[]')";

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
      setTags: db.prepare('UPDATE users SET tags = ? WHERE id = ?'),
      setSupporter: db.prepare('UPDATE users SET supporter_entitlement_id = ? WHERE id = ?'),
      supporterAccounts: db.prepare('SELECT id, discord_id FROM users WHERE supporter_entitlement_id IS NOT NULL AND discord_id IS NOT NULL'),
      linkDiscord: db.prepare('UPDATE users SET discord_id = ?, avatar = ? WHERE id = ?'),
      updateAvatar: db.prepare('UPDATE users SET avatar = ? WHERE id = ?'),
      mergeInto: db.prepare(
        `UPDATE users SET coins = coins + ?, xp = xp + ?, games = games + ?, wins = wins + ?, captures = captures + ?, boxes_opened = boxes_opened + ?, sixes = sixes + ?, captured = captured + ?, shortcuts = shortcuts + ?, marbles_home = marbles_home + ?, luckiest_total_seconds = luckiest_total_seconds + ?, luckiest_reign_count = luckiest_reign_count + ?, luckiest_longest_reign_seconds = MAX(luckiest_longest_reign_seconds, ?), golden_die_unlocked = MAX(golden_die_unlocked, ?), golden_die_unlocked_at = COALESCE(golden_die_unlocked_at, ?) WHERE id = ?`
      ),
      getMeta: db.prepare('SELECT value FROM meta WHERE key = ?'),
      setMeta: db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'),
      luckiest: db.prepare('SELECT * FROM luckiest_reigns WHERE ended_at IS NULL ORDER BY id DESC LIMIT 1'),
      luckGames: db.prepare(`SELECT mp.roll_count AS rolls, mp.six_count AS sixes, m.ended_at AS endedAt
        FROM match_players mp JOIN matches m ON m.id = mp.match_id
        WHERE mp.user_id = ? AND mp.roll_count >= mp.six_count AND mp.six_count >= 0 AND m.ended_at <= ?
        ORDER BY m.ended_at DESC, m.id DESC LIMIT ?`),
      luckyCandidates: db.prepare(`SELECT DISTINCT mp.user_id AS id FROM match_players mp JOIN matches m ON m.id = mp.match_id
        WHERE m.ended_at >= ? AND m.ended_at <= ? AND mp.roll_count >= mp.six_count AND mp.six_count >= 0`),
      endReign: db.prepare('UPDATE luckiest_reigns SET ended_at = ?, duration_seconds = ? WHERE id = ?'),
      addReign: db.prepare('INSERT INTO luckiest_reigns (player_id, started_at) VALUES (?, ?)'),
      reignTime: db.prepare('UPDATE users SET luckiest_total_seconds = luckiest_total_seconds + ?, luckiest_longest_reign_seconds = MAX(luckiest_longest_reign_seconds, ?) WHERE id = ?'),
      reignCount: db.prepare('UPDATE users SET luckiest_reign_count = luckiest_reign_count + 1 WHERE id = ?'),
      unlockDie: db.prepare('UPDATE users SET golden_die_unlocked = 1, golden_die_unlocked_at = ? WHERE id = ? AND golden_die_unlocked = 0'),
      earnedDie: db.prepare('SELECT id FROM users WHERE luckiest_total_seconds >= ? AND golden_die_unlocked = 0'),
      moveInventory: db.prepare('INSERT OR IGNORE INTO inventory (user_id, item_id, acquired_at) SELECT ?, item_id, acquired_at FROM inventory WHERE user_id = ?'),
      moveSessions: db.prepare('UPDATE sessions SET user_id = ? WHERE user_id = ?'),
      moveLedger: db.prepare('UPDATE ledger SET user_id = ? WHERE user_id = ?'),
      moveReports: db.prepare('UPDATE reports SET user_id = ? WHERE user_id = ?'),
      moveMatchPlayers: db.prepare('UPDATE match_players SET user_id = ? WHERE user_id = ?'),
      moveReigns: db.prepare('UPDATE luckiest_reigns SET player_id = ? WHERE player_id = ?'),
      deleteUser: db.prepare('DELETE FROM users WHERE id = ?'),
      ledger: db.prepare('INSERT INTO ledger (user_id, delta, reason, created_at) VALUES (?, ?, ?, ?)'),
      addCoins: db.prepare('UPDATE users SET coins = MAX(0, coins + ?) WHERE id = ?'),
      search: db.prepare(
        `SELECT * FROM users WHERE (id = ? OR discord_id = ? OR name LIKE ? ESCAPE '\\' COLLATE NOCASE) AND (? OR NOT ${THROWAWAY}) ORDER BY last_seen DESC LIMIT ?`
      ),
      recent: db.prepare(`SELECT * FROM users WHERE (? OR NOT ${THROWAWAY}) ORDER BY last_seen DESC LIMIT ?`),
      tagged: db.prepare("SELECT * FROM users WHERE tags != '[]' ORDER BY last_seen DESC LIMIT ?"),
      count: db.prepare(`SELECT COUNT(*) AS n, SUM(${THROWAWAY}) AS throwaway FROM users`),
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

  requireUser(id) {
    const user = this.getUser(id);
    if (!user) throw new AccountError('Account not found');
    return user;
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

  tags(user) {
    const stored = storableTags(parse(user.tags, []));
    return normalizeTags([...stored, ...(user.supporter_entitlement_id && discord.supporterConfigured() ? ['supporter'] : []), ...(this.luckyHolder() === user.id ? ['lucky'] : [])]);
  }

  luckyHolder() {
    return this.q.luckiest.get()?.player_id || null;
  }

  luckWindow(userId, now = Date.now()) {
    const games = this.q.luckGames.all(userId, now, LUCK_WINDOW_GAMES);
    const rolls = games.reduce((sum, game) => sum + game.rolls, 0);
    const sixes = games.reduce((sum, game) => sum + game.sixes, 0);
    const eligible = games.length === LUCK_WINDOW_GAMES && games[0].endedAt >= now - LUCK_ACTIVITY_MS && rolls > 0;
    const expected = rolls * LUCK_EXPECTED_SIX_RATE;
    return { games: games.length, rolls, sixes, eligible, lastCompletedAt: games[0]?.endedAt ?? null, rate: rolls ? sixes / rolls : 0,
      score: eligible ? (sixes - expected) / Math.sqrt(expected * (1 - LUCK_EXPECTED_SIX_RATE)) : null };
  }

  // What the profile card needs to show progress towards the Luckiest tag
  luckyStatus(user, now = Date.now()) {
    const reign = this.q.luckiest.get();
    const window = this.luckWindow(user.id, now);
    const end = window.lastCompletedAt !== null ? Math.min(now, window.lastCompletedAt + LUCK_ACTIVITY_MS) : now;
    const activeSeconds = reign?.player_id === user.id ? Math.max(0, Math.floor((end - reign.started_at) / 1000)) : 0;
    const totalSeconds = user.luckiest_total_seconds + activeSeconds;
    return { ...window, holder: reign?.player_id === user.id && window.eligible,
      totalSeconds, longestSeconds: Math.max(user.luckiest_longest_reign_seconds, activeSeconds),
      reignCount: user.luckiest_reign_count, goldenDieUnlocked: !!user.golden_die_unlocked,
      goldenDieRemainingSeconds: Math.max(0, GOLDEN_DIE_REQUIRED_SECONDS - totalSeconds),
      goldenDieRequiredSeconds: GOLDEN_DIE_REQUIRED_SECONDS,
      requiredGames: LUCK_WINDOW_GAMES, expectedRate: LUCK_EXPECTED_SIX_RATE };
  }

  refreshGoldenUnlocks(now = Date.now()) {
    return transaction(this.db, () => {
      const ids = this.q.earnedDie.all(GOLDEN_DIE_REQUIRED_SECONDS).map(({ id }) => id);
      for (const id of ids) {
        this.q.unlockDie.run(now, id);
        this.q.addItem.run(id, LUCKY_ITEM, now);
      }
      return ids;
    });
  }

  // The Luckiest tag moves only when an eligible player's last 10 completed games have the best score.
  // Reigns accumulate towards a permanent die, including time from earlier reigns.
  refreshLucky(now = Date.now(), { inactivityOnly = false } = {}) {
    return transaction(this.db, () => {
      const current = this.q.luckiest.get();
      const holder = current && this.getUser(current.player_id);
      const unlocked = [];
      const unlock = (user, seconds) => {
        if (!user?.golden_die_unlocked && seconds >= GOLDEN_DIE_REQUIRED_SECONDS) {
          this.q.unlockDie.run(now, user.id);
          this.q.addItem.run(user.id, LUCKY_ITEM, now);
          unlocked.push(user.id);
        }
      };
      const holderWindow = holder && this.luckWindow(holder.id, now);
      const reignEnd = holderWindow?.lastCompletedAt != null ? Math.min(now, holderWindow.lastCompletedAt + LUCK_ACTIVITY_MS) : now;
      const reignSeconds = current ? Math.max(0, Math.floor((reignEnd - current.started_at) / 1000)) : 0;
      if (current && holder) unlock(holder, holder.luckiest_total_seconds + reignSeconds);
      if (inactivityOnly && (!current || (holder && holderWindow.eligible))) {
        return unlocked.length ? { holder: current?.player_id || null, previous: current?.player_id || null, unlocked } : null;
      }
      const candidates = this.q.luckyCandidates.all(now - LUCK_ACTIVITY_MS, now)
        .map(({ id }) => ({ id, ...this.luckWindow(id, now) }))
        .filter((entry) => entry.eligible)
        .sort((a, b) => b.score - a.score || (a.id === current?.player_id ? -1 : b.id === current?.player_id ? 1 : a.id.localeCompare(b.id)));
      const next = candidates[0]?.id || null;
      if (next === (current?.player_id || null)) return unlocked.length ? { holder: next, previous: next, unlocked } : null;
      if (current) {
        const seconds = reignSeconds;
        this.q.endReign.run(reignEnd, seconds, current.id);
        if (holder) this.q.reignTime.run(seconds, seconds, holder.id);
      }
      const nextUser = next && this.getUser(next);
      if (nextUser) {
        this.q.addReign.run(next, now);
        this.q.reignCount.run(next);
      }
      return { holder: next, previous: current?.player_id || null, reclaimed: !!nextUser?.luckiest_reign_count, unlocked };
    });
  }

  isAdmin(user) {
    return this.tags(user).some((tag) => ADMIN_TAGS.includes(tag));
  }

  owns(userOrId, itemId) {
    const item = ITEMS.get(itemId);
    if (!item) return false;
    const user = typeof userOrId === 'string' ? this.getUser(userOrId) : userOrId;
    if (!user) return false;
    if (item.rarity === 'default') return true;
    const tags = this.tags(user);
    if (tags.includes('dev')) return true;
    if (this.inventory(user.id).includes(itemId)) return true;
    if (itemId === LUCKY_ITEM) return !!user.golden_die_unlocked;
    if (item.tag) return tags.includes(item.tag);
    return false;
  }

  equipped(user) {
    const stored = parse(user.equipped, {});
    const tags = this.tags(user);
    const inv = this.inventory(user.id);
    const valid = (slot, id) => {
      const item = ITEMS.get(id);
      return item && item.slot === slot && (tags.includes('dev') || !item.tag || (id !== LUCKY_ITEM && tags.includes(item.tag)) || inv.includes(id) || (id === LUCKY_ITEM && user.golden_die_unlocked));
    };
    return Object.fromEntries(SLOTS.map((slot) => [slot, valid(slot, stored[slot]) ? stored[slot] : DEFAULTS[slot]]));
  }

  equip(userId, slot, itemId) {
    const user = this.requireUser(userId);
    const item = ITEMS.get(itemId);
    if (!item || item.slot !== slot || !SLOTS.includes(slot)) throw new AccountError('Unknown item');
    if (!this.owns(user, itemId)) throw new AccountError(item.tag ? `That one is ${TAGS[item.tag].label} only` : "You don't own that yet");
    this.q.setEquipped.run(JSON.stringify({ ...this.equipped(user), [slot]: itemId }), userId);
  }

  rename(userId, name) {
    const clean = cleanName(name);
    if (!clean) throw new AccountError('Pick a name first');
    this.q.rename.run(clean, userId);
  }

  setTags(userId, tags) {
    this.requireUser(userId);
    const clean = storableTags(tags);
    this.q.setTags.run(JSON.stringify(clean), userId);
    return clean;
  }

  setSupporter(userId, entitlementId) {
    const user = this.requireUser(userId);
    const verified = entitlementId || null;
    if (user.supporter_entitlement_id === verified) return false;
    this.q.setSupporter.run(verified, userId);
    return true;
  }

  addTag(userId, tag) {
    const user = this.requireUser(userId);
    return this.setTags(userId, [...this.tags(user), tag]);
  }

  grantCoins(userId, delta, reason) {
    const amount = Math.trunc(Number(delta));
    if (!Number.isFinite(amount) || amount === 0 || Math.abs(amount) > MAX_COIN_GRANT) throw new AccountError('Pick an amount between 1 and 1,000,000');
    this.requireUser(userId);
    transaction(this.db, () => {
      this.q.addCoins.run(amount, userId);
      this.q.ledger.run(userId, amount, reason, Date.now());
    });
  }

  grantItem(userId, itemId) {
    const item = ITEMS.get(itemId);
    if (!item || item.rarity === 'default') throw new AccountError('Unknown item');
    if (item.tag) throw new AccountError(`${item.name} comes with the ${TAGS[item.tag].label} tag, give them that instead`);
    this.requireUser(userId);
    this.q.addItem.run(userId, itemId, Date.now());
  }

  loginDiscord(discordUser, guestId = null) {
    const discordId = String(discordUser.id);
    const avatar = discordUser.avatar || null;
    const displayName = cleanName(discordUser.global_name || discordUser.username) || 'Player';
    return transaction(this.db, () => {
      const existing = this.q.userByDiscord.get(discordId);
      const guest = guestId ? this.getUser(guestId) : null;
      let user;
      if (existing) {
        this.q.updateAvatar.run(avatar, existing.id);
        if (guest && guest.id !== existing.id && !guest.discord_id) this.mergeGuest(guest, existing.id);
        user = this.getUser(existing.id);
      } else if (guest && !guest.discord_id) {
        this.q.linkDiscord.run(discordId, avatar, guest.id);
        user = this.getUser(guest.id);
      } else user = this.createUser({ name: displayName, discordId, avatar });
      if (devDiscordIds().has(discordId) && !this.tags(user).includes('dev')) {
        this.addTag(user.id, 'dev');
        user = this.getUser(user.id);
      }
      return user;
    });
  }

  mergeGuest(guest, intoId) {
    const into = this.getUser(intoId);
    this.q.mergeInto.run(guest.coins, guest.xp, guest.games, guest.wins, guest.captures, guest.boxes_opened, guest.sixes || 0, guest.captured || 0, guest.shortcuts || 0, guest.marbles_home || 0, guest.luckiest_total_seconds, guest.luckiest_reign_count, guest.luckiest_longest_reign_seconds, guest.golden_die_unlocked, guest.golden_die_unlocked_at, intoId);
    this.q.moveInventory.run(intoId, guest.id);
    this.q.moveSessions.run(intoId, guest.id);
    this.q.moveLedger.run(intoId, guest.id);
    this.q.moveReports.run(intoId, guest.id);
    this.q.moveMatchPlayers.run(intoId, guest.id);
    this.q.moveReigns.run(intoId, guest.id);
    this.setTags(intoId, [...this.tags(into), ...this.tags(guest)]);
    this.q.deleteUser.run(guest.id);
  }

  search(query, limit = 40, { guests = true } = {}) {
    const q = String(query ?? '').trim().slice(0, 40);
    const withGuests = guests ? 1 : 0;
    if (q === '#tagged') return this.q.tagged.all(limit);
    if (!q) return this.q.recent.all(withGuests, limit);
    const like = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
    return this.q.search.all(q, q, like, withGuests, limit);
  }

  userCount() {
    const row = this.q.count.get();
    return { total: row.n, throwaway: row.throwaway || 0 };
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
      tags: this.tags(user),
      admin: this.isAdmin(user),
      pity: parse(user.pity, {}),
      stats: this.statLine(user),
      lucky: this.luckyStatus(user),
      ...extras,
    };
  }

  // The numbers shown on profiles, player cards and the admin view
  statLine(user) {
    return {
      games: user.games,
      wins: user.wins,
      captures: user.captures,
      captured: user.captured || 0,
      boxes: user.boxes_opened,
      sixes: user.sixes || 0,
      shortcuts: user.shortcuts || 0,
      home: user.marbles_home || 0,
    };
  }

  // What admins see about another player
  adminView(user) {
    return {
      id: user.id,
      name: user.name,
      discordLinked: !!user.discord_id,
      coins: user.coins,
      level: levelInfo(user.xp).level,
      tags: this.tags(user),
      equipped: this.equipped(user),
      items: this.inventory(user.id).length,
      stats: this.statLine(user),
      createdAt: user.created_at,
      lastSeen: user.last_seen,
    };
  }

  // What other players see when they peek at someone's card: look, level and lifetime numbers
  publicCard(user) {
    return {
      id: user.id,
      name: user.name,
      equipped: this.equipped(user),
      level: levelInfo(user.xp).level,
      tags: this.tags(user),
      stats: this.statLine(user),
      lucky: this.luckyStatus(user),
      createdAt: user.created_at,
    };
  }

  publicInfo(user) {
    return { userId: user.id, name: user.name, cosmetics: this.equipped(user), level: levelInfo(user.xp).level, tags: this.tags(user) };
  }
}

module.exports = { Accounts, AccountError, levelInfo, cleanName, hashToken };
