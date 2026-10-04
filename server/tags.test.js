const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { randomBytes } = require('crypto');
const { openDb, migrate, backupDb } = require('./db');
const { Accounts } = require('./accounts');
const { Economy, featuredFor, utcDay, botCosmetics } = require('./economy');
const { catalog, DROPPABLE, BOXES } = require('./catalog');
const { Matches } = require('./matches');
const discord = require('./discord');

const setup = () => {
  const db = openDb(':memory:');
  const accounts = new Accounts(db);
  return { db, accounts, economy: new Economy(db, accounts), matches: new Matches(db, accounts) };
};

test('tags are stored, normalized and drive the admin flag', () => {
  const { accounts } = setup();
  const { id } = accounts.createUser({ name: 'Ryan' });
  assert.deepEqual(accounts.profile(id).tags, []);
  assert.equal(accounts.profile(id).admin, false);

  accounts.setTags(id, ['beta', 'nope', 'beta']);
  assert.deepEqual(accounts.tags(accounts.getUser(id)), ['beta']);
  assert.equal(accounts.isAdmin(accounts.getUser(id)), false);

  accounts.addTag(id, 'dev');
  assert.deepEqual(accounts.tags(accounts.getUser(id)), ['dev', 'beta'], 'tags keep catalog order');
  assert.equal(accounts.isAdmin(accounts.getUser(id)), true);
  assert.deepEqual(accounts.publicInfo(accounts.getUser(id)).tags, ['dev', 'beta']);
});

test('Supporter is ordered above Luckiest and cannot be granted as a stored tag', () => {
  const { accounts } = setup();
  const { id } = accounts.createUser({ name: 'Supporter' });
  assert.deepEqual(Object.keys(catalog.tags), ['dev', 'beta', 'supporter', 'halloween', 'lucky']);
  assert.equal(catalog.items.filter((item) => item.tag === 'supporter').length, 6);
  accounts.setTags(id, ['supporter', 'lucky', 'beta']);
  assert.deepEqual(accounts.tags(accounts.getUser(id)), ['beta']);
  assert.equal(accounts.owns(id, 'marble.supporter'), false);
  assert.throws(() => accounts.equip(id, 'marble', 'marble.supporter'), /Supporter only/);
  assert.throws(() => accounts.grantItem(id, 'marble.supporter'), /Supporter tag/);
  assert.ok(DROPPABLE.every((item) => item.tag !== 'supporter'));
});

test('Discord entitlement verification grants and revokes the entire Supporter set', async () => {
  const env = ['DISCORD_CLIENT_ID', 'DISCORD_BOT_TOKEN', 'DISCORD_SUPPORTER_SKU_ID'];
  const previous = env.map((key) => process.env[key]);
  const originalFetch = global.fetch;
  const appId = '123456789012345678';
  const skuId = '234567890123456789';
  const discordId = '345678901234567890';
  try {
    Object.assign(process.env, { DISCORD_CLIENT_ID: appId, DISCORD_BOT_TOKEN: 'test-bot-token', DISCORD_SUPPORTER_SKU_ID: skuId });
    const entitlement = { id: 'ent-1', application_id: appId, sku_id: skuId, user_id: discordId, deleted: false, consumed: false, ends_at: null };
    global.fetch = async (url, options) => {
      assert.equal(url.searchParams.get('user_id'), discordId);
      assert.equal(url.searchParams.get('sku_ids'), skuId);
      assert.equal(options.headers.Authorization, 'Bot test-bot-token');
      return { ok: true, json: async () => [
        { ...entitlement, id: 'wrong-user', user_id: 'not-the-buyer' },
        { ...entitlement, id: 'refunded', deleted: true },
        { ...entitlement, id: 'other-sku', sku_id: '456789012345678901' },
        { ...entitlement, id: 'future', starts_at: '2099-01-01T00:00:00Z' },
        { ...entitlement, id: 'expired', ends_at: '2020-01-01T00:00:00Z' },
        entitlement,
      ] };
    };
    const { accounts } = setup();
    const { id } = accounts.createUser({ name: 'S' });
    accounts.q.linkDiscord.run(discordId, null, id);
    assert.equal(await discord.supporterEntitlement(discordId), 'ent-1');
    assert.equal(accounts.setSupporter(id, 'ent-1'), true);
    assert.deepEqual(accounts.tags(accounts.getUser(id)), ['supporter']);
    for (const item of catalog.items.filter((item) => item.tag === 'supporter')) assert.equal(accounts.owns(id, item.id), true);
    accounts.equip(id, 'marble', 'marble.supporter');
    global.fetch = async () => ({ ok: true, json: async () => [{ ...entitlement, deleted: true }] });
    assert.equal(await discord.supporterEntitlement(discordId), null);
    accounts.setSupporter(id, null);
    assert.deepEqual(accounts.tags(accounts.getUser(id)), []);
    assert.equal(accounts.equipped(accounts.getUser(id)).marble, 'marble.classic');
    accounts.setSupporter(id, 'ent-1');
    delete process.env.DISCORD_BOT_TOKEN;
    assert.equal(accounts.owns(id, 'marble.supporter'), false, 'unconfigured verification fails closed');
  } finally {
    env.forEach((key, i) => { if (previous[i] === undefined) delete process.env[key]; else process.env[key] = previous[i]; });
    global.fetch = originalFetch;
  }
});

