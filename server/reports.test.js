const test = require('node:test');
const assert = require('node:assert/strict');
const { openDb } = require('./db');
const { Accounts } = require('./accounts');
const { Economy } = require('./economy');
const { Reports } = require('./reports');
const { Matches } = require('./matches');
const { Room } = require('./rooms');

function setup() {
  const db = openDb(':memory:');
  const accounts = new Accounts(db);
  const economy = new Economy(db, accounts);
  const reports = new Reports(db);
  const matches = new Matches(db, accounts);
  return { db, accounts, economy, reports, matches };
}

test('reports: file, validate, list for owner and admin', () => {
  const { accounts, reports } = setup();
  const user = accounts.createUser({ name: 'Ana' });

  assert.throws(() => reports.file(user.id, 'hmm', 'a decent length report'), /bug report or feature idea/);
  assert.throws(() => reports.file(user.id, 'bug', 'hey'), /little more/);

  const report = reports.file(user.id, 'idea', '  a  cosmetic\u202Eidea\nwith   spacing  ');
  assert.equal(report.kind, 'idea');
  assert.equal(report.status, 'open');
  assert.ok(!/[\u202e]/.test(report.text), 'bidi/control characters are stripped');
  assert.equal(reports.file(user.id, 'bug', 'x'.repeat(900)).text.length, 600, 'text is capped');

  assert.equal(reports.mine(user.id).length, 2);
  assert.equal(reports.mine('nobody').length, 0);
  assert.equal(reports.list().length, 2, 'admin queue shows open reports');
  assert.equal(reports.list()[0].userName, 'Ana', 'the queue shows who filed it');

  for (let i = 0; i < 8; i++) reports.file(accounts.createUser({ name: `u${i}` }).id, 'bug', `report number ${i}`);
  const spammer = accounts.createUser({ name: 'spammer' });
  for (let i = 0; i < 8; i++) reports.file(spammer.id, 'bug', `spam ${i}`);
  assert.throws(() => reports.file(spammer.id, 'bug', 'one more report'), /open reports already/);
});

test('reports: resolve replies + gifts reach the player once, claims are idempotent', () => {
  const { accounts, economy, reports } = setup();
  const user = accounts.createUser({ name: 'Rui' });
  const report = reports.file(user.id, 'bug', 'the die vanished mid-roll');

  assert.equal(reports.pendingReplies(user.id).length, 0, 'nothing while it is still open');

  assert.throws(() => reports.resolve(report.id, 'thanks!', { type: 'coins', amount: -5 }), /up to 100,000/);
  assert.throws(() => reports.resolve(report.id, 'thanks!', { type: 'coins', amount: 200000 }), /up to 100,000/);
  assert.throws(() => reports.resolve(report.id, 'thanks!', { type: 'box', box: 'box.fake' }), /Unknown chest/);
  assert.throws(() => reports.resolve(report.id, 'thanks!', { type: 'item', item: 'marble.classic' }), /giftable/);
  assert.throws(() => reports.resolve(report.id, 'thanks!', { type: 'item', item: 'dice.dev' }), /giftable/);
  assert.throws(() => reports.resolve(report.id, 'thanks!', { type: 'mystery' }), /Unknown gift/);

  const resolved = reports.resolve(report.id, 'Thanks, fixed in the next build!', { type: 'coins', amount: 500 });
  assert.equal(resolved.status, 'resolved');
  assert.equal(resolved.gift.amount, 500);
  assert.equal(reports.list().length, 0, 'resolved reports leave the open queue');
  assert.equal(reports.list({ includeResolved: true }).length, 1);

  const pending = reports.pendingReplies(user.id);
  assert.equal(pending.length, 1);
  assert.equal(pending[0].response, 'Thanks, fixed in the next build!');

  // Only the owner can claim it
  assert.throws(() => reports.takeGift(report.id, 'someone-else'), /not found/i);

  const coinsBefore = accounts.getUser(user.id).coins;
  const gift = reports.takeGift(report.id, user.id);
  assert.deepEqual(gift, { type: 'coins', amount: 500 });
  economy.credit(user.id, gift.amount, `report:${report.id}`);
  assert.equal(accounts.getUser(user.id).coins, coinsBefore + 500);
  assert.throws(() => reports.takeGift(report.id, user.id), /Already claimed/, 'a second claim hands out nothing');
  assert.equal(reports.pendingReplies(user.id).length, 0, 'claiming also marks the reply seen');

  // Reopen clears the reply and the claim flags
  const reopened = reports.reopen(report.id);
  assert.equal(reopened.status, 'open');
  assert.equal(reopened.gift, null);
  assert.equal(reports.list().length, 1, 'back in the queue');

  // A reply with no gift just gets marked seen
  const second = reports.file(user.id, 'idea', 'a jade chessboard theme');
  reports.resolve(second.id, 'on the list!', null);
  assert.equal(reports.pendingReplies(user.id).length, 1);
  assert.equal(reports.takeGift(second.id, user.id), null);
  assert.equal(reports.pendingReplies(user.id).length, 0);
});

