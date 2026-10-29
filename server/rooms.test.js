const test = require('node:test');
const assert = require('node:assert');
const { Room, RoomManager, UserError } = require('./rooms');
const rules = require('../src/shared/rules');
const timing = require('../src/shared/timing');
const { UFO } = require('../src/shared/stunts');

function startedRoom() {
  const reactions = [];
  const room = new Room('TEST', { onChange: () => {}, onReaction: (_, r) => reactions.push(r) });
  room.join({ userId: 'u1', name: 'Ana' });
  room.join({ userId: 'u2', name: 'Rui' });
  room.attach('u1', 's1');
  room.attach('u2', 's2');
  room.start('u1');
  room.playStart();
  return { room, reactions };
}

test('log revision only changes when the log content changes', (t) => {
  const { room } = startedRoom();
  t.after(() => room.dispose());
  const rev = room.logRev();
  assert.strictEqual(room.logRev(), rev);
  rules.pushLog(room.game, { text: 'A turn happened', seat: 0, t: Date.now() });
  assert.strictEqual(room.logRev(), rev + 1);
  assert.strictEqual(room.logRev(), rev + 1);
});

test('log revision changes when a held entry timestamp changes in place', (t) => {
  const { room } = startedRoom();
  t.after(() => room.dispose());
  const rev = room.logRev();
  const held = room.game.log.find((entry) => entry.hold);
  held.t += 1;
  assert.strictEqual(room.logRev(), rev + 1);
});

test('log revision changes when a new game replaces the log with an empty one', (t) => {
  const { room } = startedRoom();
  t.after(() => room.dispose());
  room.game = { log: [{ text: 'Previous round' }] };
  const rev = room.logRev();
  room.game = { log: [] };
  assert.strictEqual(room.logRev(), rev + 1);
});

test('chat messages land in the room feed and pop a bubble for the sender', (t) => {
  const { room, reactions } = startedRoom();
  t.after(() => room.dispose());
  room.chat('u1', '  boa   sorte!  ');
  const entry = room.view().chat.at(-1);
  assert.deepStrictEqual({ chat: entry.chat, name: entry.name, text: entry.text, seat: entry.seat }, { chat: true, name: 'Ana', text: 'boa sorte!', seat: 0 });
  assert.strictEqual(reactions.at(-1).text, 'boa sorte!');
});

test('one account on two devices shares a seat; leaving on one device keeps it for the other', (t) => {
  const { room } = startedRoom();
  t.after(() => room.dispose());
  assert.strictEqual(room.join({ userId: 'u1', name: 'Ana' }).id, room.seats[0].id, 'the second device gets the same seat');
  room.attach('u1', 's1b');
  assert.strictEqual(room.view().seats[0].devices, 2);
  assert.ok(room.inLiveGame('u1'));

  assert.strictEqual(room.leaveDevice('u1', 's1'), false);
  assert.ok(!room.seats[0].isBot && room.seats[0].connected, 'the other device still plays');
  assert.strictEqual(room.view().seats[0].devices, 1);

  assert.strictEqual(room.leaveDevice('u1', 's1b'), true);
  assert.ok(room.seats[0].isBot, 'the last device leaving hands the seat to a bot');
  assert.ok(!room.inLiveGame('u1'));
});

test('chat is cleaned, capped and ignores blank messages', (t) => {
  const { room } = startedRoom();
  t.after(() => room.dispose());
  const before = room.view().chat.length;
  room.chat('u1', ' \n\t ');
  assert.strictEqual(room.view().chat.length, before);
  room.chat('u2', `hi\u202Ethere ${'x'.repeat(300)}`);
  const entry = room.view().chat.at(-1);
  assert.ok(entry.text.startsWith('hi there'));
  assert.strictEqual(entry.text.length, 280);
});

test('four-player rooms default to free-for-all and only the host can switch on teams', (t) => {
  const room = new Room('TEAM', { onChange: () => {} });
  t.after(() => room.dispose());
  ['u1', 'u2', 'u3', 'u4'].forEach((userId, i) => {
    room.join({ userId, name: `P${i}` });
    room.attach(userId, `s${i}`);
  });
  assert.strictEqual(room.view().teams, false);
  assert.throws(() => room.setTeams('u2', true), /Only the host/);
  room.setTeams('u1', true);
  assert.strictEqual(room.view().teams, true);
  room.start('u1');
  assert.strictEqual(room.game.mode, 'teams');
  assert.throws(() => room.setTeams('u1', false), /already started/);
});

test('blitz is host-only, starts with three marbles and survives rematch', (t) => {
  const room = new Room('BLTZ', { onChange: () => {} });
  t.after(() => room.dispose());
  ['u1', 'u2'].forEach((userId, i) => {
    room.join({ userId, name: `P${i}` });
    room.attach(userId, `s${i}`);
  });
  assert.strictEqual(room.view().variant, 'classic');
  assert.throws(() => room.setVariant('u2', 'blitz'), /Only the host/);
  assert.throws(() => room.setVariant('u1', 'speedy'), /Unknown board variant/);

  room.setVariant('u1', 'blitz');
  room.start('u1');
  assert.strictEqual(room.game.variant, 'blitz');
  assert.strictEqual(room.game.marbles[0].length, 3);
  assert.throws(() => room.setVariant('u1', 'classic'), /already started/);

  room.game.phase = 'over';
  room.game.winners = [0];
  room.rematch('u1');
  assert.strictEqual(room.view().variant, 'blitz');
  room.start('u1');
  assert.strictEqual(room.game.variant, 'blitz');
  assert.strictEqual(room.game.marbles[0].length, 3);
});

test('an old client without blitz support blocks the table switching over', (t) => {
  const room = new Room('OLD', { onChange: () => {} });
  t.after(() => room.dispose());
  room.join({ userId: 'u1', name: 'Ana' });
  room.join({ userId: 'u2', name: 'Rui' });
  room.attach('u1', 's1');
  room.attach('u2', 's2', { blitz: false });
  assert.throws(() => room.setVariant('u1', 'blitz'), /reload/);
  room.attach('u2', 's3');
  assert.throws(() => room.setVariant('u1', 'blitz'), /reload/, 'one old device still blocks the table');
  room.detach('u2', 's2');
  room.setVariant('u1', 'blitz');
  assert.strictEqual(room.view().variant, 'blitz');
});

test('first game: a random seated player starts on their board; rematch: a winner starts on theirs', (t) => {
  const { room } = startedRoom();
  t.after(() => room.dispose());
  const { game } = room;
  assert.ok(game.active.includes(game.turn));
  assert.deepStrictEqual({ seat: game.pick.seat, reason: game.pick.reason, board: game.boardSeat }, { seat: game.turn, reason: 'wheel', board: game.turn });
  assert.match(game.log[0].text, /wheel lands on/i);
  assert.deepStrictEqual({ t: game.log[0].t, hold: game.log[0].hold }, { t: game.pick.t + timing.START_WHEEL_SPIN_MS, hold: true }, 'the wheel entry is held until the spin lands');

  // Second player sits across the table, in seat 2
  game.phase = 'over';
  game.winners = [2];
  room.rematch('u1');
  room.start('u1');
  assert.deepStrictEqual({ turn: room.game.turn, reason: room.game.pick.reason, board: room.game.boardSeat }, { turn: 2, reason: 'winner', board: 2 });
  assert.match(room.game.log[0].text, /won last round/);
  assert.strictEqual(room.game.log[0].hold, undefined, 'a champion start is announced right away');

  // Winner left before the rematch: back to the wheel
  room.game.phase = 'over';
  room.game.winners = [2];
  room.rematch('u1');
  room.leave('u2');
  room.addBot('u1', 2);
  room.start('u1');
  assert.strictEqual(room.game.pick.reason, 'wheel');
});

