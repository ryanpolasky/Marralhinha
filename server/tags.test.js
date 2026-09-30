const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { openDb, migrate } = require('./db');
const { Accounts } = require('./accounts');
const { Economy, featuredFor, utcDay, botCosmetics } = require('./economy');
const { catalog, DROPPABLE, BOXES } = require('./catalog');
const { Matches } = require('./matches');

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

test('tag-exclusive cosmetics are owned through the tag, never dropped or sold', () => {
  const { accounts, economy } = setup();
  const { id } = accounts.createUser({ name: 'A' });
  const devItems = catalog.items.filter((i) => i.tag === 'dev');
  assert.equal(devItems.length, 4, 'a full dev set: marble, board, dice, nameplate');
  assert.equal(catalog.items.filter((i) => i.tag === 'beta').length, 4);

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

test('Luckiest uses 20 recorded games, z-scores, completed-game updates, and cumulative reign time', () => {
  const { db, accounts, matches } = setup();
  const a = accounts.createUser({ name: 'A' });
  const b = accounts.createUser({ name: 'B' });
  const day = 86400000;
  const start = Date.parse('2026-04-01T12:00:00Z');
  for (let i = 0; i < 19; i++) {
    recordLuckyGame(matches, a, 60, 14, start + i);
    recordLuckyGame(matches, b, 6, 2, start + i);
  }
  assert.equal(accounts.refreshLucky(start + 19), null);
  assert.equal(accounts.luckyHolder(), null);
  recordLuckyGame(matches, a, 60, 14, start + 20);
  recordLuckyGame(matches, b, 6, 2, start + 20);
  assert.ok(accounts.luckWindow(a.id, start + 20).score > accounts.luckWindow(b.id, start + 20).score);
  assert.ok(accounts.luckWindow(a.id, start + 20).rate < accounts.luckWindow(b.id, start + 20).rate);
  assert.equal(accounts.refreshLucky(start + 20).holder, a.id);
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
  assert.equal(accounts.refreshLucky(start + 8 * day - 1000, { inactivityOnly: true }), null);
  const unlock = accounts.refreshLucky(start + 8 * day + 1000, { inactivityOnly: true });
  assert.deepEqual(unlock.unlocked, [a.id]);
  assert.equal(accounts.profile(a.id).lucky.goldenDieUnlocked, true);
  assert.equal(accounts.getUser(a.id).luckiest_reign_count, 2);
  assert.equal(accounts.profile(a.id).lucky.totalSeconds >= 7 * 86400, true);
  assert.ok(accounts.owns(a.id, 'dice.lucky'));
  accounts.equip(a.id, 'dice', 'dice.lucky');
  recordLuckyGame(matches, b, 600, 600, start + 9 * day);
  accounts.refreshLucky(start + 9 * day);
  assert.equal(accounts.equipped(accounts.getUser(a.id)).dice, 'dice.lucky', 'the die is permanent after losing the tag');
  accounts.setTags(a.id, ['lucky', 'beta']);
  assert.deepEqual(accounts.tags(accounts.getUser(a.id)), ['beta']);
  assert.throws(() => accounts.grantItem(a.id, 'dice.lucky'), /Luckiest tag/);
});

test('Golden Die unlocks at exactly seven active days, once', () => {
  const { accounts, matches } = setup();
  const a = accounts.createUser({ name: 'A' });
  const start = Date.parse('2026-06-01T12:00:00Z');
  for (let i = 0; i < 20; i++) recordLuckyGame(matches, a, 12, 3, start - 20 + i);
  assert.equal(accounts.refreshLucky(start).holder, a.id);
  assert.equal(accounts.refreshLucky(start + 604799000, { inactivityOnly: true }), null);
  assert.deepEqual(accounts.refreshLucky(start + 604800000, { inactivityOnly: true }).unlocked, [a.id]);
  assert.equal(accounts.getUser(a.id).golden_die_unlocked_at, start + 604800000);
  assert.equal(accounts.refreshLucky(start + 604801000, { inactivityOnly: true }), null);
});

test('inactive holders relinquish Luckiest, while legacy games and bot turns do not fabricate a luck score', () => {
  const { db, accounts, matches } = setup();
  const a = accounts.createUser({ name: 'A' });
  const b = accounts.createUser({ name: 'B' });
  const day = 86400000;
  const start = Date.parse('2026-05-01T12:00:00Z');
  db.prepare('INSERT INTO matches (code, mode, players, bots, turns, seats, winners, started_at, ended_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('OLD', 'solo', 1, 1, 10, '[]', '[0]', start, start);
  db.prepare('INSERT INTO match_players (match_id, user_id, seat, won) VALUES (1, ?, 0, 1)').run(a.id);
  for (let i = 0; i < 20; i++) {
    recordLuckyGame(matches, a, 60, 14, start + i + 1);
    recordLuckyGame(matches, b, 6, 1, start + day + i);
  }
  assert.equal(accounts.luckWindow(a.id, start + day + 20).games, 20, 'unknown legacy roll totals are excluded');
  assert.equal(accounts.refreshLucky(start + day + 20).holder, a.id);
  assert.equal(accounts.refreshLucky(start + 14 * day + 60000, { inactivityOnly: true }).holder, b.id);
  assert.equal(accounts.getUser(a.id).luckiest_total_seconds, 13 * 86400);
  assert.equal(db.prepare('SELECT ended_at FROM luckiest_reigns WHERE player_id = ?').get(a.id).ended_at, start + 14 * day + 20);
  assert.equal(accounts.refreshLucky(start + 15 * day + 20, { inactivityOnly: true }).holder, null);
  const c = accounts.createUser({ name: 'C' });
  for (let i = 0; i < 20; i++) recordLuckyGame(matches, c, 9, 3, start + 16 * day + i, { coveredRolls: 9, coveredSixes: 3 });
  assert.equal(accounts.luckWindow(c.id, start + 16 * day + 20).games, 20);
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
  for (let i = 0; i < 20; i++) recordLuckyGame(matches, guest, 12, 5, now - 100 + i);
  assert.equal(accounts.refreshLucky(now).holder, guest.id);
  const merged = accounts.loginDiscord({ id: 'lucky-merge', username: 'Saved' }, guest.id);
  assert.equal(merged.id, account.id);
  assert.equal(accounts.luckyHolder(), account.id);
  assert.equal(accounts.luckWindow(account.id, now).games, 20);
  assert.equal(accounts.getUser(account.id).luckiest_reign_count, 1);
  assert.deepEqual(accounts.tags(accounts.getUser(account.id)), ['lucky']);
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