test('Halloween Pack is verified through its own SKU, keeps Supporter separate, and is only sold in October', async () => {
  const env = ['DISCORD_CLIENT_ID', 'DISCORD_BOT_TOKEN', 'DISCORD_SUPPORTER_SKU_ID', 'DISCORD_HALLOWEEN_SKU_ID'];
  const previous = env.map((key) => process.env[key]);
  const originalFetch = global.fetch;
  const appId = '123456789012345678';
  const supporterSku = '234567890123456789';
  const halloweenSku = '567890123456789012';
  const discordId = '345678901234567890';
  try {
    Object.assign(process.env, { DISCORD_CLIENT_ID: appId, DISCORD_BOT_TOKEN: 'test-bot-token', DISCORD_SUPPORTER_SKU_ID: supporterSku, DISCORD_HALLOWEEN_SKU_ID: halloweenSku });
    const entitlement = (sku, id) => ({ id, application_id: appId, sku_id: sku, user_id: discordId, deleted: false, consumed: false, ends_at: null });
    global.fetch = async (url) => ({ ok: true, json: async () => [entitlement(url.searchParams.get('sku_ids'), `ent-${url.searchParams.get('sku_ids')}`)] });
    assert.equal(await discord.halloweenEntitlement(discordId), `ent-${halloweenSku}`);
    global.fetch = async () => ({ ok: true, json: async () => [entitlement(supporterSku, 'only-supporter')] });
    assert.equal(await discord.halloweenEntitlement(discordId), null, 'a Supporter entitlement never unlocks Halloween');
    assert.equal(await discord.supporterEntitlement(discordId), 'only-supporter');

    const { accounts } = setup();
    const { id } = accounts.createUser({ name: 'H' });
    const halloweenItems = catalog.items.filter((item) => item.tag === 'halloween');
    assert.deepEqual(halloweenItems.map((item) => item.slot).sort(), ['board', 'dice', 'fx', 'marble', 'nameplate', 'trail']);
    accounts.setTags(id, ['halloween']);
    assert.deepEqual(accounts.tags(accounts.getUser(id)), [], 'halloween cannot be a stored tag');
    assert.throws(() => accounts.grantItem(id, 'marble.halloween'), /Haunted tag/);
    assert.throws(() => accounts.equip(id, 'marble', 'marble.halloween'), /Haunted only/);
    assert.equal(accounts.setHalloween(id, 'ent-h'), true);
    assert.equal(accounts.setHalloween(id, 'ent-h'), false);
    assert.deepEqual(accounts.tags(accounts.getUser(id)), ['halloween']);
    halloweenItems.forEach((item) => assert.equal(accounts.owns(id, item.id), true));
    assert.equal(accounts.owns(id, 'marble.supporter'), false);
    accounts.equip(id, 'nameplate', 'plate.halloween');
    assert.equal(accounts.q.purchaserAccounts.all().length, 0, 'unlinked accounts are never re-verified');
    accounts.q.linkDiscord.run(discordId, null, id);
    assert.equal(accounts.q.purchaserAccounts.all().length, 1);
    accounts.setHalloween(id, null);
    assert.deepEqual(accounts.tags(accounts.getUser(id)), []);
    assert.equal(accounts.equipped(accounts.getUser(id)).nameplate, 'plate.basic');
    accounts.setHalloween(id, 'ent-h');
    delete process.env.DISCORD_HALLOWEEN_SKU_ID;
    assert.equal(accounts.owns(id, 'dice.halloween'), false, 'unconfigured verification fails closed');

    assert.equal(discord.halloweenOpen(Date.parse('2026-10-01T00:00:00Z')), true);
    assert.equal(discord.halloweenOpen(Date.parse('2026-10-31T23:59:59Z')), true);
    assert.equal(discord.halloweenOpen(Date.parse('2026-09-30T23:59:59Z')), false);
    assert.equal(discord.halloweenOpen(Date.parse('2026-11-01T00:00:00Z')), false);
  } finally {
    env.forEach((key, i) => { if (previous[i] === undefined) delete process.env[key]; else process.env[key] = previous[i]; });
    global.fetch = originalFetch;
  }
});