test('solo human keeps their board even when a bot starts or wins the rematch', (t) => {
  const room = new Room('SOLO', { onChange: () => {} });
  t.after(() => room.dispose());
  room.join({ userId: 'u1', name: 'Ana', cosmetics: { board: 'board.dev' } });
  room.attach('u1', 's1');
  room.addBot('u1', 2);
  room.pickStarter = () => ({ seat: 2, reason: 'wheel' });
  room.start('u1');
  assert.strictEqual(room.game.turn, 2);
  assert.strictEqual(room.game.boardSeat, 0);
  assert.match(room.game.log[0].text, /Ana's board/);
  room.game.phase = 'over';
  room.game.winners = [2];
  room.rematch('u1');
  room.start('u1');
  assert.deepStrictEqual({ turn: room.game.turn, board: room.game.boardSeat }, { turn: 2, board: 0 });
});

test('rooms with only bots are swept after the last human leaves', () => {
  const closed = [];
  const manager = new RoomManager({ onChange: () => {}, onClosed: (room) => closed.push(room) });
  const room = manager.create();
  room.join({ userId: 'u1', name: 'Ana' });
  room.addBot('u1', 2);
  room.start('u1');
  room.leave('u1');
  assert.strictEqual(room.isAbandoned(), true);
  manager.sweep();
  assert.strictEqual(manager.rooms.size, 0);
  assert.deepStrictEqual(closed, [room]);
});

test('a lobby with one tab still connected closes after sitting idle', () => {
  const manager = new RoomManager({ onChange: () => {} });
  const room = manager.create();
  room.join({ userId: 'u1', name: 'Ana' });
  room.attach('u1', 's0');
  const now = Date.now();
  assert.strictEqual(room.isAbandoned(now + 9 * 60 * 1000), false);
  assert.strictEqual(room.isAbandoned(now + 11 * 60 * 1000), true);
  room.lastActive = now + 9 * 60 * 1000;
  assert.strictEqual(room.isAbandoned(now + 11 * 60 * 1000), false, 'activity in the lobby resets the clock');
});

test('a results screen with one tab still connected closes after sitting idle', () => {
  const manager = new RoomManager({ onChange: () => {} });
  const room = manager.create();
  ['u1', 'u2'].forEach((u, i) => {
    room.join({ userId: u, name: `P${i}` });
    room.attach(u, `s${i}`);
  });
  room.start('u1');
  room.game.phase = 'over';
  room.game.winners = [0];
  room.changed();
  room.detach('u2', 's1');
  const now = Date.now();
  assert.strictEqual(room.isAbandoned(now + 9 * 60 * 1000), false);
  assert.strictEqual(room.isAbandoned(now + 11 * 60 * 1000), true);
  room.lastActive = now + 9 * 60 * 1000;
  assert.strictEqual(room.isAbandoned(now + 11 * 60 * 1000), false, 'activity on the results screen resets the clock');
  room.game.phase = 'roll';
  assert.strictEqual(room.isAbandoned(now + 60 * 60 * 1000), false, 'a live game with someone connected stays open');
});

test('quick play rooms with nobody connected are swept after minutes, other rooms keep their grace', () => {
  const manager = new RoomManager({ onChange: () => {} });
  const make = (options) => {
    const room = manager.create(options);
    room.join({ userId: 'u1', name: 'Ana' });
    room.attach('u1', 's1');
    room.addBot('u1', 1);
    room.start('u1');
    room.detach('u1', 's1');
    return room;
  };
  const quick = make({ quickPlay: true });
  const normal = make();
  const later = Date.now() + 5 * 60 * 1000;
  assert.strictEqual(quick.summary().empty, true);
  assert.strictEqual(quick.isAbandoned(), false);
  assert.strictEqual(quick.isAbandoned(later), true);
  assert.strictEqual(normal.isAbandoned(later), false);
  quick.dispose();
  normal.dispose();
});

test('seat swaps require acceptance and force swaps work only before the game', (t) => {
  const { room } = startedRoom();
  t.after(() => room.dispose());
  const ana = room.seats[0];
  const rui = room.seats[2];
  room.game = null;
  room.offerSwap('u1', 2);
  assert.strictEqual(room.seats[0], ana);
  room.respondSwap('u2', ana.id, false);
  assert.strictEqual(room.swapOffers.length, 0);
  room.offerSwap('u1', 2);
  room.respondSwap('u2', ana.id, true);
  assert.strictEqual(room.seats[0], rui);
  assert.strictEqual(room.seats[2], ana);
  room.forceSwap('u1', 0);
  assert.strictEqual(room.seats[0], ana);
  room.offerSwap('u2', 0);
  room.forceSwap('u1', 2);
  assert.strictEqual(room.swapOffers.length, 0);
  room.start('u1');
  assert.throws(() => room.forceSwap('u1', 2), /already started/);
});

test('full and active rooms admit spectators; Dev spectators can arrange seats before games', (t) => {
  const room = new Room('VIEW', { onChange: () => {} });
  t.after(() => room.dispose());
  for (let i = 0; i < 4; i++) room.join({ userId: `u${i}`, name: `P${i}` });
  const viewer = room.join({ userId: 'viewer', name: 'Watcher' });
  room.attach('viewer', 's5');
  assert.strictEqual(room.view().spectators[0].id, viewer.id);
  const before = room.seats[0];
  room.forceSwap('viewer', 2, 0);
  assert.strictEqual(room.seats[2], before);
  room.forceSwap('viewer', 0, 2);
  assert.throws(() => room.roll('viewer'), /not in this room/);
  assert.throws(() => room.offerSwap('viewer', 0), /not in this room/);
  room.start('u0');
  assert.strictEqual(room.join({ userId: 'late', name: 'Late' }).id, room.view().spectators[1].id);
  room.attach('late', 's6');
  room.game.phase = 'over';
  room.game.winners = [0];
  room.rematch('u0');
  room.leave('u1');
  room.setSeat('viewer', 2);
  assert.strictEqual(room.findByUser('viewer').player.id, viewer.id);
  assert.strictEqual(room.view().spectators.length, 1);
  room.detach('late', 's6');
  assert.strictEqual(room.view().spectators.length, 0);
});

test('connected players get a turn clock that chat never resets; timing out twice marks them away', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const room = new Room('TIME', { onChange: () => {} });
  t.after(() => room.dispose());
  room.join({ userId: 'u1', name: 'Ana' });
  room.join({ userId: 'u2', name: 'Rui' });
  room.attach('u1', 's1');
  room.attach('u2', 's2');
  room.pickStarter = () => ({ seat: 0, reason: 'winner' });
  room.start('u1');
  room.playStart();
  const first = room.view().turnEndsIn;
  assert.ok(first >= 30000 && first <= 33000, `turn clock starts after the intro (${first})`);

  t.mock.timers.tick(10000);
  room.chat('u2', 'hurry up');
  assert.strictEqual(room.view().turnEndsIn, first - 10000, 'chat does not reset the clock');

  t.mock.timers.tick(first - 10000);
  assert.strictEqual(room.seats[0].missed, 1);
  assert.ok(room.game.log.some((e) => /ran out of time/.test(e.text)));
  assert.strictEqual(room.view().seats[0].idle, false);

  Object.assign(room.game, { turn: 0, phase: 'roll' });
  room.changed();
  t.mock.timers.tick(40000);
  assert.strictEqual(room.view().seats[0].idle, true, 'two timeouts in a row mark the player away');

  Object.assign(room.game, { turn: 0, phase: 'roll' });
  room.roll('u1');
  assert.strictEqual(room.view().seats[0].idle, false, 'acting again clears it');
});

