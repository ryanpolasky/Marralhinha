const test = require('node:test');
const assert = require('node:assert/strict');
const { openDb } = require('./db');
const { Accounts } = require('./accounts');
const { Economy, featuredFor, utcDay, botCosmetics } = require('./economy');
const { catalog, DROPPABLE, BOXES } = require('./catalog');

const setup = () => {
  const db = openDb(':memory:');
  const accounts = new Accounts(db);
  return { db, accounts, economy: new Economy(db, accounts) };
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

  accounts.setTags(id, ['dev']);
  assert.equal(accounts.owns(id, 'marble.dev'), true);
  assert.equal(accounts.owns(id, 'marble.beta'), false);
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
