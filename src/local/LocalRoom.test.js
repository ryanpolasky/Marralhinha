import { LocalRoom, loadLocal, savedGameExists } from './LocalRoom';

beforeEach(() => localStorage.clear());

function playOut(room) {
  for (let i = 0; i < 20000 && room.game.phase !== 'over'; i++) {
    const { game } = room;
    if (game.phase === 'roll') room.action('game:roll');
    else room.action('game:move', { moveId: game.legalMoves[0].id });
  }
}

test('two humans can play a full game and the view follows the active player', () => {
  const room = new LocalRoom();
  room.action('game:start');
  const first = room.view();
  expect(first.local).toBe(true);
  expect(first.seats[first.game.turn].id).toBe(first.activePlayerId);
  playOut(room);
  const done = room.view();
  expect(done.game.phase).toBe('over');
  expect(done.seats[done.game.winners[0]].id).toBe(done.activePlayerId);
  expect(done.game.rewards).toBeUndefined();
});

test('refuses to start without two seats or a human', () => {
  const room = new LocalRoom();
  room.action('local:seat', { seat: 2, kind: 'empty' });
  expect(() => room.action('game:start')).toThrow(/at least 2/);
  room.action('local:seat', { seat: 2, kind: 'bot' });
  room.action('local:seat', { seat: 0, kind: 'bot' });
  expect(() => room.action('game:start')).toThrow(/Seat at least one human/);
});

test('humans cannot act on a bot turn', () => {
  const room = new LocalRoom();
  room.action('local:seat', { seat: 2, kind: 'bot' });
  room.action('game:start');
  while (!room.seats[room.game.turn].isBot) {
    if (room.game.phase === 'roll') room.action('game:roll');
    else room.action('game:move', { moveId: room.game.legalMoves[0].id });
  }
  expect(() => room.action('game:roll')).toThrow(/not your turn/);
  room.dispose();
});

test('saves to localStorage and resumes an unfinished game', () => {
  const room = new LocalRoom();
  room.action('local:rename', { seat: 0, name: 'Ana' });
  room.action('game:start');
  expect(savedGameExists()).toBe(true);
  const saved = loadLocal();
  const resumed = new LocalRoom(saved);
  expect(resumed.seats[0].name).toBe('Ana');
  expect(resumed.game.turn).toBe(room.game.turn);
});

test('rematch starts a fresh game with the winner first', () => {
  const room = new LocalRoom();
  room.action('game:start');
  playOut(room);
  const winner = room.game.winners[0];
  room.action('game:rematch');
  expect(room.game.phase).toBe('roll');
  expect(room.game.turn).toBe(winner);
});