test('the host sets the turn timer in the lobby: 15-45s, or no limit at all', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const room = new Room('TURN', { onChange: () => {} });
  t.after(() => room.dispose());
  room.join({ userId: 'u1', name: 'Ana' });
  room.join({ userId: 'u2', name: 'Rui' });
  room.attach('u1', 's1');
  room.attach('u2', 's2');
  assert.strictEqual(room.view().turnSeconds, 30);
  assert.throws(() => room.setTurnTime('u2', 15), /Only the host/);
  assert.throws(() => room.setTurnTime('u1', 12), /15 to 45/);

  room.setTurnTime('u1', 15);
  room.pickStarter = () => ({ seat: 0, reason: 'winner' });
  room.start('u1');
  room.playStart();
  assert.ok(room.view().turnEndsIn <= 15000 + 2200);
  assert.throws(() => room.setTurnTime('u1', 45), /already started/);

  room.game.phase = 'over';
  room.game.winners = [0];
  room.rematch('u1');
  room.setTurnTime('u1', null);
  room.start('u1');
  room.playStart();
  assert.strictEqual(room.view().turnEndsIn, null, 'no clock without a limit');
  t.mock.timers.tick(10 * 60 * 1000);
  assert.strictEqual(room.seats[0].missed || 0, 0, 'nobody gets played for');
});

test('a disconnected host hands over to the next connected player after a grace period', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const room = new Room('HOST', { onChange: () => {} });
  t.after(() => room.dispose());
  const ana = room.join({ userId: 'u1', name: 'Ana' });
  const rui = room.join({ userId: 'u2', name: 'Rui' });
  room.attach('u1', 's1');
  room.attach('u2', 's2');

  room.detach('u1', 's1');
  t.mock.timers.tick(10000);
  room.attach('u1', 's1b');
  t.mock.timers.tick(10000);
  assert.strictEqual(room.hostId, ana.id, 'a quick reconnect keeps the host');

  room.detach('u1', 's1b');
  t.mock.timers.tick(15000);
  assert.strictEqual(room.hostId, rui.id);
  room.start('u2');
});

test('host changes are announced, except the very first host and offline targets', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const events = [];
  const room = new Room('HOST2', { onChange: () => {}, onHostChange: (_, h) => events.push(h) });
  t.after(() => room.dispose());
  const ana = room.join({ userId: 'u1', name: 'Ana' });
  const rui = room.join({ userId: 'u2', name: 'Rui' });
  room.attach('u1', 's1');
  room.attach('u2', 's2');
  assert.strictEqual(events.length, 0, 'the first host needs no introduction');

  room.detach('u1', 's1');
  t.mock.timers.tick(15000);
  assert.strictEqual(room.hostId, rui.id);
  assert.deepStrictEqual(events.at(-1), { id: rui.id, name: 'Rui', from: 'Ana' });

  // A leaving host can land on a disconnected player; no toast for someone who can't see it
  room.leave('u2');
  assert.strictEqual(room.hostId, ana.id);
  assert.strictEqual(events.length, 1);

  // A host who's been gone past the grace period yields the moment someone returns
  t.mock.timers.tick(60000);
  const ruiBack = room.join({ userId: 'u2', name: 'Rui' });
  room.attach('u2', 's3');
  t.mock.timers.tick(0);
  assert.strictEqual(room.hostId, ruiBack.id);
  assert.strictEqual(events.at(-1).name, 'Rui');
});

test('rematch votes from every non-host human start the next round on their own', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const room = new Room('VOTE', { onChange: () => {} });
  t.after(() => room.dispose());
  ['u1', 'u2', 'u3'].forEach((userId, i) => {
    room.join({ userId, name: `P${i}` });
    room.attach(userId, `s${i}`);
  });
  room.start('u1');
  room.game.phase = 'over';
  room.game.winners = [2];
  const first = room.game;
  const [u2, u3] = [room.seats[2].id, room.seats[1].id];

  t.mock.timers.tick(1300);
  room.rematch('u2');
  assert.strictEqual(room.game, first, 'one vote just marks them in');
  assert.deepStrictEqual(room.view().rematch, { voters: [u2], pending: [u3] });

  t.mock.timers.tick(1300);
  room.rematch('u2');
  assert.deepStrictEqual(room.view().rematch.voters, [], 'voting again backs out');
  t.mock.timers.tick(1300);
  room.rematch('u2');
  t.mock.timers.tick(1300);
  room.rematch('u3');
  assert.notStrictEqual(room.game, first, 'everyone in starts the next round');
  assert.strictEqual(room.game.phase, 'roll');
  assert.strictEqual(room.game.turn, 2, 'the winner still starts the rematch');
  assert.strictEqual(room.view().rematch, null);

  // The host's button stays instant, and stray votes don't linger into the lobby
  room.game.phase = 'over';
  room.game.winners = [2];
  t.mock.timers.tick(1300);
  room.rematch('u3');
  room.rematch('u1');
  assert.strictEqual(room.game, null);
  assert.deepStrictEqual(room.view().rematch, null);
  room.start('u1');
});

test('a holdout leaving completes a pending rematch vote', (t) => {
  const room = new Room('VLEAVE', { onChange: () => {} });
  t.after(() => room.dispose());
  ['u1', 'u2', 'u3'].forEach((userId, i) => {
    room.join({ userId, name: `P${i}` });
    room.attach(userId, `s${i}`);
  });
  room.start('u1');
  room.game.phase = 'over';
  room.game.winners = [2];
  const first = room.game;

  room.rematch('u2');
  assert.strictEqual(room.game, first);
  room.leave('u3');
  assert.ok(room.game && room.game.phase !== 'over', 'the only remaining voter carried it');
  assert.strictEqual(room.game.turn, 2);
});

test('only an activity host can end a live game and bring the table back to lobby', (t) => {
  const ended = [];
  const room = new Room('STOP', { onChange: () => {}, onTableEnded: (_, event) => ended.push(event), onGameOver: () => assert.fail('Ending a table must not pay rewards') }, { instanceId: 'inst-stop' });
  t.after(() => room.dispose());
  ['u1', 'u2'].forEach((userId, i) => {
    room.join({ userId, name: `P${i}` });
    room.attach(userId, `s${i}`);
  });
  assert.throws(() => room.endTable('u1'), /no active game/i);
  room.start('u1');
  room.playStart();
  assert.ok(room.timer);
  assert.throws(() => room.endTable('u2'), /Only the host/);
  room.rematchVotes.add(room.seats[2].id);
  room.lastWinners = ['old-winner'];
  const host = room.hostId;
  room.endTable('u1');
  assert.strictEqual(room.view().game, null);
  assert.strictEqual(room.timer, null);
  assert.strictEqual(room.turnDeadline, null);
  assert.strictEqual(room.hostId, host);
  assert.deepStrictEqual(room.lastWinners, []);
  assert.strictEqual(room.rematchVotes.size, 0);
  assert.deepStrictEqual(ended, [{ id: host, name: 'P0' }]);
  room.start('u1');
  assert.strictEqual(room.game.pick.reason, 'wheel');
  room.game.phase = 'over';
  assert.throws(() => room.endTable('u1'), /no active game/i);
});