test('reports: box and cosmetic gifts actually grant the reward', () => {
  const { accounts, economy, reports } = setup();
  const user = accounts.createUser({ name: 'Mara' });

  const boxReport = reports.file(user.id, 'bug', 'chest animation skipped');
  reports.resolve(boxReport.id, 'thanks!', { type: 'box', box: 'box.gold' });
  const gift = reports.takeGift(boxReport.id, user.id);
  const boxesBefore = accounts.getUser(user.id).boxes_opened;
  const result = economy.grantBox(user.id, gift.box, () => 0);
  assert.ok(result.item, 'the chest rolls an item');
  assert.notEqual(result.rarity, 'common', 'golden chest never drops commons');
  assert.equal(accounts.getUser(user.id).boxes_opened, boxesBefore + 1);
  assert.equal(accounts.getUser(user.id).coins, 300, 'a free chest costs nothing');

  const itemReport = reports.file(user.id, 'idea', 'please add a lava marble');
  reports.resolve(itemReport.id, 'ask and ye shall receive', { type: 'item', item: 'marble.lava' });
  reports.takeGift(itemReport.id, user.id);
  accounts.grantItem(user.id, 'marble.lava');
  assert.ok(accounts.owns(user.id, 'marble.lava'));
});

const fakeRoom = ({ winners = [0], mode = 'solo' } = {}) => ({
  code: 'TEST',
  game: {
    mode,
    winners,
    active: [0, 1],
    pick: { t: Date.now() - 60000 },
    stats: [{ rolls: 30, sixes: 4, captures: 3 }, { rolls: 30, sixes: 2, captures: 1 }],
    marbles: [
      Array.from({ length: 5 }, () => ({ zone: 'home' })),
      Array.from({ length: 5 }, (_, i) => ({ zone: i < 3 ? 'home' : 'track' })),
    ],
  },
  seats: [
    { name: 'Ana', userId: null, isBot: false },
    { name: 'Rui', userId: null, isBot: false },
  ],
});

test('matches: recording feeds match history and leaderboards', () => {
  const { db, accounts, matches } = setup();
  const ana = accounts.createUser({ name: 'Ana' });
  const rui = accounts.createUser({ name: 'Rui' });
  const bot = accounts.createUser({ name: 'Uffa' });

  const room = fakeRoom();
  room.seats[0].userId = ana.id;
  room.seats[1].userId = rui.id;
  room.seats.push({ name: 'Bot Tobias', userId: null, isBot: true });
  room.game.active.push(2);
  room.game.stats.push({ rolls: 30, sixes: 1, captures: 2 });
  room.game.marbles.push(Array.from({ length: 5 }, () => ({ zone: 'track' })));

  matches.record(room);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM matches').get().n, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM match_players').get().n, 2, 'only humans get match rows');

  const [entry] = matches.history(ana.id);
  assert.equal(entry.won, true);
  assert.equal(entry.players, 2);
  assert.equal(entry.bots, 1);
  assert.equal(entry.seats.length, 3);
  assert.equal(entry.seats[2].bot, true);
  assert.equal(matches.history(rui.id)[0].won, false);
  assert.equal(matches.history(bot.id).length, 0);

  const boards = matches.leaders();
  assert.ok(boards.wins.every((u) => u.id && u.name && u.level !== undefined), 'public mini-cards');
  assert.equal(boards.wins.length, 0, 'wins board needs 5+ games');
  assert.equal(boards.level.length, 3, 'level board has no game minimum');
});

test('reconnect: a disconnected player gets one grace window, then the bot plays at bot speed', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const room = new Room('GONE', { onChange: () => {} });
  t.after(() => room.dispose());
  room.join({ userId: 'u1', name: 'Ana' });
  room.join({ userId: 'u2', name: 'Rui' });
  room.attach('u1', 's1');
  room.attach('u2', 's2');
  room.pickStarter = () => ({ seat: 0, reason: 'winner' });
  room.start('u1');

  // Ana drops mid-turn: the turn keeps waiting out the grace, no bot yet
  room.detach('u1', 's1');
  assert.strictEqual(room.view().seats[0].connected, false);
  assert.ok(room.view().seats[0].coverGrace > 15000, 'grace runs from the disconnect, not per turn');
  t.mock.timers.tick(5000);
  assert.strictEqual(room.game.played[0].botRolls, 0, 'still waiting for her');

  // Grace expires (20s + the start-intro animation): the bot rolls, and her next turn is at bot speed
  t.mock.timers.tick(19000);
  assert.strictEqual(room.game.played[0].botRolls, 1);
  assert.strictEqual(room.view().seats[0].coverGrace, 0);
  Object.assign(room.game, { turn: 0, phase: 'roll' });
  room.changed();
  t.mock.timers.tick(2500);
  assert.strictEqual(room.game.played[0].botRolls, 2, 'after grace, turns come at bot speed — no 20s wait each time');

  // She can still walk back in and take over
  room.attach('u1', 's1b');
  assert.strictEqual(room.view().seats[0].connected, true);
  Object.assign(room.game, { turn: 0, phase: 'roll' });
  room.changed();
  room.roll('u1');
  assert.strictEqual(room.game.played[0].rolls, 3);
});

test('step away while disconnected: still bot speed, no extra grace', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const room = new Room('AWAY', { onChange: () => {} });
  t.after(() => room.dispose());
  room.join({ userId: 'u1', name: 'Ana' });
  room.join({ userId: 'u2', name: 'Rui' });
  room.attach('u1', 's1');
  room.attach('u2', 's2');
  room.pickStarter = () => ({ seat: 0, reason: 'winner' });
  room.start('u1');

  room.stepAway('u1', true);
  room.detach('u1', 's1');
  // Bot delay (~450-850ms) plus the start-intro animation (~2.2s), not the 20s reconnect grace
  t.mock.timers.tick(4000);
  assert.ok(room.game.played[0].botRolls >= 1, 'away beats grace: the bot plays right away');
});
