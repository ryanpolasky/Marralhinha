const test = require('node:test');
const assert = require('node:assert');
const { Room, UserError } = require('./rooms');

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

test('chat is rate limited and only for seated players once the game is on', (t) => {
  const { room } = startedRoom();
  t.after(() => room.dispose());
  room.chat('u1', 'one');
  assert.throws(() => room.chat('u1', 'two'), UserError);
  assert.throws(() => room.chat('stranger', 'hey'), UserError);

  const lobby = new Room('LOBY', { onChange: () => {} });
  lobby.join({ userId: 'u1', name: 'Ana' });
  assert.throws(() => lobby.chat('u1', 'too early'), /once the game starts/);
});