test('ending a Discord game frees closed seats, but web hosts cannot end theirs', (t) => {
  const web = startedRoom().room;
  const room = new Room('ENDD', { onChange: () => {} }, { instanceId: 'inst-end' });
  t.after(() => { web.dispose(); room.dispose(); });
  assert.throws(() => web.endTable('u1'), /Discord/);
  ['u1', 'u2'].forEach((userId, i) => {
    room.join({ userId, name: `P${i}` });
    room.attach(userId, `s${i}`);
  });
  room.start('u1');
  room.detach('u2', 's1');
  assert.ok(room.findByUser('u2'));
  room.endTable('u1');
  assert.strictEqual(room.findByUser('u2'), null);
  assert.strictEqual(room.seats[2], null);
  assert.strictEqual(room.hostId, room.seats[0].id);
});

test('a closed activity frees the lobby seat and passes the host on the spot', (t) => {
  const room = new Room('ACTD', { onChange: () => {} }, { instanceId: 'inst-a' });
  t.after(() => room.dispose());
  room.join({ userId: 'u1', name: 'Ana' });
  const bob = room.join({ userId: 'u2', name: 'Bob' });
  room.attach('u1', 's1');
  room.attach('u2', 's2');
  room.detach('u1', 's1');
  assert.strictEqual(room.seats[0], null, 'closing the activity gives the seat back');
  assert.strictEqual(room.findByUser('u1'), null);
  assert.strictEqual(room.hostId, bob.id);
});

test('a dropped activity seat survives the game but clears on the next round', (t) => {
  const room = new Room('ACTG', { onChange: () => {} }, { instanceId: 'inst-b' });
  t.after(() => room.dispose());
  ['u1', 'u2'].forEach((userId, i) => {
    room.join({ userId, name: `P${i}` });
    room.attach(userId, `s${i}`);
  });
  room.start('u1');
  room.detach('u2', 's1');
  assert.ok(room.findByUser('u2'), 'mid-game drops keep the seat for a reconnect');
  room.game.phase = 'over';
  room.game.winners = [0];
  room.rematch('u1');
  assert.ok(!room.findByUser('u2'), 'the next round frees the closed seat');
});

test('dropping during results frees the seat and finishes a pending vote', (t) => {
  const room = new Room('ACTO', { onChange: () => {} }, { instanceId: 'inst-c' });
  t.after(() => room.dispose());
  ['u1', 'u2', 'u3'].forEach((userId, i) => {
    room.join({ userId, name: `P${i}` });
    room.attach(userId, `s${i}`);
  });
  room.start('u1');
  room.game.phase = 'over';
  room.game.winners = [2];
  room.rematch('u2');
  assert.strictEqual(room.game.phase, 'over');
  room.detach('u3', 's2');
  assert.ok(room.game.phase !== 'over', 'the last vote landing fires the rematch');
  assert.strictEqual(room.game.turn, 2);
});

test('web rooms still hold a dropped lobby seat', (t) => {
  const room = new Room('WEBD', { onChange: () => {} });
  t.after(() => room.dispose());
  const ana = room.join({ userId: 'u1', name: 'Ana' });
  room.join({ userId: 'u2', name: 'Bob' });
  room.attach('u1', 's1');
  room.attach('u2', 's2');
  room.detach('u1', 's1');
  assert.strictEqual(room.seats[0]?.id, ana.id);
  assert.strictEqual(room.hostId, ana.id);
});

test('spectators can sit, stand back up, and take bot seats', (t) => {
  const room = new Room('SITS', { onChange: () => {} });
  t.after(() => room.dispose());
  room.join({ userId: 'u1', name: 'Ana' });
  const bob = room.join({ userId: 'u2', name: 'Bob' }, { spectate: true });
  room.attach('u1', 's1');
  room.attach('u2', 's2');
  assert.ok(room.spectators.has('u2'));

  room.setSeat('u2', 2);
  assert.strictEqual(room.seats[2].id, bob.id);
  assert.ok(!room.spectators.has('u2'));

  room.unseat('u2');
  assert.strictEqual(room.seats[2], null);
  assert.ok(room.spectators.has('u2'));

  room.addBot('u1', 3);
  room.takeBotSeat('u2', 3);
  assert.strictEqual(room.seats[3].id, bob.id);
  assert.ok(!room.seats[3].isBot);

  room.unseat('u1');
  assert.strictEqual(room.hostId, bob.id, 'the crown passes when the host stands');
});

test('seats open up again while results show, but stay locked mid-game', (t) => {
  const room = new Room('SEATW', { onChange: () => {} });
  t.after(() => room.dispose());
  ['u1', 'u2'].forEach((userId, i) => {
    room.join({ userId, name: `P${i}` });
    room.attach(userId, `s${i}`);
  });
  room.join({ userId: 'u3', name: 'P2' }, { spectate: true });
  room.attach('u3', 's3');
  room.start('u1');
  assert.throws(() => room.setSeat('u3', 1), /already started/);
  room.game.phase = 'over';
  room.game.winners = [0];
  room.setSeat('u3', 1);
  assert.strictEqual(room.seats[1].userId, 'u3');
  room.unseat('u3');
  assert.strictEqual(room.seats[1], null);
});

function teamRoom(t, { botPartner = false } = {}) {
  const sent = [];
  const room = new Room('TEAM', {
    onChange: () => {},
    onReaction: (_, r) => sent.push({ to: 'all', event: 'room:reaction', payload: r }),
    onTeam: (_, seats, event, payload) => sent.push({ to: seats, event, payload }),
    onPing: (_, ping, seats) => sent.push({ to: seats || 'all', event: 'room:ping', payload: ping }),
  });
  t.after(() => room.dispose());
  room.join({ userId: 'u0', name: 'Ana' });
  if (botPartner) room.addBot('u0', 2);
  ['u2', 'u1', 'u3'].slice(botPartner ? 1 : 0).forEach((userId) => room.join({ userId, name: userId }));
  room.seats.forEach((p, s) => p && !p.isBot && room.attach(p.userId, `s${s}`));
  room.setTeams('u0', true);
  room.start('u0');
  room.playStart();
  return { room, sent };
}

test('team chat only reaches the two partners and never the shared feed', (t) => {
  const { room, sent } = teamRoom(t);
  const partnerOfAna = room.seats[2].userId;
  const before = room.view().chat.length;
  room.chat('u0', 'go for their blue one', 'team');
  assert.strictEqual(room.view().chat.length, before, 'team chat stays out of the shared feed');
  const teamChat = sent.find((m) => m.event === 'room:teamChat');
  assert.deepStrictEqual(teamChat.to, [0, 2]);
  assert.strictEqual(teamChat.payload.text, 'go for their blue one');
  assert.ok(sent.every((m) => m.to !== 'all'), 'nothing went to the whole room');
  assert.strictEqual(room.teamLogFor(partnerOfAna).length, 1);
  assert.strictEqual(room.teamLogFor(room.seats[1].userId).length, 0, 'opponents get no team history');
  assert.deepStrictEqual(room.socketsForSeats([0, 2]).sort(), ['s0', 's2']);
});

