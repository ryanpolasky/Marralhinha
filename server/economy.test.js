const test = require('node:test');
const assert = require('node:assert/strict');
const { openDb } = require('./db');
const { Accounts, levelInfo } = require('./accounts');
const { Economy, featuredFor, utcDay } = require('./economy');
const { catalog, BOXES, REWARDS } = require('./catalog');

function setup() {
  const db = openDb(':memory:');
  const accounts = new Accounts(db);
  const economy = new Economy(db, accounts);
  return { db, accounts, economy };
}

const fakeGame = ({ winners = [0], captures = [2, 0], home = [5, 1], variant = 'classic', marbles = 5 } = {}) => ({
  variant,
  winners,
  stats: captures.map((c) => ({ captures: c })),
  marbles: home.map((h) => Array.from({ length: marbles }, (_, i) => ({ zone: i < h ? 'home' : 'track', idx: 3 }))),
});

test('guests start with coins and sessions resolve to the user', () => {
  const { accounts } = setup();
  const user = accounts.createUser({ name: '  Ana  ' });
  assert.equal(user.name, 'Ana');
  assert.equal(user.coins, REWARDS.starting);
  const token = accounts.createSession(user.id);
  assert.equal(accounts.userForToken(token).id, user.id);
  assert.equal(accounts.userForToken('nope'), null);
  accounts.deleteSession(token);
  assert.equal(accounts.userForToken(token), null);
});

test('levels grow with xp', () => {
  assert.deepEqual(levelInfo(0), { level: 1, into: 0, need: 200 });
  assert.equal(levelInfo(199).level, 1);
  assert.equal(levelInfo(200).level, 2);
  assert.equal(levelInfo(200 + 275).level, 3);
});

test('daily bonus: once per day, streak grows on consecutive days', () => {
  const { accounts, economy } = setup();
  const { id } = accounts.createUser({ name: 'A' });
  const day1 = Date.parse('2026-01-01T10:00:00Z');
  const first = economy.claimDaily(id, day1);
  assert.equal(first.streak, 1);
  assert.equal(first.reward, REWARDS.daily.base);
  assert.throws(() => economy.claimDaily(id, day1 + 3600000), /Already claimed/);
  const second = economy.claimDaily(id, day1 + 86400000);
  assert.equal(second.streak, 2);
  assert.equal(second.reward, REWARDS.daily.base + REWARDS.daily.perStreakDay);
  assert.equal(economy.claimDaily(id, day1 + 4 * 86400000).streak, 1, 'missing a day resets the streak');
});

test('boxes cost coins, drop items, refund duplicates and honor pity', () => {
  const { accounts, economy } = setup();
  const { id } = accounts.createUser({ name: 'A' });
  const basic = BOXES.get('box.basic');
  assert.throws(() => {
    economy.credit(id, -accounts.getUser(id).coins, 'test');
    economy.openBox(id, 'box.basic');
  }, new RegExp(`more ${catalog.currency}`));

  economy.credit(id, basic.price * 200, 'test');
  const alwaysFirst = () => 0;
  const results = [];
  for (let i = 0; i < basic.pity.legendary; i++) results.push(economy.openBox(id, 'box.basic', alwaysFirst));
  const rarities = results.map((r) => r.rarity);
  assert.equal(rarities[basic.pity.epic - 1], 'epic', 'epic pity kicks in');
  assert.equal(rarities[basic.pity.legendary - 1], 'legendary', 'legendary pity kicks in');
  assert.ok(results.some((r) => r.duplicate && r.refund === catalog.rarities[r.rarity].dupe), 'duplicates refund coins');
  const owned = accounts.inventory(id);
  assert.equal(new Set(owned).size, owned.length);
  assert.ok(owned.includes(results[0].item));

  const gold = economy.openBox(id, 'box.gold', alwaysFirst);
  assert.notEqual(gold.rarity, 'common', 'gold box never drops commons');
});

