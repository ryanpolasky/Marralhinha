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
  assert.deepEqual(Object.keys(catalog.tags), ['dev', 'beta', 'supporter', 'lucky', 'halloween']);
  assert.equal(catalog.items.filter((item) => item.tag === 'supporter').length, 6);
  accounts.setTags(id, ['supporter', 'lucky', 'beta']);
  assert.deepEqual(accounts.tags(accounts.getUser(id)), ['beta']);
  assert.equal(accounts.owns(id, 'marble.supporter'), false);
  assert.throws(() => accounts.equip(id, 'marble', 'marble.supporter'), /Supporter only/);
  assert.throws(() => accounts.grantItem(id, 'marble.supporter'), /Supporter tag/);
  assert.ok(DROPPABLE.every((item) => item.tag !== 'supporter'));
});

test('a tag loadout puts the main tag then shorthands first, and only accepts held tags', () => {
  const { accounts } = setup();
  const { id } = accounts.createUser({ name: 'Many' });
  accounts.setTags(id, ['beta']);
  accounts.setPack(id, 'supporter', true);
  accounts.setPack(id, 'halloween', true);
  const tags = () => accounts.tags(accounts.getUser(id));
  assert.deepEqual(tags(), ['beta', 'supporter', 'halloween']);
  accounts.setTagLoadout(id, 'halloween', ['supporter']);
  assert.deepEqual(tags(), ['halloween', 'supporter', 'beta']);
  accounts.setTagLoadout(id, null, ['halloween', 'beta']);
  assert.deepEqual(tags(), ['supporter', 'halloween', 'beta'], 'unset main falls back to the best non-shorthand');
  assert.throws(() => accounts.setTagLoadout(id, 'dev', []), /don't have/);
  assert.throws(() => accounts.setTagLoadout(id, null, ['beta', 'supporter', 'halloween']), /up to 2/);
  accounts.setTagLoadout(id, null, []);
  assert.deepEqual(tags(), ['beta', 'supporter', 'halloween']);
  assert.deepEqual(accounts.profile(id).tagLoadout, { main: null, shorthands: [] });
});

test('devs can put any tag in their loadout', () => {
  const { accounts } = setup();
  const { id } = accounts.createUser({ name: 'Ryan' });
  accounts.setTags(id, ['dev']);
  accounts.setTagLoadout(id, 'halloween', ['supporter']);
  assert.deepEqual(accounts.tags(accounts.getUser(id)), ['halloween', 'supporter', 'dev']);
  accounts.setTagLoadout(id, null, []);
  assert.deepEqual(accounts.tags(accounts.getUser(id)), ['dev']);
});

test('admin-granted packs unlock the tag and cosmetics without an entitlement', () => {
  const { accounts } = setup();
  const { id } = accounts.createUser({ name: 'Gifted' });
  accounts.setPack(id, 'supporter', true);
  assert.deepEqual(accounts.tags(accounts.getUser(id)), ['supporter']);
  assert.equal(accounts.owns(id, 'marble.supporter'), true);
  assert.equal(accounts.owns(id, 'marble.halloween'), false);
  assert.equal(accounts.adminView(accounts.getUser(id)).packs.supporter, true);
  accounts.setTags(id, ['beta']);
  assert.deepEqual(accounts.tags(accounts.getUser(id)), ['beta', 'supporter'], 'tag edits keep the pack');
  accounts.setPack(id, 'supporter', false);
  assert.deepEqual(accounts.tags(accounts.getUser(id)), ['beta']);
  assert.throws(() => accounts.setPack(id, 'nope', true), /Unknown pack/);
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

test('Luckiest follows the month\'s best single-game six rate, with a minimum of own rolls', () => {
  const { db, accounts, matches } = setup();
  const a = accounts.createUser({ name: 'A' });
  const b = accounts.createUser({ name: 'B' });
  const start = Date.parse('2026-04-01T12:00:00Z');
  assert.equal(accounts.refreshLucky(start), null);
  recordLuckyGame(matches, b, 29, 20, start + 1);
  recordLuckyGame(matches, a, 30, 6, start + 2);
  recordLuckyGame(matches, a, 120, 18, start + 3);
  assert.equal(accounts.refreshLucky(start + 3).holder, a.id, 'tiny games never qualify');
  assert.deepEqual(accounts.tags(accounts.getUser(a.id)), ['lucky']);
  assert.equal(accounts.luckyStatus(accounts.getUser(a.id), start + 3).best.rate, 0.2, 'best single game, not an aggregate');
  assert.equal(accounts.owns(a.id, 'dice.lucky'), false, 'holding the title does not grant the die');
  recordLuckyGame(matches, b, 60, 12, start + 4);
  assert.equal(accounts.refreshLucky(start + 4), null, 'ties go to whoever set the rate first');
  recordLuckyGame(matches, b, 40, 9, start + 5);
  const change = accounts.refreshLucky(start + 5);
  assert.equal(change.holder, b.id);
  assert.equal(change.previous, a.id);
  assert.equal(accounts.luckyStatus(accounts.getUser(a.id), start + 5).leader.name, 'B');
  recordLuckyGame(matches, a, 45, 30, start + 6, { coveredRolls: 20, coveredSixes: 20 });
  assert.equal(accounts.refreshLucky(start + 6), null, 'bot-covered rolls do not count toward the minimum');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM luckiest_reigns').get().n, 2);
});

test('a new month resets the race and crowns last month\'s champion with a reward pick', () => {
  const { accounts, matches } = setup();
  const a = accounts.createUser({ name: 'A' });
  const april = Date.parse('2026-04-10T12:00:00Z');
  const may = Date.parse('2026-05-01T00:00:00Z');
  accounts.refreshLucky(april);
  recordLuckyGame(matches, a, 50, 20, april);
  assert.equal(accounts.refreshLucky(april).holder, a.id);
  assert.deepEqual(accounts.profile(a.id).lucky.pending, []);
  const change = accounts.refreshLucky(may);
  assert.equal(change.holder, null, 'nobody leads a fresh month');
  assert.deepEqual(change.champions, [{ id: a.id, month: '2026-04', monthName: 'April 2026' }]);
  assert.equal(accounts.refreshLucky(may + 60000), null, 'a month is settled once');
  assert.equal(accounts.profile(a.id).lucky.monthsWon, 1);
  assert.deepEqual(accounts.profile(a.id).lucky.pending.map((p) => p.month), ['2026-04']);
  assert.equal(accounts.publicCard(accounts.getUser(a.id)).lucky.pending, undefined);
});

test('a lucky pick grants one unowned piece per month won, then coins once the set is complete', () => {
  const { accounts, matches } = setup();
  const a = accounts.createUser({ name: 'A' });
  const set = catalog.items.filter((i) => i.tag === 'lucky').map((i) => i.id);
  assert.equal(set.length, 6, 'a full Luckiest set: marble, board, dice, nameplate, kill effect, trail');
  accounts.refreshLucky(Date.parse('2025-12-15T00:00:00Z'));
  for (let m = 0; m < 7; m++) {
    const at = Date.UTC(2026, m, 15);
    recordLuckyGame(matches, a, 40, 10, at);
    accounts.refreshLucky(at);
  }
  accounts.refreshLucky(Date.UTC(2026, 7, 1));
  assert.equal(accounts.profile(a.id).lucky.pending.length, 7);
  assert.throws(() => accounts.claimLucky(a.id, '2026-09', 'dice.lucky'), /Nothing to claim/);
  assert.throws(() => accounts.claimLucky(a.id, '2026-01', 'marble.holo'), /Luckiest piece/);
  assert.deepEqual(accounts.claimLucky(a.id, '2026-01', 'dice.lucky'), { item: 'dice.lucky', coins: 0 });
  assert.ok(accounts.owns(a.id, 'dice.lucky'));
  assert.equal(accounts.getUser(a.id).golden_die_unlocked, 1);
  assert.throws(() => accounts.claimLucky(a.id, '2026-01', 'marble.lucky'), /Nothing to claim/, 'one pick per month');
  assert.throws(() => accounts.claimLucky(a.id, '2026-02', 'dice.lucky'), /Luckiest piece/, 'no duplicate pieces');
  set.filter((id) => id !== 'dice.lucky').forEach((id, i) => accounts.claimLucky(a.id, `2026-0${i + 2}`, id));
  assert.ok(set.every((id) => accounts.owns(a.id, id)));
  accounts.equip(a.id, 'marble', 'marble.lucky');
  const coins = accounts.getUser(a.id).coins;
  assert.deepEqual(accounts.claimLucky(a.id, '2026-07', null), { item: null, coins: 2500 });
  assert.equal(accounts.getUser(a.id).coins, coins + 2500);
  assert.deepEqual(accounts.profile(a.id).lucky.pending, []);
  recordLuckyGame(matches, accounts.createUser({ name: 'B' }), 30, 30, Date.UTC(2026, 7, 2));
  accounts.refreshLucky(Date.UTC(2026, 7, 2));
  assert.equal(accounts.equipped(accounts.getUser(a.id)).marble, 'marble.lucky', 'set pieces are permanent after losing the tag');
  assert.throws(() => accounts.grantItem(a.id, 'marble.lucky'), /Luckiest tag/);
});

test('admins can grant Luckiest picks and take cosmetics back, including a legacy Golden Die', () => {
  const { accounts } = setup();
  const a = accounts.createUser({ name: 'A' });
  accounts.db.prepare('UPDATE users SET golden_die_unlocked = 1 WHERE id = ?').run(a.id);
  assert.ok(accounts.owns(a.id, 'dice.lucky'));
  assert.ok(accounts.adminView(accounts.getUser(a.id)).owned.includes('dice.lucky'));
  accounts.revokeItem(a.id, 'dice.lucky');
  assert.ok(!accounts.owns(a.id, 'dice.lucky'));
  assert.throws(() => accounts.revokeItem(a.id, 'dice.lucky'), /doesn't own/);
  assert.throws(() => accounts.grantLuckyPick(a.id, -1), /no Luckiest picks/);
  accounts.grantLuckyPick(a.id, 1);
  accounts.grantLuckyPick(a.id, 1);
  assert.equal(accounts.adminView(accounts.getUser(a.id)).luckyPicks, 2);
  assert.deepEqual(accounts.profile(a.id).lucky.pending.map((p) => p.month), ['pick', 'pick']);
  assert.deepEqual(accounts.claimLucky(a.id, 'pick', 'board.lucky'), { item: 'board.lucky', coins: 0 });
  assert.equal(accounts.profile(a.id).lucky.pending.length, 1);
  accounts.grantLuckyPick(a.id, -1);
  assert.throws(() => accounts.claimLucky(a.id, 'pick', 'trail.lucky'), /Nothing to claim/);
  assert.equal(accounts.luckyStatus(accounts.getUser(a.id)).monthsWon, 0, 'granted picks are not month wins');
});

test('legacy games without roll totals never qualify for Luckiest', () => {
  const { db, accounts } = setup();
  const a = accounts.createUser({ name: 'A' });
  const now = Date.parse('2026-05-03T12:00:00Z');
  db.prepare('INSERT INTO matches (code, mode, players, bots, turns, seats, winners, started_at, ended_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('OLD', 'solo', 1, 1, 10, '[]', '[0]', now, now);
  db.prepare('INSERT INTO match_players (match_id, user_id, seat, won) VALUES (1, ?, 0, 1)').run(a.id);
  assert.equal(accounts.refreshLucky(now), null);
  assert.equal(accounts.luckyStatus(accounts.getUser(a.id), now).best, null);
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

test('linking a guest preserves an active reign, its recorded games and unclaimed months', () => {
  const { accounts, matches } = setup();
  const guest = accounts.createUser({ name: 'Guest' });
  const account = accounts.loginDiscord({ id: 'lucky-merge', username: 'Saved' });
  const april = Date.parse('2026-04-10T12:00:00Z');
  accounts.refreshLucky(april);
  recordLuckyGame(matches, guest, 40, 12, april);
  accounts.refreshLucky(Date.parse('2026-05-01T00:00:00Z'));
  recordLuckyGame(matches, guest, 40, 12, Date.parse('2026-05-02T00:00:00Z'));
  assert.equal(accounts.refreshLucky(Date.parse('2026-05-02T00:00:00Z')).holder, guest.id);
  const merged = accounts.loginDiscord({ id: 'lucky-merge', username: 'Saved' }, guest.id);
  assert.equal(merged.id, account.id);
  assert.equal(accounts.luckyHolder(), account.id);
  assert.equal(accounts.monthBest('2026-05', account.id).rolls, 40);
  assert.deepEqual(accounts.profile(account.id).lucky.pending.map((p) => p.month), ['2026-04']);
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

test('bans: account and ip, admins exempt', () => {
  const { accounts } = setup();
  const { id } = accounts.createUser({ name: 'Troll' });
  const admin = accounts.createUser({ name: 'Boss' });
  accounts.addTag(admin.id, 'dev');
  accounts.noteIp(accounts.getUser(id), '1.2.3.4');
  accounts.noteIp(accounts.getUser(admin.id), '1.2.3.4');
  assert.equal(accounts.banReason(accounts.getUser(id), '1.2.3.4'), null);
  accounts.ban(id, 'being rude', { ip: true });
  assert.equal(accounts.banReason(accounts.getUser(id), '9.9.9.9'), 'being rude');
  assert.ok(accounts.ipBanned('1.2.3.4'));
  assert.equal(accounts.banReason(accounts.getUser(admin.id), '1.2.3.4'), null, 'admins ignore ip bans');
  assert.throws(() => accounts.ban(admin.id, 'x'), /Admins/);
  assert.equal(accounts.search('#banned').length, 1);
  accounts.unban(id);
  assert.equal(accounts.banReason(accounts.getUser(id), '1.2.3.4'), null);
  assert.equal(accounts.bans().length, 0);
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

test('admin merge folds a guest into another account, sessions and shared matches included', () => {
  const { db, accounts } = setup();
  const old = accounts.createUser({ name: 'Lost' });
  const fresh = accounts.createUser({ name: 'NewPhone' });
  const freshToken = accounts.createSession(fresh.id);
  accounts.grantItem(old.id, DROPPABLE[0].id);
  accounts.grantItem(fresh.id, DROPPABLE[0].id);
  accounts.grantItem(fresh.id, DROPPABLE[1].id);
  accounts.setTags(fresh.id, ['beta']);
  db.exec("INSERT INTO matches (id, code, mode, players, bots, turns, seats, winners, started_at, ended_at) VALUES (1, 'AAAA', 'solo', 2, 0, 10, '[]', '[]', 0, 0), (2, 'BBBB', 'solo', 2, 0, 10, '[]', '[]', 0, 0)");
  db.prepare('INSERT INTO match_players (match_id, user_id, seat, won) VALUES (?, ?, ?, ?)').run(1, old.id, 0, 1);
  db.prepare('INSERT INTO match_players (match_id, user_id, seat, won) VALUES (?, ?, ?, ?)').run(1, fresh.id, 1, 0);
  db.prepare('INSERT INTO match_players (match_id, user_id, seat, won) VALUES (?, ?, ?, ?)').run(2, fresh.id, 0, 1);

  const kept = accounts.mergeAccounts(fresh.id, old.id);
  assert.equal(kept.id, old.id);
  assert.equal(kept.name, 'Lost');
  assert.equal(accounts.getUser(fresh.id), null);
  assert.equal(kept.coins, old.coins + fresh.coins);
  assert.equal(accounts.userForToken(freshToken).id, old.id, 'the new browser is now signed into the old account');
  assert.deepEqual(accounts.inventory(old.id).sort(), [DROPPABLE[0].id, DROPPABLE[1].id].sort());
  assert.deepEqual(accounts.tags(kept), ['beta']);
  assert.deepEqual(db.prepare('SELECT match_id FROM match_players WHERE user_id = ? ORDER BY match_id').all(old.id).map((r) => r.match_id), [1, 2]);

  const linked = accounts.loginDiscord({ id: '4242', username: 'disc' });
  const guest = accounts.createUser({ name: 'Other' });
  assert.throws(() => accounts.mergeAccounts(linked.id, guest.id), /Discord accounts/);
  assert.throws(() => accounts.mergeAccounts(guest.id, guest.id), /two different/);
  accounts.ban(guest.id, 'nope');
  assert.throws(() => accounts.mergeAccounts(guest.id, linked.id), /Unban/);
  accounts.unban(guest.id);
  assert.equal(accounts.mergeAccounts(guest.id, linked.id).discord_id, '4242');
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