test('pings: team or everyone for players, everyone-only for Dev spectators, bots acknowledge', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { room, sent } = teamRoom(t, { botPartner: true });
  room.ping('u0', { x: 3, z: -4.126, type: 'danger', scope: 'team' });
  const ping = sent.at(-1);
  assert.deepStrictEqual({ to: ping.to, seat: ping.payload.seat, type: ping.payload.type, scope: ping.payload.scope, z: ping.payload.z }, { to: [0, 2], seat: 0, type: 'danger', scope: 'team', z: -4.13 });
  t.mock.timers.tick(700);
  assert.strictEqual(sent.at(-1).payload.type, 'ack', 'the bot partner acknowledges');
  assert.strictEqual(sent.at(-1).payload.seat, 2);

  const count = sent.length;
  room.ping('u0', { x: 1, z: 1 });
  assert.strictEqual(sent.length, count, 'cooldown between pings');
  t.mock.timers.tick(1000);
  room.ping('u0', { x: 1, z: 1, scope: 'all' });
  assert.strictEqual(sent.at(-1).to, 'all');
  assert.throws(() => room.ping('u1', { x: 99, z: 0 }), /spot on the board/);

  room.join({ userId: 'viewer', name: 'Watcher' });
  assert.throws(() => room.ping('viewer', { x: 0, z: 0 }), /Only players/);
  room.ping('viewer', { x: 0, z: 0, scope: 'team' }, { admin: true });
  assert.deepStrictEqual({ to: sent.at(-1).to, dev: sent.at(-1).payload.dev, seat: sent.at(-1).payload.seat }, { to: 'all', dev: true, seat: null });
});

test('step away: in 2v2 the partner covers your turns, otherwise the bot plays them quickly', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { room } = teamRoom(t);
  // Seats: u0 (0) + u2 (2) vs u1 (1) + u3 (3)
  Object.assign(room.game, { turn: 0, phase: 'roll' });
  room.stepAway('u0', true);
  assert.strictEqual(room.view().seats[0].away, true);
  assert.match(room.game.log.at(-1).text, /stepped away/);
  assert.throws(() => room.roll('u1'), /not your turn/, 'opponents cannot cover');
  assert.throws(() => room.roll('u2'), /not your turn/, 'the partner must opt in first');
  assert.strictEqual(room.view().turnEndsIn, null, 'the bot plays by default');
  assert.throws(() => room.coverTeammate('u1', true), /hasn't stepped away/);
  room.coverTeammate('u2', true);
  assert.strictEqual(room.view().seats[0].coveredBy, room.seats[2].id);
  assert.ok(room.view().turnEndsIn > 0, 'the covering partner gets the normal turn clock');
  room.roll('u2');
  assert.strictEqual(room.game.played[0].rolls, 1);
  assert.strictEqual(room.game.played[0].botRolls, 0, 'partner turns are not bot turns');

  // Partner away too: the bot takes over at bot speed
  Object.assign(room.game, { turn: 0, phase: 'roll' });
  room.stepAway('u2', true);
  room.changed();
  assert.strictEqual(room.view().turnEndsIn, null);
  t.mock.timers.tick(15000);
  assert.ok(room.game.played[0].botRolls >= 1);

  // Acting on your own turn brings you back
  Object.assign(room.game, { turn: 0, phase: 'roll' });
  room.roll('u0');
  assert.strictEqual(room.view().seats[0].away, false);
  assert.throws(() => room.stepAway('stranger', true), /not in this room/);
});

function pausableRoom(t, code) {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const room = new Room(code, { onChange: () => {} });
  t.after(() => room.dispose());
  ['u1', 'u2', 'u3'].forEach((userId, i) => {
    room.join({ userId, name: `P${i}` });
    room.attach(userId, `s${i}`);
  });
  room.pickStarter = () => ({ seat: 0, reason: 'winner' });
  room.start('u1');
  return room;
}

test('everyone stepping away pauses the game; one player back resumes it with a fresh clock', (t) => {
  const room = pausableRoom(t, 'PAUSE');
  room.stepAway('u1', true);
  room.stepAway('u2', true);
  assert.strictEqual(room.view().paused, false, 'one player still here keeps it going');
  room.stepAway('u3', true);
  assert.strictEqual(room.view().paused, true);
  assert.strictEqual(room.view().turnEndsIn, null);
  assert.match(room.game.log.at(-1).text, /Game paused/);
  const rolls = room.game.played[0].rolls;
  t.mock.timers.tick(10 * 60 * 1000);
  assert.strictEqual(room.game.played[0].rolls, rolls, 'nothing moves while paused');
  assert.ok(room.view().pauseEndsIn <= 10 * 60 * 1000);

  room.stepAway('u1', false);
  assert.strictEqual(room.view().paused, false);
  assert.match(room.game.log.at(-1).text, /Game resumed/);
  assert.ok(room.view().turnEndsIn >= 30000, 'a fresh turn clock');
  assert.strictEqual(room.seats[2].away, true, 'the rest stay away');
});

test('a dropped player does not block the pause, and reconnecting resumes it', (t) => {
  const room = pausableRoom(t, 'PDROP');
  room.stepAway('u2', true);
  room.stepAway('u3', true);
  room.detach('u1', 's0');
  assert.strictEqual(room.view().paused, true);
  t.mock.timers.tick(5 * 60 * 1000);
  assert.strictEqual(room.game.played[0].rolls, 0, 'the dropped player is not played for while paused');
  assert.ok(room.view().seats[0].coverGrace > 0, 'their reconnect grace is untouched');
  room.attach('u1', 's0b');
  assert.strictEqual(room.view().paused, false);
});

test('a paused table closes after the pause limit, and leaving the game clears it', (t) => {
  const room = pausableRoom(t, 'PTTL');
  ['u1', 'u2', 'u3'].forEach((u) => room.stepAway(u, true));
  assert.strictEqual(room.isAbandoned(), false);
  assert.strictEqual(room.isAbandoned(Date.now() + 21 * 60 * 1000), true);
  room.game.phase = 'over';
  room.changed();
  assert.strictEqual(room.view().paused, false);
});

test('a paused room asks to be closed right at the pause limit, and resuming cancels it', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  let expired = 0;
  const room = new Room('PEXP', { onChange: () => {}, onExpired: () => expired++ });
  t.after(() => room.dispose());
  ['u1', 'u2', 'u3'].forEach((u, i) => {
    room.join({ userId: u, name: `P${i}` });
    room.attach(u, `s${i}`);
  });
  room.pickStarter = () => ({ seat: 0, reason: 'winner' });
  room.start('u1');
  ['u1', 'u2', 'u3'].forEach((u) => room.stepAway(u, true));
  t.mock.timers.tick(20 * 60 * 1000 - 1);
  assert.strictEqual(expired, 0, 'still open a second before the limit');
  t.mock.timers.tick(1);
  assert.strictEqual(expired, 1, 'expires on the dot');

  room.stepAway('u1', false);
  ['u1', 'u2', 'u3'].forEach((u) => room.stepAway(u, true));
  room.stepAway('u1', false);
  t.mock.timers.tick(25 * 60 * 1000);
  assert.strictEqual(expired, 1, 'resuming before the limit cancels the close');
});

test('favourite colour: you get it when free, and anyone can swap straight into a bot seat', (t) => {
  const room = new Room('FAVE', { onChange: () => {} });
  t.after(() => room.dispose());
  room.join({ userId: 'u1', name: 'Ana' }, { prefer: 3 });
  assert.strictEqual(room.findByUser('u1').seat, 3, 'favourite seat when free');
  room.join({ userId: 'u2', name: 'Rui' }, { prefer: 3 });
  assert.strictEqual(room.findByUser('u2').seat, 0, 'taken, so the usual order');
  room.join({ userId: 'u3', name: 'Zé' }, { prefer: 'green' });
  assert.strictEqual(room.findByUser('u3').seat, 2, 'junk preference is ignored');

  room.addBot('u1', 1);
  room.takeBotSeat('u2', 1);
  assert.strictEqual(room.findByUser('u2').seat, 1);
  assert.ok(room.seats[0].isBot, 'the bot takes your old seat');
  assert.throws(() => room.takeBotSeat('u2', 3), /no bot/);
  room.start('u1');
  assert.throws(() => room.takeBotSeat('u2', 0), /already started/);
});