test('tag-exclusive cosmetics are owned through the tag, never dropped or sold', () => {
  const { accounts, economy } = setup();
  const { id } = accounts.createUser({ name: 'A' });
  const devItems = catalog.items.filter((i) => i.tag === 'dev');
  assert.equal(devItems.length, 6, 'a full dev set: marble, board, dice, nameplate, kill effect, trail');
  assert.equal(catalog.items.filter((i) => i.tag === 'beta').length, 6);

  assert.equal(accounts.owns(id, 'marble.dev'), false);
  assert.throws(() => accounts.equip(id, 'marble', 'marble.dev'), /Dev only/);

  accounts.setTags(id, ['beta']);
  assert.equal(accounts.owns(id, 'marble.beta'), true);
  assert.equal(accounts.owns(id, 'marble.dev'), false);
  assert.equal(accounts.owns(id, 'marble.holo'), false);

  accounts.setTags(id, ['dev']);
  assert.equal(accounts.owns(id, 'marble.dev'), true);
  assert.ok(catalog.items.every((i) => accounts.owns(id, i.id)), 'dev unlocks every cosmetic');
  accounts.equip(id, 'dice', 'dice.lucky');
  accounts.equip(id, 'marble', 'marble.dev');
  assert.equal(accounts.equipped(accounts.getUser(id)).marble, 'marble.dev');

  accounts.setTags(id, []);
  assert.equal(accounts.equipped(accounts.getUser(id)).marble, 'marble.classic', 'losing the tag unequips its cosmetics');

  assert.ok(DROPPABLE.every((i) => !i.tag));
  assert.ok(featuredFor(utcDay()).every((f) => !catalog.items.find((i) => i.id === f.id).tag));
  economy.credit(id, 100000, 'test');
  for (let i = 0; i < 80; i++) {
    const drop = economy.openBox(id, 'box.basic').item;
    assert.ok(!catalog.items.find((it) => it.id === drop).tag, `${drop} should never drop`);
  }
  assert.throws(() => accounts.grantItem(id, 'dice.dev'), /comes with the Dev tag/);
  assert.ok(BOXES.size === 2);
  for (let seed = 0; seed < 200; seed++) {
    const worn = Object.values(botCosmetics(seed)).map((itemId) => catalog.items.find((i) => i.id === itemId));
    assert.ok(worn.every((i) => !i.tag && ['common', 'rare'].includes(i.rarity)), 'bots wear common or rare gear, never exclusives');
  }
});