test('match rewards: full for human games, halved and capped for bot games', () => {
  const { accounts, economy } = setup();
  const a = accounts.createUser({ name: 'A' });
  const b = accounts.createUser({ name: 'B' });
  const now = Date.parse('2026-02-02T12:00:00Z');
  const res = economy.awardGame({ game: fakeGame(), players: [{ seat: 0, userId: a.id }, { seat: 1, userId: b.id }], botGame: false, now });
  const expectedWin = REWARDS.finish + REWARDS.win + 2 * REWARDS.perCapture + 5 * REWARDS.perMarbleHome + REWARDS.firstWinOfDay;
  assert.equal(res[0].total - (res[0].leveledUp ? res[0].lines.at(-1).amount : 0), expectedWin);
  assert.equal(res[1].total, REWARDS.finish + REWARDS.perMarbleHome);
  assert.equal(accounts.getUser(a.id).wins, 1);

  const again = economy.awardGame({ game: fakeGame(), players: [{ seat: 0, userId: a.id }], botGame: false, now });
  assert.ok(!again[0].lines.some((l) => l.label === 'First win of the day'));

  const c = accounts.createUser({ name: 'C' });
  const totals = [];
  for (let i = 0; i < REWARDS.botGamesPerDay + 1; i++) {
    totals.push(economy.awardGame({ game: fakeGame({ winners: [1] }), players: [{ seat: 0, userId: c.id }], botGame: true, now }));
  }
  assert.equal(totals[0][0].total, Math.floor(REWARDS.finish * REWARDS.botGameMultiplier) + Math.floor(2 * REWARDS.perCapture * REWARDS.botGameMultiplier) + Math.floor(5 * REWARDS.perMarbleHome * REWARDS.botGameMultiplier));
  assert.equal(totals.at(-1)[0].total, 0, 'bot rewards stop after the daily cap');
  assert.match(totals.at(-1)[0].note, /used up/);
  const nextDay = economy.awardGame({ game: fakeGame({ winners: [1] }), players: [{ seat: 0, userId: c.id }], botGame: true, now: now + 86400000 });
  assert.ok(nextDay[0].total > 0, 'cap resets the next day');
});

test('blitz pays 60% of normal game rewards, never milestone bonuses', () => {
  const { accounts, economy } = setup();
  const a = accounts.createUser({ name: 'A' });
  const now = Date.parse('2026-04-01T12:00:00Z');
  const game = fakeGame({ variant: 'blitz', home: [3, 0], marbles: 3, captures: [2, 0] });
  const res = economy.awardGame({ game, players: [{ seat: 0, userId: a.id }], botGame: false, now });
  const expected =
    Math.floor(REWARDS.finish * 0.6) +
    Math.floor(REWARDS.win * 0.6) +
    Math.floor(2 * REWARDS.perCapture * 0.6) +
    Math.floor(3 * REWARDS.perMarbleHome * 0.6) +
    REWARDS.firstWinOfDay;
  assert.equal(res[0].total - (res[0].leveledUp ? res[0].lines.at(-1).amount : 0), expected);
  assert.equal(res[0].lines.find((l) => l.label === 'First win of the day').amount, REWARDS.firstWinOfDay);
  assert.match(res[0].note, /Blitz: 60% rewards/);
  assert.equal(accounts.getUser(a.id).games, 1);
  assert.equal(accounts.getUser(a.id).marbles_home, 3);
});

