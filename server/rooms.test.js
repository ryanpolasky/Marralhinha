const test = require('node:test');
const assert = require('node:assert');
const { Room, RoomManager, UserError } = require('./rooms');

function startedRoom() {
  const reactions = [];
  const room = new Room('TEST', { onChange: () => {}, onReaction: (_, r) => reactions.push(r) });
  room.join({ userId: 'u1', name: 'Ana' });
  room.join({ userId: 'u2', name: 'Rui' });
  room.attach('u1', 's1');
  room.attach('u2', 's2');
  room.start('u1');
  return { room, reactions };
}

test('chat messages land in the game log and pop a bubble for the sender', (t) => {
  const { room, reactions } = startedRoom();
  t.after(() => room.dispose());
  room.chat('u1', '  boa   sorte!  ');
  const entry = room.game.log.at(-1);
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
  const before = room.game.log.length;
  room.chat('u1', ' \n\t ');
  assert.strictEqual(room.game.log.length, before);
  room.chat('u2', `hi\u202Ethere ${'x'.repeat(300)}`);
  const entry = room.game.log.at(-1);
  assert.ok(entry.text.startsWith('hi there'));
  assert.strictEqual(entry.text.length, 140);
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

test('first game: a random seated player starts on their board; rematch: a winner starts on theirs', (t) => {
  const { room } = startedRoom();
  t.after(() => room.dispose());
  const { game } = room;
  assert.ok(game.active.includes(game.turn));
  assert.deepStrictEqual({ seat: game.pick.seat, reason: game.pick.reason, board: game.boardSeat }, { seat: game.turn, reason: 'wheel', board: game.turn });
  assert.match(game.log[0].text, /wheel lands on/i);

  // Second player sits across the table, in seat 2
  game.phase = 'over';
  game.winners = [2];
  room.rematch('u1');
  room.start('u1');
  assert.deepStrictEqual({ turn: room.game.turn, reason: room.game.pick.reason, board: room.game.boardSeat }, { turn: 2, reason: 'winner', board: 2 });
  assert.match(room.game.log[0].text, /won last round/);

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
  const manager = new RoomManager({ onChange: () => {} });
  const room = manager.create();
  room.join({ userId: 'u1', name: 'Ana' });
  room.addBot('u1', 2);
  room.start('u1');
  room.leave('u1');
  assert.strictEqual(room.isAbandoned(), true);
  manager.sweep();
  assert.strictEqual(manager.rooms.size, 0);
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
  assert.ok(room.view().turnEndsIn <= 15000 + 2200);
  assert.throws(() => room.setTurnTime('u1', 45), /already started/);

  room.game.phase = 'over';
  room.game.winners = [0];
  room.rematch('u1');
  room.setTurnTime('u1', null);
  room.start('u1');
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
  return { room, sent };
}

test('team chat only reaches the two partners and never the shared game log', (t) => {
  const { room, sent } = teamRoom(t);
  const partnerOfAna = room.seats[2].userId;
  const before = room.game.log.length;
  room.chat('u0', 'go for their blue one', 'team');
  assert.strictEqual(room.game.log.length, before, 'team chat stays out of the broadcast log');
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

test('chat is rate limited, open to spectators, and only once the game is on', (t) => {
  const { room, reactions } = startedRoom();
  t.after(() => room.dispose());
  room.chat('u1', 'one');
  assert.throws(() => room.chat('u1', 'two'), UserError);
  assert.throws(() => room.chat('stranger', 'hey'), UserError);

  const viewer = room.join({ userId: 'viewer', name: 'Watcher' });
  room.attach('viewer', 's9');
  const bubbles = reactions.length;
  room.chat('viewer', 'go ana!');
  const entry = room.game.log.at(-1);
  assert.deepStrictEqual({ seat: entry.seat, from: entry.from, spectator: entry.spectator, text: entry.text }, { seat: null, from: viewer.id, spectator: true, text: 'go ana!' });
  assert.strictEqual(reactions.length, bubbles, 'spectators have no nameplate, so no bubble');

  const lobby = new Room('LOBY', { onChange: () => {} });
  lobby.join({ userId: 'u1', name: 'Ana' });
  assert.throws(() => lobby.chat('u1', 'too early'), /once the game starts/);
});
