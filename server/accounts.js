const { randomBytes, createHash } = require('crypto');
const { transaction } = require('./db');
const discord = require('./discord');
const { nameBlocked } = require('./namefilter');
const { ITEMS, SLOTS, DEFAULTS, REWARDS, TAGS, TAG_KEYS, ADMIN_TAGS, AUTO_TAGS } = require('./catalog');

const LUCKY_ITEM = 'dice.lucky';
const LUCKY_SET = [...ITEMS.values()].filter((item) => item.tag === 'lucky').map((item) => item.id);
const LUCK_MIN_ROLLS = 30;
const LUCK_EXPECTED_SIX_RATE = 1 / 6;
const LUCKY_FULL_SET_COINS = 2500;
const monthKey = (t) => new Date(t).toISOString().slice(0, 7);
const monthStart = (key) => Date.parse(`${key}-01T00:00:00Z`);
const shiftMonth = (key, by) => {
  const d = new Date(monthStart(key));
  d.setUTCMonth(d.getUTCMonth() + by);
  return monthKey(d.getTime());
};
const monthName = (key) => new Date(monthStart(key)).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

const SESSION_TOUCH_MS = 5 * 60 * 1000;
const MAX_COIN_GRANT = 1000000;

class AccountError extends Error {}

const newId = () => randomBytes(9).toString('base64url');
const hashToken = (token) => createHash('sha256').update(String(token)).digest('hex');
const cleanName = (name) => String(name ?? '').replace(/[\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);
const safeName = (name) => {
  const clean = cleanName(name);
  return !clean || nameBlocked(clean) ? 'Player' : clean;
};
const parse = (json, fallback) => {
  try {
    return JSON.parse(json) ?? fallback;
  } catch {
    return fallback;
  }
};
// Discord user ids that get the dev tag automatically when they log in (comma-separated env var)
const devDiscordIds = () => new Set(String(process.env.DEV_DISCORD_IDS || '').split(',').map((s) => s.trim()).filter(Boolean));
const PACKS = ['supporter', 'halloween'];
const MAX_SHORTHANDS = 2;
const normalizeTags = (tags) => TAG_KEYS.filter((key) => Array.isArray(tags) && tags.includes(key));
const pickableTags = (held) => (held.includes('dev') ? TAG_KEYS : held);
const storableTags = (tags) => normalizeTags(tags).filter((tag) => !AUTO_TAGS.includes(tag));
// Guest accounts every fresh browser creates that never played, linked Discord or got a tag
const THROWAWAY = "(discord_id IS NULL AND games = 0 AND boxes_opened = 0 AND tags = '[]' AND granted_packs = '[]' AND banned_at IS NULL)";

// CDN url for a linked account's Discord avatar; Discord picks a default from the id when none is set
function avatarUrl(user) {
  if (!user.discord_id) return null;
  if (!user.avatar) return `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(user.discord_id) >> 22n) % 6}.png`;
  return `https://cdn.discordapp.com/avatars/${user.discord_id}/${user.avatar}.${user.avatar.startsWith('a_') ? 'gif' : 'png'}?size=128`;
}

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
      setTagLoadout: db.prepare('UPDATE users SET featured_tag = ?, shorthand_tags = ? WHERE id = ?'),
      setSupporter: db.prepare('UPDATE users SET supporter_entitlement_id = ? WHERE id = ?'),
      setHalloween: db.prepare('UPDATE users SET halloween_entitlement_id = ? WHERE id = ?'),
      setPacks: db.prepare('UPDATE users SET granted_packs = ? WHERE id = ?'),
      purchaserAccounts: db.prepare('SELECT id, discord_id FROM users WHERE (supporter_entitlement_id IS NOT NULL OR halloween_entitlement_id IS NOT NULL) AND discord_id IS NOT NULL'),
      linkDiscord: db.prepare('UPDATE users SET discord_id = ?, avatar = ? WHERE id = ?'),
      updateAvatar: db.prepare('UPDATE users SET avatar = ? WHERE id = ?'),
      mergeInto: db.prepare(
        `UPDATE users SET coins = coins + ?, xp = xp + ?, games = games + ?, wins = wins + ?, captures = captures + ?, boxes_opened = boxes_opened + ?, sixes = sixes + ?, captured = captured + ?, shortcuts = shortcuts + ?, marbles_home = marbles_home + ?, luckiest_total_seconds = luckiest_total_seconds + ?, luckiest_reign_count = luckiest_reign_count + ?, luckiest_longest_reign_seconds = MAX(luckiest_longest_reign_seconds, ?), golden_die_unlocked = MAX(golden_die_unlocked, ?), golden_die_unlocked_at = COALESCE(golden_die_unlocked_at, ?) WHERE id = ?`
      ),
      getMeta: db.prepare('SELECT value FROM meta WHERE key = ?'),
      setMeta: db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'),
      luckiest: db.prepare('SELECT * FROM luckiest_reigns WHERE ended_at IS NULL ORDER BY id DESC LIMIT 1'),
      monthBest: db.prepare(`SELECT mp.user_id AS id, mp.match_id AS matchId, mp.roll_count AS rolls, mp.six_count AS sixes, m.ended_at AS endedAt
        FROM match_players mp JOIN matches m ON m.id = mp.match_id JOIN users u ON u.id = mp.user_id
        WHERE m.ended_at >= ? AND m.ended_at < ? AND mp.roll_count >= ? AND mp.six_count >= 0 AND mp.six_count <= mp.roll_count AND u.banned_at IS NULL AND (? IS NULL OR mp.user_id = ?)
        ORDER BY mp.six_count * 1.0 / mp.roll_count DESC, m.ended_at ASC, m.id ASC LIMIT 1`),
      addMonth: db.prepare('INSERT OR IGNORE INTO luckiest_months (month, player_id, match_id, rolls, sixes, settled_at) VALUES (?, ?, ?, ?, ?, ?)'),
      monthsWon: db.prepare('SELECT COUNT(*) AS n FROM luckiest_months WHERE player_id = ?'),
      pendingMonths: db.prepare('SELECT * FROM luckiest_months WHERE player_id = ? AND claimed_at IS NULL ORDER BY month'),
      claimMonth: db.prepare('UPDATE luckiest_months SET claimed_item = ?, claimed_at = ? WHERE month = ? AND player_id = ? AND claimed_at IS NULL'),
      moveMonths: db.prepare('UPDATE luckiest_months SET player_id = ? WHERE player_id = ?'),
      endReign: db.prepare('UPDATE luckiest_reigns SET ended_at = ?, duration_seconds = ? WHERE id = ?'),
      addReign: db.prepare('INSERT INTO luckiest_reigns (player_id, started_at) VALUES (?, ?)'),
      reignTime: db.prepare('UPDATE users SET luckiest_total_seconds = luckiest_total_seconds + ?, luckiest_longest_reign_seconds = MAX(luckiest_longest_reign_seconds, ?) WHERE id = ?'),
      reignCount: db.prepare('UPDATE users SET luckiest_reign_count = luckiest_reign_count + 1 WHERE id = ?'),
      unlockDie: db.prepare('UPDATE users SET golden_die_unlocked = 1, golden_die_unlocked_at = ? WHERE id = ? AND golden_die_unlocked = 0'),
      moveInventory: db.prepare('INSERT OR IGNORE INTO inventory (user_id, item_id, acquired_at) SELECT ?, item_id, acquired_at FROM inventory WHERE user_id = ?'),
      moveSessions: db.prepare('UPDATE sessions SET user_id = ? WHERE user_id = ?'),
      moveLedger: db.prepare('UPDATE ledger SET user_id = ? WHERE user_id = ?'),
      moveReports: db.prepare('UPDATE reports SET user_id = ? WHERE user_id = ?'),
      dropSharedMatches: db.prepare('DELETE FROM match_players WHERE user_id = ? AND match_id IN (SELECT match_id FROM match_players WHERE user_id = ?)'),
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
      setIp: db.prepare('UPDATE users SET last_ip = ? WHERE id = ?'),
      setBan: db.prepare('UPDATE users SET banned_at = ?, ban_reason = ? WHERE id = ?'),
      banned: db.prepare('SELECT * FROM users WHERE banned_at IS NOT NULL ORDER BY banned_at DESC LIMIT ?'),
      ipBan: db.prepare('SELECT * FROM ip_bans WHERE ip = ?'),
      ipBans: db.prepare('SELECT * FROM ip_bans ORDER BY created_at DESC'),
      addIpBan: db.prepare('INSERT INTO ip_bans (ip, name, reason, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(ip) DO UPDATE SET name = excluded.name, reason = excluded.reason'),
      removeIpBan: db.prepare('DELETE FROM ip_bans WHERE ip = ?'),
      count: db.prepare(`SELECT COUNT(*) AS n, SUM(${THROWAWAY}) AS throwaway FROM users`),
    };
  }

  createUser({ name, discordId = null, avatar = null }) {
    const id = newId();
    const now = Date.now();
    transaction(this.db, () => {
      this.q.insertUser.run(id, discordId, safeName(name), avatar, REWARDS.starting, now, now);
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
    const all = normalizeTags([...stored, ...this.grantedPacks(user), ...(user.supporter_entitlement_id && discord.supporterConfigured() ? ['supporter'] : []), ...(user.halloween_entitlement_id && discord.halloweenConfigured() ? ['halloween'] : []), ...(this.luckyHolder() === user.id ? ['lucky'] : [])]);
    const { main, shorthands } = this.tagLoadout(user, all);
    const shown = all.includes('dev') ? normalizeTags([...all, main, ...shorthands]) : all;
    const lead = main || shown.find((t) => !shorthands.includes(t));
    return [...new Set([lead, ...shorthands, ...shown].filter(Boolean))];
  }

  tagLoadout(user, held = this.tags(user)) {
    const pick = pickableTags(held);
    const main = pick.includes(user.featured_tag) ? user.featured_tag : null;
    const shorthands = [...new Set(parse(user.shorthand_tags, []))].filter((t) => t !== main && pick.includes(t)).slice(0, MAX_SHORTHANDS);
    return { main, shorthands };
  }

  setTagLoadout(userId, main, shorthands) {
    const user = this.requireUser(userId);
    const held = pickableTags(this.tags(user));
    const list = Array.isArray(shorthands) ? [...new Set(shorthands)] : [];
    if ((main !== null && !held.includes(main)) || list.some((t) => !held.includes(t))) throw new AccountError("You don't have that tag");
    if (list.length > MAX_SHORTHANDS) throw new AccountError(`Pick up to ${MAX_SHORTHANDS} shorthand tags`);
    this.q.setTagLoadout.run(main, JSON.stringify(list.filter((t) => t !== main)), userId);
  }

  grantedPacks(user) {
    return parse(user.granted_packs, []).filter((pack) => PACKS.includes(pack));
  }

  // Admin-given packs: the same tag and cosmetics a purchase unlocks, without a Discord entitlement
  setPack(userId, pack, granted) {
    if (!PACKS.includes(pack)) throw new AccountError('Unknown pack');
    const user = this.requireUser(userId);
    const rest = this.grantedPacks(user).filter((p) => p !== pack);
    this.q.setPacks.run(JSON.stringify(granted ? [...rest, pack] : rest), userId);
  }

  luckyHolder() {
    return this.q.luckiest.get()?.player_id || null;
  }

  monthBest(key, userId = null) {
    const next = shiftMonth(key, 1);
    const row = this.q.monthBest.get(monthStart(key), monthStart(next), LUCK_MIN_ROLLS, userId, userId);
    return row ? { ...row, rate: row.sixes / row.rolls } : null;
  }

  luckyStatus(user, now = Date.now(), { self = false } = {}) {
    const month = monthKey(now);
    const leader = this.monthBest(month);
    const best = this.monthBest(month, user.id);
    const leaderUser = leader && this.getUser(leader.id);
    const game = (row) => row && { rate: row.rate, rolls: row.rolls, sixes: row.sixes, endedAt: row.endedAt };
    return {
      month, monthName: monthName(month), endsAt: monthStart(shiftMonth(month, 1)),
      holder: this.luckyHolder() === user.id, best: game(best),
      leader: leader && leaderUser ? { ...game(leader), id: leader.id, name: leaderUser.name } : null,
      monthsWon: this.q.monthsWon.get(user.id).n,
      setOwned: LUCKY_SET.filter((id) => this.ownsLucky(user, id)),
      set: LUCKY_SET, minRolls: LUCK_MIN_ROLLS, expectedRate: LUCK_EXPECTED_SIX_RATE,
      ...(self ? { pending: this.q.pendingMonths.all(user.id).map((row) => ({ month: row.month, monthName: monthName(row.month), rolls: row.rolls, sixes: row.sixes })) } : {}),
    };
  }

  ownsLucky(user, itemId) {
    return this.inventory(user.id).includes(itemId) || (itemId === LUCKY_ITEM && !!user.golden_die_unlocked);
  }

  settleLuckyMonths(now) {
    const current = monthKey(now);
    let last = this.q.getMeta.get('luckiest_settled')?.value || shiftMonth(current, -1);
    const champions = [];
    while (last < shiftMonth(current, -1)) {
      last = shiftMonth(last, 1);
      const best = this.monthBest(last);
      if (best && this.q.addMonth.run(last, best.id, best.matchId, best.rolls, best.sixes, now).changes) champions.push({ id: best.id, month: last, monthName: monthName(last) });
    }
    this.q.setMeta.run('luckiest_settled', last);
    return champions;
  }

  refreshLucky(now = Date.now()) {
    return transaction(this.db, () => {
      const champions = this.settleLuckyMonths(now);
      const current = this.q.luckiest.get();
      const next = this.monthBest(monthKey(now))?.id || null;
      if (next === (current?.player_id || null)) return champions.length ? { holder: next, previous: next, champions } : null;
      if (current) {
        const seconds = Math.max(0, Math.floor((now - current.started_at) / 1000));
        this.q.endReign.run(now, seconds, current.id);
        this.q.reignTime.run(seconds, seconds, current.player_id);
      }
      const nextUser = next && this.getUser(next);
      if (nextUser) {
        this.q.addReign.run(next, now);
        this.q.reignCount.run(next);
      }
      return { holder: next, previous: current?.player_id || null, reclaimed: !!nextUser?.luckiest_reign_count, champions };
    });
  }

  claimLucky(userId, month, itemId) {
    const user = this.requireUser(userId);
    return transaction(this.db, () => {
      const pending = this.q.pendingMonths.all(user.id).find((row) => row.month === month);
      if (!pending) throw new AccountError('Nothing to claim for that month');
      const missing = LUCKY_SET.filter((id) => !this.ownsLucky(user, id));
      if (missing.length) {
        if (!missing.includes(itemId)) throw new AccountError('Pick a Luckiest piece you don\'t have yet');
        this.q.addItem.run(user.id, itemId, Date.now());
        if (itemId === LUCKY_ITEM) this.q.unlockDie.run(Date.now(), user.id);
      } else {
        itemId = null;
        this.q.addCoins.run(LUCKY_FULL_SET_COINS, user.id);
        this.q.ledger.run(user.id, LUCKY_FULL_SET_COINS, 'luckiest', Date.now());
      }
      this.q.claimMonth.run(itemId || 'coins', Date.now(), month, user.id);
      return { item: itemId, coins: itemId ? 0 : LUCKY_FULL_SET_COINS };
    });
  }

  isAdmin(user) {
    return this.tags(user).some((tag) => ADMIN_TAGS.includes(tag));
  }

  // Why this user (arriving from `ip`) is shut out, or null. Admins are never IP-banned
  banReason(user, ip) {
    if (user?.banned_at) return user.ban_reason || 'You have been banned';
    if (user && ip && !this.isAdmin(user) && this.q.ipBan.get(ip)) return this.q.ipBan.get(ip).reason || 'Your network has been banned';
    return null;
  }

  ipBanned(ip) {
    return !!ip && !!this.q.ipBan.get(ip);
  }

  noteIp(user, ip) {
    if (ip && user.last_ip !== ip) this.q.setIp.run(ip, user.id);
  }

  ban(userId, reason, { ip = false } = {}) {
    const user = this.requireUser(userId);
    if (this.isAdmin(user)) throw new AccountError("Admins can't be banned");
    const clean = String(reason ?? '').replace(/\s+/g, ' ').trim().slice(0, 200) || null;
    transaction(this.db, () => {
      this.q.setBan.run(Date.now(), clean, userId);
      if (ip && user.last_ip) this.q.addIpBan.run(user.last_ip, user.name, clean, Date.now());
    });
    return this.getUser(userId);
  }

  unban(userId) {
    const user = this.requireUser(userId);
    transaction(this.db, () => {
      this.q.setBan.run(null, null, userId);
      if (user.last_ip) this.q.removeIpBan.run(user.last_ip);
    });
    return this.getUser(userId);
  }

  unbanIp(ip) {
    this.q.removeIpBan.run(String(ip ?? ''));
  }

  bans() {
    return this.q.ipBans.all().map((row) => ({ ip: row.ip, name: row.name, reason: row.reason, createdAt: row.created_at }));
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
    if (item.tag === 'lucky') return this.ownsLucky(user, itemId);
    if (item.tag) return tags.includes(item.tag);
    return false;
  }

  equipped(user) {
    const stored = parse(user.equipped, {});
    const tags = this.tags(user);
    const inv = this.inventory(user.id);
    const valid = (slot, id) => {
      const item = ITEMS.get(id);
      return item && item.slot === slot && (tags.includes('dev') || !item.tag || (item.tag !== 'lucky' && tags.includes(item.tag)) || inv.includes(id) || (id === LUCKY_ITEM && user.golden_die_unlocked));
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
    if (nameBlocked(clean)) throw new AccountError('That name is not allowed');
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

  setHalloween(userId, entitlementId) {
    const user = this.requireUser(userId);
    const verified = entitlementId || null;
    if (user.halloween_entitlement_id === verified) return false;
    this.q.setHalloween.run(verified, userId);
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
    const displayName = safeName(discordUser.global_name || discordUser.username);
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
    this.q.dropSharedMatches.run(guest.id, intoId);
    this.q.moveMatchPlayers.run(intoId, guest.id);
    this.q.moveReigns.run(intoId, guest.id);
    this.q.moveMonths.run(intoId, guest.id);
    this.setTags(intoId, [...this.tags(into), ...this.tags(guest)]);
    this.q.setPacks.run(JSON.stringify([...new Set([...this.grantedPacks(into), ...this.grantedPacks(guest)])]), intoId);
    this.q.deleteUser.run(guest.id);
  }

  // Admin recovery: fold a guest into another account; the guest's browsers end up signed into `intoId`
  mergeAccounts(fromId, intoId) {
    const from = this.requireUser(fromId);
    const into = this.requireUser(intoId);
    if (from.id === into.id) throw new AccountError('Pick two different accounts');
    if (from.discord_id) throw new AccountError("Discord accounts can't be merged away, keep that one instead");
    if (from.banned_at || into.banned_at) throw new AccountError('Unban both accounts first');
    transaction(this.db, () => this.mergeGuest(from, into.id));
    return this.getUser(into.id);
  }

  search(query, limit = 40, { guests = true } = {}) {
    const q = String(query ?? '').trim().slice(0, 40);
    const withGuests = guests ? 1 : 0;
    if (q === '#tagged') return this.q.tagged.all(limit);
    if (q === '#banned') return this.q.banned.all(limit);
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
      tagLoadout: this.tagLoadout(user),
      admin: this.isAdmin(user),
      pity: parse(user.pity, {}),
      stats: this.statLine(user),
      lucky: this.luckyStatus(user, Date.now(), { self: true }),
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
      packs: Object.fromEntries(PACKS.map((pack) => [pack, this.grantedPacks(user).includes(pack)])),
      equipped: this.equipped(user),
      items: this.inventory(user.id).length,
      stats: this.statLine(user),
      createdAt: user.created_at,
      lastSeen: user.last_seen,
      lastIp: user.last_ip,
      banned: !!user.banned_at,
      banReason: user.ban_reason,
      ipBanned: this.ipBanned(user.last_ip),
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
    return { userId: user.id, name: user.name, avatar: avatarUrl(user), cosmetics: this.equipped(user), level: levelInfo(user.xp).level, tags: this.tags(user) };
  }
}

module.exports = { Accounts, AccountError, levelInfo, cleanName, hashToken };
