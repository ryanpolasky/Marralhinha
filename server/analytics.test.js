const test = require('node:test');
const assert = require('node:assert/strict');
const { openDb } = require('./db');
const { Accounts } = require('./accounts');
const { Matches } = require('./matches');
const { Analytics } = require('./analytics');

const setup = () => {
  const db = openDb(':memory:');
  const accounts = new Accounts(db);
  return { db, accounts, matches: new Matches(db, accounts), analytics: new Analytics(db, accounts) };
};

test('the new-since watermark flags real accounts made after the last check', () => {
  const { db, accounts } = setup();
  const t0 = 1_000_000;
  assert.equal(accounts.newSince(t0), t0, 'first check sets the baseline');
  assert.equal(accounts.newSince(t0 + 999), t0, 'the baseline sticks once set');

  const guest = accounts.createUser({ name: 'Driveby' });
  const real = accounts.createUser({ name: 'Newbie' });
  db.prepare('UPDATE users SET games = 1 WHERE id = ?').run(real.id);
  db.prepare('UPDATE users SET created_at = ? WHERE id = ?').run(t0 + 10, guest.id);
  db.prepare('UPDATE users SET created_at = ? WHERE id = ?').run(t0 + 20, real.id);

  assert.equal(accounts.newCount(), 1, 'drive-by guests are not new people');
  assert.deepEqual(accounts.search('#new').map((u) => u.id), [real.id]);
  assert.equal(accounts.adminView(accounts.getUser(real.id)).fresh, true);
  assert.equal(accounts.adminView(accounts.getUser(guest.id)).fresh, false);

  accounts.markUsersSeen(t0 + 30);
  assert.equal(accounts.newCount(), 0);
  assert.equal(accounts.adminView(accounts.getUser(real.id)).fresh, false);
  assert.deepEqual(accounts.search('#new'), []);

  db.prepare('UPDATE users SET created_at = ? WHERE id = ?').run(t0 + 40, guest.id);
  db.prepare('UPDATE users SET games = 1 WHERE id = ?').run(guest.id);
  assert.equal(accounts.newCount(), 1, 'an account is still new once it becomes a real player');
});

test('analytics snapshot rolls up users, games and coins', () => {
  const { db, accounts, matches, analytics } = setup();
  const me = accounts.createUser({ name: 'Me' });
  const a = accounts.createUser({ name: 'A' });
  const b = accounts.createUser({ name: 'B' });
  const stranger = accounts.createUser({ name: 'Stranger' });
  const beta = accounts.createUser({ name: 'Beta' });
  accounts.createUser({ name: 'Ghost' });
  accounts.setTags(me.id, ['dev']);
  db.prepare('UPDATE users SET games = 3 WHERE id = ?').run(a.id);
  db.prepare('UPDATE users SET games = 2 WHERE id = ?').run(stranger.id);
  db.prepare('UPDATE users SET games = 5 WHERE id = ?').run(beta.id);
  accounts.setTags(beta.id, ['beta']);
  accounts.q.linkDiscord.run('123', null, b.id);
  accounts.createSession(a.id);
  matches.record(
    {
      code: 'ABCD',
      seats: [
        { name: 'Me', userId: me.id },
        { name: 'A', userId: a.id },
        { name: 'Bot', isBot: true },
      ],
      game: { phase: 'over', mode: 'solo', winners: [0], active: [0, 1, 2], marbles: [[], [], []], stats: [{ rolls: 30, sixes: 4, captures: 1 }, { rolls: 30, sixes: 5, captures: 0 }, { rolls: 30, sixes: 2, captures: 0 }], played: [{}, {}, {}] },
    },
    Date.now()
  );

  const snap = analytics.snapshot({ list: () => [{ phase: 'playing', players: [{ isBot: false }, { isBot: true }], spectators: 2 }] }, me.id);
  assert.equal(snap.users.total, 6);
  assert.equal(snap.users.real, 5);
  assert.equal(snap.users.throwaway, 1);
  assert.equal(snap.users.linked, 1);
  assert.equal(snap.users.played, 3);
  assert.equal(snap.activity.day, 5, 'throwaways are not activity');
  assert.deepEqual(snap.joined.day, { players: 5, guests: 1 });
  assert.equal(snap.matches.total, 1);
  assert.equal(snap.matches.day, 1);
  assert.equal(snap.matches.humans, 2);
  assert.equal(snap.live.playing, 1);
  assert.equal(snap.live.humans, 1);
  assert.equal(snap.live.spectators, 2);
  assert.equal(snap.economy.reasons.find((r) => r.kind === 'welcome').n, 6);
  assert.equal(snap.economy.grantedDay, 1800);
  assert.deepEqual(snap.recent.map((u) => u.name).sort(), ['A', 'B', 'Beta', 'Me', 'Stranger']);
  assert.equal(snap.newCount, 0, 'first snapshot sets the check baseline');

  assert.equal(snap.strangers.total, 1);
  assert.deepEqual(snap.strangers.list.map((u) => u.name), ['Stranger'], 'only the organic player, not beta-tagged or met-at-a-table accounts');
});
