const test = require('node:test');
const assert = require('node:assert/strict');
const { Room } = require('./rooms');
const { MIN_LOBBY_DIST, SEAT_COLORS, colorDistance } = require('../src/shared/colors');

function makeRoom() {
  return new Room('PAINT', { onChange() {} });
}

function join(room, userId, tags = []) {
  room.join({ userId, name: userId, tags, cosmetics: {}, level: 1 });
}

function effectiveColors(room) {
  return room.view().colors || SEAT_COLORS;
}

test('color picks require a seated owner and any player can pick a palette color once enabled', (t) => {
  const room = makeRoom();
  t.after(() => room.dispose());
  join(room, 'u1');
  assert.throws(() => room.pickColor('u1', { color: 'violet' }), /Nobody here has the Painter Pack/);

  join(room, 'owner', ['painter']);
  const picked = room.pickColor('u1', { color: 'violet' });
  assert.equal(picked.color.id, 'violet');
  assert.equal(picked.nudged, false);
  const pickedAt = room.seats[0].pickedAt;
  const playerColor = room.seats[0].color;
  room.setSeat('u1', 1);
  assert.equal(room.seats[1].color, playerColor);
  assert.equal(room.seats[1].pickedAt, pickedAt);
  assert.equal(room.view().painter.on, true);
  assert.deepEqual(room.view().painter.owners, [2]);
});

test('non-owner palette clashes are rejected and an owner can steal a picked color', (t) => {
  const room = makeRoom();
  t.after(() => room.dispose());
  join(room, 'owner', ['painter']);
  join(room, 'other');
  room.setSeat('owner', 1);
  room.setSeat('other', 0);
  room.pickColor('other', { color: 'red' });
  assert.throws(() => room.pickColor('owner', { color: 'red' }), /Too close to other's Red/);

  const stolen = room.pickColor('owner', { color: 'red', steal: true });
  assert.equal(stolen.color.id, 'red');
  assert.equal(room.seats[0].color, null);
  const colors = effectiveColors(room);
  assert.ok(colorDistance(colors[0].main, colors[2].main) >= MIN_LOBBY_DIST);
});

test('only owners can use hex and clashing hex colors acknowledge a nudge', (t) => {
  const room = makeRoom();
  t.after(() => room.dispose());
  join(room, 'owner', ['painter']);
  join(room, 'other');
  assert.throws(() => room.pickColor('other', { color: '#f4b400' }), /Only the Painter Pack owner can use a custom colour/);

  const picked = room.pickColor('owner', { color: '#f4b400' });
  assert.equal(picked.nudged, true);
  assert.notEqual(picked.color.main, '#f4b400');
  assert.ok(colorDistance(picked.color.main, SEAT_COLORS[2].main) >= MIN_LOBBY_DIST);
});

test('a new seat is nudged away from a picked palette color', (t) => {
  const room = makeRoom();
  t.after(() => room.dispose());
  join(room, 'owner', ['painter']);
  join(room, 'newcomer');
  room.pickColor('owner', { color: 'blue' });
  room.setSeat('newcomer', 1);

  const colors = effectiveColors(room);
  assert.ok(colorDistance(colors[0].main, colors[1].main) >= MIN_LOBBY_DIST);
  assert.notEqual(colors[1].id, 'blue');
});

test('leaving the last owner clears lobby picks, while game colors freeze across a rematch', (t) => {
  const room = makeRoom();
  t.after(() => room.dispose());
  join(room, 'owner', ['painter']);
  join(room, 'other');
  room.pickColor('other', { color: 'violet' });
  room.leave('owner');
  assert.equal(room.seats[2].color, null);

  join(room, 'owner', ['painter']);
  room.pickColor('other', { color: 'violet' });
  const frozenColor = room.paintColors()[2];
  room.start('other');
  assert.deepEqual(room.game.colors[2], frozenColor);
  room.setColor('owner', { seat: 0, color: 'pink' });
  assert.equal(room.view().colors[0].id, 'pink');
  assert.deepEqual(room.game.colors[2], frozenColor);

  room.game.phase = 'over';
  room.doRematch();
  assert.equal(room.seats[2].color.id, 'violet');
  assert.equal(room.paintColors()[2].id, 'violet');
});

test('Dev-tagged players count as seated Painter owners', (t) => {
  const room = makeRoom();
  t.after(() => room.dispose());
  join(room, 'dev');
  join(room, 'other');
  assert.equal(room.painterOn(), false);
  room.updateUser({ userId: 'dev', name: 'dev', avatar: null, cosmetics: {}, level: 1, tags: ['dev'] });
  assert.equal(room.painterOn(), true);
  const picked = room.pickColor('other', { color: 'violet' });
  assert.equal(picked.color.id, 'violet');
});

test('saved painter colours auto-apply and the host wins a clash with a joiner', (t) => {
  const room = makeRoom();
  t.after(() => room.dispose());
  room.join({ userId: 'joiner', name: 'joiner', tags: [], cosmetics: {}, level: 1, painterColor: 'violet' });
  room.join({ userId: 'host', name: 'host', tags: ['painter'], cosmetics: {}, level: 1, painterColor: 'violet' });
  room.hostId = room.seats.find((p) => p?.userId === 'host').id;
  const hostSeat = room.seats.findIndex((p) => p?.userId === 'host');
  const joinerSeat = room.seats.findIndex((p) => p?.userId === 'joiner');
  const colors = effectiveColors(room);
  assert.equal(colors[hostSeat].id, 'violet');
  assert.notEqual(colors[joinerSeat].id, 'violet');
  assert.ok(colorDistance(colors[hostSeat].main, colors[joinerSeat].main) >= MIN_LOBBY_DIST);
});

test('an explicit pick beats a non-host saved colour, and saved colours need a seated owner', (t) => {
  const room = makeRoom();
  t.after(() => room.dispose());
  room.join({ userId: 'host', name: 'host', tags: ['painter'], cosmetics: {}, level: 1 });
  room.join({ userId: 'saver', name: 'saver', tags: [], cosmetics: {}, level: 1, painterColor: 'teal' });
  join(room, 'picker');
  const saverSeat = room.seats.findIndex((p) => p?.userId === 'saver');
  assert.equal(effectiveColors(room)[saverSeat].id, 'teal');
  const pickerSeat = room.seats.findIndex((p) => p?.userId === 'picker');
  room.pickColor('picker', { color: 'teal' });
  const colors = effectiveColors(room);
  assert.equal(colors[pickerSeat].id, 'teal');
  assert.notEqual(colors[saverSeat].id, 'teal');

  room.leave('host');
  assert.equal(room.view().colors, undefined);
});