function recordLuckyGame(matches, user, rolls, sixes, now, played = {}) {
  matches.record({ code: 'LUCK', seats: [{ name: user.name, userId: user.id }, { name: 'Bot', isBot: true }], game: {
    phase: 'over', mode: 'solo', winners: [0], active: [0, 1], marbles: [[], []],
    stats: [{ rolls, sixes, captures: 0 }, { rolls: 0, sixes: 0 }], played: [played, {}],
  } }, now);
}

test('Luckiest uses 10 recorded games, z-scores, completed-game updates, and cumulative reign time', () => {
  const { db, accounts, matches } = setup();
  const a = accounts.createUser({ name: 'A' });
  const b = accounts.createUser({ name: 'B' });
  const day = 86400000;
  const start = Date.parse('2026-04-01T12:00:00Z');
  for (let i = 0; i < 9; i++) {
    recordLuckyGame(matches, a, 60, 15, start + i);
    recordLuckyGame(matches, b, 6, 2, start + i);
  }
  assert.equal(accounts.refreshLucky(start + 9), null);
  assert.equal(accounts.luckyHolder(), null);
  recordLuckyGame(matches, a, 60, 15, start + 10);
  recordLuckyGame(matches, b, 6, 2, start + 10);
  assert.ok(accounts.luckWindow(a.id, start + 10).score > accounts.luckWindow(b.id, start + 10).score);
  assert.ok(accounts.luckWindow(a.id, start + 10).rate < accounts.luckWindow(b.id, start + 10).rate);
  assert.equal(accounts.refreshLucky(start + 10).holder, a.id);
  assert.equal(accounts.luckyHolder(), a.id);
  assert.deepEqual(accounts.tags(accounts.getUser(a.id)), ['lucky']);
  assert.equal(accounts.owns(a.id, 'dice.lucky'), false, 'holding the title does not grant the die');
  recordLuckyGame(matches, b, 6, 6, start + 2 * day);
  assert.equal(accounts.luckyHolder(), a.id, 'a completed game changes nothing before recalculation');
  assert.equal(accounts.refreshLucky(start + 2 * day), null);
  recordLuckyGame(matches, b, 6, 6, start + 2 * day + 1);
  assert.equal(accounts.refreshLucky(start + 2 * day + 1).holder, b.id);
  assert.equal(accounts.getUser(a.id).luckiest_total_seconds, 2 * 86400 - 1);
  assert.equal(accounts.getUser(a.id).luckiest_reign_count, 1);
  assert.equal(db.prepare('SELECT duration_seconds FROM luckiest_reigns WHERE player_id = ?').get(a.id).duration_seconds, 2 * 86400 - 1);
  recordLuckyGame(matches, a, 60, 60, start + 3 * day);
  assert.equal(accounts.refreshLucky(start + 3 * day).reclaimed, true);
  assert.equal(accounts.luckyHolder(), a.id);
  assert.equal(accounts.refreshLucky(start + 4 * day - 1000, { inactivityOnly: true }), null);
  const unlock = accounts.refreshLucky(start + 4 * day + 1000, { inactivityOnly: true });
  assert.deepEqual(unlock.unlocked, [a.id]);
  assert.equal(accounts.profile(a.id).lucky.goldenDieUnlocked, true);
  assert.equal(accounts.getUser(a.id).luckiest_reign_count, 2);
  assert.equal(accounts.profile(a.id).lucky.totalSeconds >= 3 * 86400, true);
  assert.ok(accounts.owns(a.id, 'dice.lucky'));
  accounts.equip(a.id, 'dice', 'dice.lucky');
  recordLuckyGame(matches, b, 600, 600, start + 9 * day);
  accounts.refreshLucky(start + 9 * day);
  assert.equal(accounts.equipped(accounts.getUser(a.id)).dice, 'dice.lucky', 'the die is permanent after losing the tag');
  accounts.setTags(a.id, ['lucky', 'beta']);
  assert.deepEqual(accounts.tags(accounts.getUser(a.id)), ['beta']);
  assert.throws(() => accounts.grantItem(a.id, 'dice.lucky'), /Luckiest tag/);
});