test('the table board can be swapped mid-game and reset to the starter', (t) => {
  const { room } = startedRoom();
  t.after(() => room.dispose());
  assert.throws(() => room.setBoard('u1', 'marble.holo'), /Unknown board/);
  assert.throws(() => room.setBoard('stranger', 'board.neon'), /not in this room/);
  room.setBoard('u1', 'board.neon');
  assert.strictEqual(room.view().game.boardOverride, 'board.neon');
  assert.match(room.game.log.at(-1).text, /Neon Night/);
  room.setBoard('u1', null);
  assert.strictEqual(room.view().game.boardOverride, null);
});

test('a dev hit is pure theatre: marbles stay put and undo marks it walked off', (t) => {
  const { room } = startedRoom();
  t.after(() => room.dispose());
  const [a, b] = room.game.active;
  const before = JSON.stringify(room.game.marbles);
  room.turnSeconds = 30;
  room.changed();
  assert.ok(room.view().turnEndsIn > 0);
  room.pauseClock('u1');
  assert.strictEqual(room.view().turnEndsIn, null, 'picking a bit freezes the clock right away');
  assert.throws(() => room.shoot('stranger', { by: a, byMarble: 0, victim: b, victimMarble: 0 }), /not in this room/);
  assert.throws(() => room.shoot('u1', { by: a, byMarble: 0, victim: a, victimMarble: 1 }), /shooter and a victim/);
  assert.throws(() => room.shoot('u1', { by: a, byMarble: 99, victim: b, victimMarble: 0 }), /shooter and a victim/);
  room.shoot('u1', { by: a, byMarble: 0, victim: b, victimMarble: 0, before: '  say   hello ', after: 'x'.repeat(200) });
  assert.strictEqual(JSON.stringify(room.game.marbles), before);
  assert.deepStrictEqual([room.game.hits[0].before, room.game.hits[0].after.length], ['say hello', 80]);
  assert.deepStrictEqual(room.game.hits[0].victimAt, room.game.marbles[b][0]);
  assert.strictEqual(room.view().turnEndsIn, null, 'the bit freezes the clock for this turn');
  assert.throws(() => room.shoot('u1', { by: a, byMarble: 1, victim: b, victimMarble: 0 }), /already down/);
  assert.throws(() => room.shoot('u1', { by: b, byMarble: 0, victim: a, victimMarble: 0 }), /no state to shoot/);
  const [hit] = room.view().game.hits;
  assert.deepStrictEqual({ by: hit.by, victim: hit.victim, undone: hit.undone }, { by: a, victim: b, undone: false });
  assert.ok(hit.age >= 0 && !('t' in hit));
  room.unshoot('u1', hit.id);
  assert.strictEqual(room.view().game.hits[0].undone, true);
  assert.throws(() => room.unshoot('u1', hit.id), /Nothing to undo/);
  room.shoot('u1', { by: a, byMarble: 1, victim: b, victimMarble: 0 });
  assert.strictEqual(room.game.hits.length, 2);
});

test('dev stunts are theatre: one at a time, a Rocky run ends in its home row, and cut ends it early', (t) => {
  const { room } = startedRoom();
  t.after(() => room.dispose());
  const [a] = room.game.active;
  const before = JSON.stringify(room.game.marbles);
  assert.throws(() => room.stunt('stranger', { kind: 'flash', seat: a, marble: 0 }), /not in this room/);
  assert.throws(() => room.stunt('u1', { kind: 'nope', seat: a, marble: 0 }), /Unknown bit/);
  assert.throws(() => room.stunt('u1', { kind: 'rocky', seat: a, marble: 99 }), /Pick a marble/);
  room.stunt('u1', { kind: 'rocky', seat: a, marble: 0 });
  assert.strictEqual(JSON.stringify(room.game.marbles), before);
  const { path } = room.game.stunts[0];
  assert.strictEqual(room.game.marbles[a][0].zone, 'base');
  assert.deepStrictEqual(path[0], { zone: 'track', idx: rules.entryIdx(a) });
  assert.deepStrictEqual(path.at(-1), { zone: 'home', slot: rules.HOME_LEN - 1 });
  assert.strictEqual(path.length, 1 + rules.LAST_TRACK + rules.HOME_LEN);
  assert.throws(() => room.stunt('u1', { kind: 'flash', seat: a, marble: 1 }), /Cut the last bit/);
  const realAt = Date.now;
  Date.now = () => realAt() + 10 * 60 * 1000;
  assert.throws(() => room.stunt('u1', { kind: 'flash', seat: a, marble: 1 }), /Cut the last bit/, 'Rocky keeps celebrating until cut');
  Date.now = realAt;
  const [stunt] = room.view().game.stunts;
  assert.ok(stunt.age >= 0 && !stunt.cut && !('t' in stunt));
  room.cutStunt('u1', stunt.id);
  assert.strictEqual(room.view().game.stunts[0].cut, true);
  room.stunt('u1', { kind: 'flash', seat: a, marble: 1 });
  assert.deepStrictEqual(room.game.stunts.map((s) => s.kind), ['flash']);
  room.cutStunt('u1', room.game.stunts[0].id);
  room.stunt('u1', { kind: 'ufo', seat: a, marble: 0 });
  room.stuntWarm('u1', 's1', room.game.stuntPrep.id);
  room.stuntWarm('u2', 's2', room.game.stuntPrep.id);
  assert.deepStrictEqual(room.game.stunts.map((s) => s.kind), ['ufo']);
});

test('the ufo waits for every connected screen to warm up, or 15s, before it plays', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1e6 });
  const { room } = startedRoom();
  t.after(() => room.dispose());
  room.join({ userId: 'viewer', name: 'Watcher' });
  room.attach('viewer', 's9');
  room.attach('u1', 's1b');
  const a = room.game.turn;
  room.stunt('u1', { kind: 'ufo', seat: a, marble: 0 });
  const { id } = room.view().game.stuntPrep;
  assert.ok(!room.game.stunts?.length, 'nothing plays while warming');
  assert.throws(() => room.stunt('u1', { kind: 'flash', seat: a, marble: 1 }), /Cut the last bit/);
  room.stuntWarm('u1', 's1', 'stale');
  room.stuntWarm('u1', 's1', id);
  room.stuntWarm('u2', 's2', id);
  room.stuntWarm('viewer', 's9', id);
  assert.ok(!room.game.stunts?.length, 'the second device still counts');
  room.detach('u1', 's1b');
  assert.deepStrictEqual(room.game.stunts.map((s) => s.id), [id]);
  assert.ok(!room.game.stuntPrep);
  assert.ok(room.view().game.stunts[0].age >= 0);

  room.cutStunt('u1', id);
  room.stunt('u1', { kind: 'ufo', seat: a, marble: 0 });
  const slow = room.game.stuntPrep.id;
  t.mock.timers.tick(14999);
  assert.ok(room.game.stuntPrep, 'still waiting on everyone');
  t.mock.timers.tick(1);
  assert.strictEqual(room.game.stunts[0].id, slow, 'a stuck screen cannot hold the table forever');

  room.cutStunt('u1', slow);
  room.stunt('u1', { kind: 'ufo', seat: a, marble: 0 });
  room.cutStunt('u1', room.game.stuntPrep.id);
  assert.ok(!room.game.stuntPrep);
  t.mock.timers.tick(15000);
  assert.strictEqual(room.game.stunts[0].id, slow, 'cutting while warming calls it off');
});