test('bot-carried players (>half their turns) get nothing unless Dev; covered sixes and captures never count', () => {
  const { accounts, economy } = setup();
  const a = accounts.createUser({ name: 'A' });
  const b = accounts.createUser({ name: 'B' });
  const now = Date.parse('2026-03-03T12:00:00Z');
  const game = {
    ...fakeGame({ captures: [3, 2] }),
    stats: [{ captures: 3, sixes: 4 }, { captures: 2, sixes: 3 }],
    played: [{ rolls: 10, botRolls: 6, coveredSixes: 2, coveredCaptures: 1 }, { rolls: 10, botRolls: 5, coveredSixes: 1, coveredCaptures: 2 }],
  };
  const res = economy.awardGame({ game, players: [{ seat: 0, userId: a.id }, { seat: 1, userId: b.id }], botGame: false, now });
  assert.equal(res[0].total, 0);
  assert.equal(res[0].botCarried, true);
  assert.match(res[0].note, /bot played most/);
  assert.equal(accounts.getUser(a.id).wins, 0, 'a bot-carried win is not a win');
  assert.equal(accounts.getUser(a.id).sixes, 2, 'only your own sixes count');
  assert.equal(accounts.getUser(a.id).captures, 2);

  assert.equal(res[1].botCarried, false, 'exactly half is still yours');
  assert.ok(!res[1].lines.some((l) => /Captures/.test(l.label)), 'covered captures earn nothing');
  assert.equal(accounts.getUser(b.id).sixes, 2);

  accounts.setTags(a.id, ['dev']);
  const dev = economy.awardGame({ game, players: [{ seat: 0, userId: a.id }], botGame: false, now });
  assert.ok(dev[0].total > 0, 'Dev is exempt from the bot-carried rule');
  assert.equal(accounts.getUser(a.id).sixes, 4, '...but still only gets their own sixes');
});

test('discord login links a guest, or merges it into an existing discord account', () => {
  const { accounts, economy } = setup();
  const guest = accounts.createUser({ name: 'Guesty' });
  economy.credit(guest.id, 1000, 'test');
  accounts.q.addItem.run(guest.id, 'marble.galaxy', Date.now());
  const token = accounts.createSession(guest.id);

  const linked = accounts.loginDiscord({ id: '111', username: 'ryan' }, guest.id);
  assert.equal(linked.id, guest.id, 'first discord login upgrades the guest in place');
  assert.equal(linked.discord_id, '111');

  const guest2 = accounts.createUser({ name: 'Other' });
  accounts.q.addItem.run(guest2.id, 'dice.gold', Date.now());
  const token2 = accounts.createSession(guest2.id);
  const merged = accounts.loginDiscord({ id: '111', username: 'ryan' }, guest2.id);
  assert.equal(merged.id, guest.id);
  assert.equal(merged.coins, REWARDS.starting + 1000 + REWARDS.starting);
  assert.deepEqual(accounts.inventory(guest.id).sort(), ['dice.gold', 'marble.galaxy']);
  assert.equal(accounts.getUser(guest2.id), null);
  assert.equal(accounts.userForToken(token2).id, guest.id, 'the guest session now points at the merged account');
  assert.equal(accounts.userForToken(token).id, guest.id);

  const fresh = accounts.loginDiscord({ id: '222', username: 'new', global_name: 'Newbie' });
  assert.equal(fresh.name, 'Newbie');
});

test('featured shop is deterministic per day and purchasable once', () => {
  const { accounts, economy } = setup();
  const day = utcDay(Date.parse('2026-03-03T00:00:00Z'));
  const featured = featuredFor(day);
  assert.deepEqual(featured, featuredFor(day));
  assert.equal(featured.length, catalog.featured.count);
  assert.ok(featured.some((f) => ['epic', 'legendary'].includes(catalog.items.find((i) => i.id === f.id).rarity)));

  const { id } = accounts.createUser({ name: 'A' });
  const now = Date.parse('2026-03-03T10:00:00Z');
  economy.credit(id, 10000, 'test');
  economy.buyFeatured(id, featured[0].id, now);
  assert.ok(accounts.owns(id, featured[0].id));
  assert.throws(() => economy.buyFeatured(id, featured[0].id, now), /already own/);
  assert.throws(() => economy.buyFeatured(id, 'marble.classic', now), /isn't in today's shop/);
});

test('equipping requires owning the item and matching the slot', () => {
  const { accounts } = setup();
  const { id } = accounts.createUser({ name: 'A' });
  assert.equal(accounts.equipped(accounts.getUser(id)).marble, 'marble.classic');
  assert.throws(() => accounts.equip(id, 'marble', 'marble.holo'), /don't own/);
  assert.throws(() => accounts.equip(id, 'dice', 'marble.classic'), /Unknown item/);
  accounts.q.addItem.run(id, 'marble.holo', Date.now());
  accounts.equip(id, 'marble', 'marble.holo');
  assert.equal(accounts.equipped(accounts.getUser(id)).marble, 'marble.holo');
});