test('Golden Die unlocks at exactly three active days, once', () => {
  const { accounts, matches } = setup();
  const a = accounts.createUser({ name: 'A' });
  const start = Date.parse('2026-06-01T12:00:00Z');
  for (let i = 0; i < 10; i++) recordLuckyGame(matches, a, 12, 3, start - 10 + i);
  assert.equal(accounts.refreshLucky(start).holder, a.id);
  assert.equal(accounts.refreshLucky(start + 259199000, { inactivityOnly: true }), null);
  assert.deepEqual(accounts.refreshLucky(start + 259200000, { inactivityOnly: true }).unlocked, [a.id]);
  assert.equal(accounts.getUser(a.id).golden_die_unlocked_at, start + 259200000);
  assert.equal(accounts.refreshLucky(start + 259201000, { inactivityOnly: true }), null);
});

test('previous non-holders who already reached three cumulative days receive the Golden Die', () => {
  const { db, accounts } = setup();
  const user = accounts.createUser({ name: 'Former holder' });
  db.prepare('UPDATE users SET luckiest_total_seconds = ? WHERE id = ?').run(3 * 86400, user.id);
  const now = Date.parse('2026-06-04T12:00:00Z');
  assert.deepEqual(accounts.refreshGoldenUnlocks(now), [user.id]);
  assert.equal(accounts.getUser(user.id).golden_die_unlocked_at, now);
  assert.ok(accounts.owns(user.id, 'dice.lucky'));
  assert.deepEqual(accounts.refreshGoldenUnlocks(now + 1000), []);
});