test('the start wheel waits for every connected screen to warm up, or 8s, before it spins', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1e6 });
  const room = new Room('STRT', { onChange: () => {} });
  t.after(() => room.dispose());
  room.join({ userId: 'u1', name: 'Ana' });
  room.join({ userId: 'u2', name: 'Rui' });
  room.attach('u1', 's1');
  room.attach('u2', 's2');
  room.start('u1');
  const { id } = room.view().game.startPrep;
  assert.ok(id, 'the game parks on a ready-check');
  assert.strictEqual(room.view().turnEndsIn, null, 'no turn clock while everyone warms');
  const who = room.seats[room.game.turn].userId;
  assert.throws(() => room.roll(who), /still loading/);
  assert.throws(() => room.stunt('u1', { kind: 'flash', seat: 0, marble: 0 }), /still loading/);
  const pickT = room.game.pick.t;
  t.mock.timers.tick(500);
  room.stuntWarm('u1', 's1', 'stale');
  room.stuntWarm('u1', 's1', id);
  assert.ok(room.game.startPrep, 'still waiting on the other player');
  room.attach('u1', 's1b');
  room.stuntWarm('u2', 's2', id);
  assert.ok(room.game.startPrep, 'a second device counts too');
  room.stuntWarm('u1', 's1b', id);
  assert.ok(!room.game.startPrep);
  assert.ok(room.game.pick.t > pickT, 'the wheel clock starts at go');
  assert.strictEqual(room.game.log[0].t, room.game.pick.t + timing.START_WHEEL_SPIN_MS, 'the held feed entry lands with the wheel');
  assert.ok(room.view().turnEndsIn > 0, 'the turn clock arms once everyone is warm');

  const slow = new Room('SLOW', { onChange: () => {} });
  t.after(() => slow.dispose());
  slow.join({ userId: 'u1', name: 'Ana' });
  slow.join({ userId: 'u2', name: 'Rui' });
  slow.attach('u1', 's1');
  slow.attach('u2', 's2');
  slow.start('u1');
  slow.detach('u2', 's2');
  slow.stuntWarm('u1', 's1', slow.game.startPrep.id);
  assert.ok(!slow.game.startPrep, 'a disconnected straggler cannot hold the lobby');

  const stuck = new Room('STUK', { onChange: () => {} });
  t.after(() => stuck.dispose());
  stuck.join({ userId: 'u1', name: 'Ana' });
  stuck.join({ userId: 'u2', name: 'Rui' });
  stuck.attach('u1', 's1');
  stuck.attach('u2', 's2');
  stuck.start('u1');
  t.mock.timers.tick(7999);
  assert.ok(stuck.game.startPrep, 'still waiting on a stuck screen');
  t.mock.timers.tick(1);
  assert.ok(!stuck.game.startPrep, 'the cap fires and the wheel goes anyway');
});

test('dice storm rolls 50 dice, lets the dev burn them move by move, and reverts everything when cut', (t) => {
  const { room } = startedRoom();
  t.after(() => room.dispose());
  room.game.turn = 2;
  room.game.phase = 'roll';
  room.game.marbles[2][0] = { zone: 'track', idx: rules.entryIdx(2) + 4 };
  const snapshotBefore = JSON.stringify({
    marbles: room.game.marbles,
    turn: room.game.turn,
    phase: room.game.phase,
    die: room.game.die,
    stats: room.game.stats,
  });

  room.stunt('u1', { kind: 'dice', seat: 2 });
  const [stunt] = room.view().game.stunts;
  assert.strictEqual(stunt.kind, 'dice');
  assert.strictEqual(stunt.seat, 2);
  assert.strictEqual(stunt.dice.length, 50);
  assert.strictEqual(room.game.turn, 2);
  assert.strictEqual(room.game.phase, 'move');
  assert.ok(room.game.legalMoves.length > 0);
  assert.strictEqual(room.view().turnEndsIn, null, 'turn clock stays off during dice storm');

  const firstMove = room.game.legalMoves[0];
  room.move('u1', firstMove.id);
  const afterFirst = room.view().game.stunts[0];
  assert.strictEqual(afterFirst.dice.filter((d) => d.burned).length, 1);
  assert.strictEqual(room.game.turn, 2, 'turn stays with the roller across dice');
  assert.strictEqual(room.game.phase, 'move');
  assert.ok(room.game.legalMoves.length > 0);

  const nonSix = afterFirst.dice.find((d) => !d.burned && d.die > 1 && d.die < 6);
  if (nonSix) {
    room.pickStuntDie('u1', nonSix.id);
    assert.strictEqual(room.game.die, nonSix.die);
    assert.strictEqual(room.game.stunts[0].activeDieId, nonSix.id);
  }

  const secondMove = room.game.legalMoves[0];
  room.move('u1', secondMove.id);
  assert.strictEqual(room.view().game.stunts[0].dice.filter((d) => d.burned).length, 2);
  assert.notStrictEqual(JSON.stringify(room.game.marbles[2]), JSON.stringify(JSON.parse(snapshotBefore).marbles[2]));

  room.cutStunt('u1', stunt.id);
  assert.strictEqual(room.view().game.stunts[0].cut, true);
  assert.strictEqual(
    JSON.stringify({
      marbles: room.game.marbles,
      turn: room.game.turn,
      phase: room.game.phase,
      die: room.game.die,
      stats: room.game.stats,
    }),
    snapshotBefore,
    'cutting the bit restores the original game state'
  );
});

test('a spectator arms the dice storm on a seat; it goes off on their next roll', (t) => {
  const { room } = startedRoom();
  t.after(() => room.dispose());
  room.game.turn = 1;
  room.game.phase = 'roll';
  room.join({ userId: 'u3', name: 'Cid' });
  room.attach('u3', 's3');

  room.stunt('u3', { kind: 'dice', seat: 0 });
  assert.strictEqual(room.game.armedDice.seat, 0);
  assert.ok(!room.game.stunts, 'arming drops no dice yet');

  room.stunt('u3', { kind: 'dice', seat: 0 });
  assert.ok(!room.game.armedDice, 'picking the same seat disarms it');

  room.stunt('u3', { kind: 'dice', seat: 0 });
  room.game.turn = 0;
  room.game.phase = 'roll';
  room.changed();
  assert.strictEqual(room.game.stunts[0].kind, 'dice');
  assert.strictEqual(room.game.stunts[0].seat, 0);
  assert.ok(!room.game.armedDice, 'the arm clears once it fires');
  room.cutStunt('u3', room.game.stunts[0].id);

  room.game.turn = 1;
  room.game.phase = 'roll';
  room.stunt('u3', { kind: 'dice' });
  assert.strictEqual(room.game.stunts[0].seat, 1, 'untargeted lands on whosoever turn it is and goes off right away');
  room.cutStunt('u3', room.game.stunts[0].id);
});

test('a bot waits out a close encounter instead of moving the marble that is up in the saucer', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const room = new Room('ABDC', { onChange: () => {} });
  t.after(() => room.dispose());
  room.join({ userId: 'u1', name: 'Ana' });
  room.attach('u1', 's1');
  room.addBot('u1', 1);
  room.pickStarter = () => ({ seat: 1, reason: 'winner' });
  room.start('u1');
  room.playStart();
  const rolls = () => room.game.stats[1].rolls;
  room.stunt('u1', { kind: 'ufo', seat: 1, marble: 0 });
  t.mock.timers.tick(5000);
  assert.strictEqual(rolls(), 0, 'the bot holds while everyone warms up');
  room.stuntWarm('u1', 's1', room.game.stuntPrep.id);
  t.mock.timers.tick(UFO.end * 1000 - 100);
  assert.strictEqual(rolls(), 0, 'the bot holds while the bit plays');
  t.mock.timers.tick(8000);
  assert.ok(rolls() > 0, 'and gets on with it once the bit is over');

  const quick = new Room('CUTT', { onChange: () => {} });
  t.after(() => quick.dispose());
  quick.join({ userId: 'u1', name: 'Ana' });
  quick.attach('u1', 's1');
  quick.addBot('u1', 1);
  quick.pickStarter = () => ({ seat: 1, reason: 'winner' });
  quick.start('u1');
  quick.playStart();
  quick.stunt('u1', { kind: 'ufo', seat: 1, marble: 0 });
  quick.stuntWarm('u1', 's1', quick.game.stuntPrep.id);
  quick.cutStunt('u1', quick.game.stunts[0].id);
  t.mock.timers.tick(8000);
  assert.ok(quick.game.stats[1].rolls > 0, 'cutting the bit frees the bot straight away');
});

test('chat is rate limited, open to spectators, and works from the lobby on', (t) => {
  const { room, reactions } = startedRoom();
  t.after(() => room.dispose());
  room.chat('u1', 'one');
  assert.throws(() => room.chat('u1', 'two'), UserError);
  assert.throws(() => room.chat('stranger', 'hey'), UserError);

  const viewer = room.join({ userId: 'viewer', name: 'Watcher' });
  room.attach('viewer', 's9');
  const bubbles = reactions.length;
  room.chat('viewer', 'go ana!');
  const entry = room.view().chat.at(-1);
  assert.deepStrictEqual({ seat: entry.seat, from: entry.from, spectator: entry.spectator, text: entry.text }, { seat: null, from: viewer.id, spectator: true, text: 'go ana!' });
  assert.strictEqual(reactions.length, bubbles, 'spectators have no nameplate, so no bubble');
});

test('chat works before the game starts and keeps working across rounds', (t) => {
  const lobby = new Room('LOBY', { onChange: () => {} });
  t.after(() => lobby.dispose());
  lobby.join({ userId: 'u1', name: 'Ana' });
  lobby.join({ userId: 'u2', name: 'Rui' });
  lobby.join({ userId: 'u3', name: 'Mia' });
  lobby.attach('u1', 's1');
  lobby.attach('u2', 's2');
  lobby.attach('u3', 's3');
  lobby.chat('u1', 'already chatting');
  const entry = lobby.view().chat.at(-1);
  assert.deepStrictEqual({ chat: entry.chat, seat: entry.seat, spectator: entry.spectator, text: entry.text }, { chat: true, seat: 0, spectator: false, text: 'already chatting' });
  assert.throws(() => lobby.chat('u1', 'too fast'), UserError, 'the lobby rate limit still applies');

  lobby.start('u1');
  lobby.chat('u2', 'gl hf');
  assert.strictEqual(lobby.view().chat.at(-1).text, 'gl hf', 'mid-game lines join the room log too');
  assert.ok(lobby.game.log.every((e) => !e.chat), 'the game log stays game-only');

  lobby.game.phase = 'over';
  lobby.chat('u3', 'gg wp');
  assert.strictEqual(lobby.view().chat.at(-1).text, 'gg wp', 'results banter lands in the room log');

  lobby.rematch('u1');
  lobby.start('u1');
  assert.deepStrictEqual(lobby.view().chat.map((e) => e.text), ['already chatting', 'gl hf', 'gg wp'], 'a new round keeps the whole chat history');
});

test('beta and dev tags get a hair trigger on reactions; everyone else waits', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const reactions = [];
  const room = new Room('SPAM', { onChange: () => {}, onReaction: (_, r) => reactions.push(r) });
  t.after(() => room.dispose());
  room.join({ userId: 'u1', name: 'Ana', tags: ['beta'] });
  room.join({ userId: 'u2', name: 'Rui' });
  room.attach('u1', 's1');
  room.attach('u2', 's2');
  room.start('u1');

  t.mock.timers.tick(1200);
  room.react('u1', 'gg');
  t.mock.timers.tick(300);
  room.react('u1', 'haha');
  assert.strictEqual(reactions.length, 2, 'a tester fires again almost straight away');

  room.react('u2', 'gg');
  t.mock.timers.tick(300);
  room.react('u2', 'haha');
  assert.strictEqual(reactions.length, 3, 'everyone else still waits out the cooldown');
  t.mock.timers.tick(900);
  room.react('u2', 'nice');
  assert.strictEqual(reactions.length, 4);
});

test('emotes only fire from the pack a player has equipped', (t) => {
  const { room, reactions } = startedRoom();
  t.after(() => room.dispose());
  assert.throws(() => room.react('u1', 'fire'), UserError, 'the starter pack has no fire');
  room.seats[0].cosmetics = { emotes: 'emotes.hype' };
  room.react('u1', 'fire');
  assert.strictEqual(reactions.at(-1).key, 'fire');
  room.seats[2].cosmetics = { emotes: 'emotes.hype' };
  assert.throws(() => room.react('u2', 'salt'), UserError, 'hype pack cannot borrow from the salt pack');
});

test('beta and dev spectators can fire emotes from their own pack; other spectators cannot', (t) => {
  const { room, reactions } = startedRoom();
  t.after(() => room.dispose());
  room.join({ userId: 'w1', name: 'Watcher', tags: ['beta'], cosmetics: { emotes: 'emotes.hype' } });
  room.join({ userId: 'w2', name: 'Lurker' });
  room.react('w1', 'fire');
  assert.deepStrictEqual(reactions.at(-1), { spectator: true, from: room.spectators.get('w1').id, name: 'Watcher', pack: 'emotes.hype', key: 'fire', t: reactions.at(-1).t });
  assert.throws(() => room.react('w1', 'gg'), UserError, 'spectators only get emotes, not quick chat');
  assert.throws(() => room.react('w2', 'fire'), /Only players/);
  assert.deepStrictEqual(room.view().spectators.find((p) => p.name === 'Watcher').tags, ['beta']);
});

test('seat colours can be set in lobby or mid-game with unrestricted hexes and reset', (t) => {
  const { room } = startedRoom();
  t.after(() => room.dispose());
  assert.strictEqual(room.view().colors, undefined);
  assert.throws(() => room.setColor('stranger', { seat: 0, color: 'violet' }), /not in this room/);
  assert.throws(() => room.setColor('u1', { seat: 9, color: 'violet' }), /Pick a seat/);
  assert.throws(() => room.setColor('u1', { seat: 0, color: 'not-a-color' }), /Unknown colour/);

  room.setColor('u1', { seat: 0, color: 'violet' });
  assert.strictEqual(room.view().colors[0].main, '#8b4dff');
  assert.strictEqual(room.view().seats[0].color.name, 'Violet');
  assert.strictEqual(room.view().game.colors[0].main, '#8b4dff');

  room.setColor('u1', { seat: 1, color: '#050507' });
  assert.strictEqual(room.view().colors[1].main, '#050507');

  room.setColor('u1', { seat: 0, color: null });
  room.setColor('u1', { seat: 1, color: null });
  assert.strictEqual(room.view().colors, undefined);
});

test('a seat can be set to rainbow and reset', (t) => {
  const { room } = startedRoom();
  t.after(() => room.dispose());
  room.setColor('u1', { seat: 2, color: 'rainbow' });
  assert.strictEqual(room.view().colors[2].rainbow, true);
  assert.strictEqual(room.view().seats[2].color.name, 'Rainbow');
  assert.strictEqual(room.view().colors[0].rainbow, undefined);
  room.setColor('u1', { seat: 2, color: null });
  assert.strictEqual(room.view().colors, undefined);
});