test('inactive holders relinquish Luckiest, while legacy games and bot turns do not fabricate a luck score', () => {
  const { db, accounts, matches } = setup();
  const a = accounts.createUser({ name: 'A' });
  const b = accounts.createUser({ name: 'B' });
  const day = 86400000;
  const start = Date.parse('2026-05-01T12:00:00Z');
  db.prepare('INSERT INTO matches (code, mode, players, bots, turns, seats, winners, started_at, ended_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('OLD', 'solo', 1, 1, 10, '[]', '[0]', start, start);
  db.prepare('INSERT INTO match_players (match_id, user_id, seat, won) VALUES (1, ?, 0, 1)').run(a.id);
  for (let i = 0; i < 10; i++) {
    recordLuckyGame(matches, a, 60, 14, start + i + 1);
    recordLuckyGame(matches, b, 6, 1, start + day + i);
  }
  assert.equal(accounts.luckWindow(a.id, start + day + 10).games, 10, 'unknown legacy roll totals are excluded');
  assert.equal(accounts.refreshLucky(start + day + 10).holder, a.id);
  assert.equal(accounts.refreshLucky(start + 14 * day + 60000, { inactivityOnly: true }).holder, b.id);
  assert.equal(accounts.getUser(a.id).luckiest_total_seconds, 13 * 86400);
  assert.equal(db.prepare('SELECT ended_at FROM luckiest_reigns WHERE player_id = ?').get(a.id).ended_at, start + 14 * day + 10);
  assert.equal(accounts.refreshLucky(start + 15 * day + 10, { inactivityOnly: true }).holder, null);
  const c = accounts.createUser({ name: 'C' });
  for (let i = 0; i < 10; i++) recordLuckyGame(matches, c, 9, 3, start + 16 * day + i, { coveredRolls: 9, coveredSixes: 3 });
  assert.equal(accounts.luckWindow(c.id, start + 16 * day + 20).games, 10);
  assert.equal(accounts.luckWindow(c.id, start + 16 * day + 20).eligible, false, 'no personally rolled dice means no measurable score');
  assert.equal(accounts.refreshLucky(start + 16 * day + 20), null);
});

test('only completed games store human-rolled dice, excluding bot and partner coverage', () => {
  const { db, accounts, matches } = setup();
  const a = accounts.createUser({ name: 'A' });
  const room = { code: 'REAL', seats: [{ name: 'A', userId: a.id }, { name: 'Bot', isBot: true }], game: {
    phase: 'move', mode: 'solo', winners: [0], active: [0, 1], marbles: [[], []],
    stats: [{ rolls: 12, sixes: 4, captures: 0 }, { rolls: 0, sixes: 0 }],
    played: [{ coveredRolls: 5, coveredSixes: 2 }, {}],
  } };
  matches.record(room);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM matches').get().n, 0);
  room.game.phase = 'over';
  matches.record(room);
  assert.deepEqual({ ...db.prepare('SELECT roll_count, six_count FROM match_players').get() }, { roll_count: 7, six_count: 2 });
});

test('linking a guest preserves an active reign and its recorded games', () => {
  const { accounts, matches } = setup();
  const guest = accounts.createUser({ name: 'Guest' });
  const account = accounts.loginDiscord({ id: 'lucky-merge', username: 'Saved' });
  const now = Date.now();
  for (let i = 0; i < 10; i++) recordLuckyGame(matches, guest, 12, 5, now - 100 + i);
  assert.equal(accounts.refreshLucky(now).holder, guest.id);
  const merged = accounts.loginDiscord({ id: 'lucky-merge', username: 'Saved' }, guest.id);
  assert.equal(merged.id, account.id);
  assert.equal(accounts.luckyHolder(), account.id);
  assert.equal(accounts.luckWindow(account.id, now).games, 10);
  assert.equal(accounts.getUser(account.id).luckiest_reign_count, 1);
  assert.deepEqual(accounts.tags(accounts.getUser(account.id)), ['lucky']);
});

test('daily SQLite backups include committed WAL data and never overwrite earlier snapshots', (t) => {
  const file = path.join(os.tmpdir(), `marralhinha-backup-test-${randomBytes(8).toString('hex')}.db`);
  const db = openDb(file);
  t.after(() => {
    db.close();
    const prefix = path.basename(file, '.db');
    for (const name of fs.readdirSync(os.tmpdir()).filter((name) => name.startsWith(prefix))) fs.unlinkSync(path.join(os.tmpdir(), name));
  });
  const accounts = new Accounts(db);
  accounts.createUser({ name: 'First' });
  const day = Date.parse('2026-09-30T12:00:00Z');
  fs.writeFileSync(path.join(os.tmpdir(), `${path.basename(file, '.db')}-2026-09-30-corrupt.sqlite`), 'not a backup');
  const first = backupDb(db, file, day, os.tmpdir());
  assert.ok(first && first.endsWith('.sqlite'));
  assert.equal(backupDb(db, file, day + 3600000, os.tmpdir()), null);
  accounts.createUser({ name: 'Second' });
  const second = backupDb(db, file, day + 86400000, os.tmpdir());
  assert.ok(second && second !== first);
  for (const [snapshot, expected] of [[first, 1], [second, 2]]) {
    const copy = new DatabaseSync(snapshot, { readOnly: true });
    assert.equal(copy.prepare('SELECT COUNT(*) AS n FROM users').get().n, expected);
    assert.equal(copy.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
    copy.close();
  }
  const memory = openDb(':memory:');
  assert.equal(backupDb(memory, ':memory:'), null);
  memory.close();
});

test('migration preserves previously earned Fortune dice without inventing old game rolls', () => {
  const db = new DatabaseSync(':memory:');
  db.exec("CREATE TABLE users (id TEXT PRIMARY KEY); CREATE TABLE inventory (user_id TEXT, item_id TEXT); CREATE TABLE match_players (match_id INTEGER, user_id TEXT, seat INTEGER, won INTEGER); INSERT INTO users (id) VALUES ('old'), ('new'); INSERT INTO inventory VALUES ('old', 'dice.lucky'); INSERT INTO match_players VALUES (1, 'old', 0, 1)");
  migrate(db);
  migrate(db);
  assert.equal(db.prepare("SELECT golden_die_unlocked FROM users WHERE id = 'old'").get().golden_die_unlocked, 1);
  assert.equal(db.prepare("SELECT golden_die_unlocked FROM users WHERE id = 'new'").get().golden_die_unlocked, 0);
  assert.deepEqual({ ...db.prepare('SELECT roll_count, six_count FROM match_players').get() }, { roll_count: null, six_count: null });
  db.close();
});

test('admin grants: coins, items, names', () => {
  const { accounts } = setup();
  const { id } = accounts.createUser({ name: 'A' });
  const before = accounts.getUser(id).coins;
  accounts.grantCoins(id, 500, 'admin:test');
  assert.equal(accounts.getUser(id).coins, before + 500);
  accounts.grantCoins(id, -100000, 'admin:test');
  assert.equal(accounts.getUser(id).coins, 0, 'balances never go negative');
  assert.throws(() => accounts.grantCoins(id, 0, 'x'), /amount/);
  assert.throws(() => accounts.grantCoins(id, 5000000, 'x'), /amount/);

  accounts.grantItem(id, 'marble.holo');
  assert.ok(accounts.owns(id, 'marble.holo'));
  assert.throws(() => accounts.grantItem(id, 'marble.classic'), /Unknown item/);
  assert.throws(() => accounts.grantItem('missing', 'marble.holo'), /Account not found/);

  accounts.rename(id, '  New Name  ');
  assert.equal(accounts.getUser(id).name, 'New Name');
});

test('search finds by id, discord id and name; merging keeps tags from both accounts', () => {
  const { accounts } = setup();
  const ana = accounts.createUser({ name: 'Ana Marbles' });
  accounts.createUser({ name: 'Bruno' });
  assert.deepEqual(accounts.search('ana').map((u) => u.id), [ana.id]);
  assert.deepEqual(accounts.search(ana.id).map((u) => u.id), [ana.id]);
  assert.equal(accounts.search('').length, 2, 'empty query lists recent players');
  assert.equal(accounts.search('', 40, { guests: false }).length, 0, 'fresh guests are hidden without the guests flag');
  assert.equal(accounts.search('%').length, 0, 'wildcards are escaped');
  assert.deepEqual(accounts.userCount(), { total: 2, throwaway: 2 });
  accounts.setTags(ana.id, ['beta']);
  assert.deepEqual(accounts.search('#tagged').map((u) => u.id), [ana.id]);
  assert.deepEqual(accounts.search('', 40, { guests: false }).map((u) => u.id), [ana.id], 'a tag makes a guest a real player');
  assert.deepEqual(accounts.search('ana', 40, { guests: false }).map((u) => u.id), [ana.id]);

  const linked = accounts.loginDiscord({ id: '777', username: 'ana' }, ana.id);
  assert.deepEqual(accounts.search('777').map((u) => u.id), [linked.id]);

  const guest = accounts.createUser({ name: 'Guest' });
  accounts.setTags(guest.id, ['dev']);
  const merged = accounts.loginDiscord({ id: '777', username: 'ana' }, guest.id);
  assert.deepEqual(accounts.tags(merged), ['dev', 'beta']);
});

test('DEV_DISCORD_IDS bootstraps the dev tag on discord login', () => {
  const { accounts } = setup();
  const previous = process.env.DEV_DISCORD_IDS;
  process.env.DEV_DISCORD_IDS = ' 123 , 456';
  try {
    const dev = accounts.loginDiscord({ id: '123', username: 'ryan' });
    assert.deepEqual(accounts.tags(dev), ['dev']);
    const again = accounts.loginDiscord({ id: '123', username: 'ryan' });
    assert.deepEqual(accounts.tags(again), ['dev']);
    const other = accounts.loginDiscord({ id: '999', username: 'someone' });
    assert.deepEqual(accounts.tags(other), []);
  } finally {
    if (previous === undefined) delete process.env.DEV_DISCORD_IDS;
    else process.env.DEV_DISCORD_IDS = previous;
  }
});
