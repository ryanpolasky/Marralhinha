const { randomBytes, randomInt } = require('crypto');
const rules = require('./game/rules');
const { chooseMove } = require('./game/bot');
const { botCosmetics } = require('./economy');

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SEAT_ORDER = [0, 2, 1, 3];
const BOT_NAMES = ['Rollo', 'Pebbles', 'Dicey', 'Clink', 'Marbo', 'Bolinha'];
const BOT_DELAY_MS = 450;
// How long the client shows the "who starts" wheel; bots wait for it (keep in sync with START_WHEEL_MS in src/game/moves.js)
const START_WHEEL_MS = 3600;
const AWAY_GRACE_MS = 20000;
const ROOM_TTL_MS = 30 * 60 * 1000;
const REACTIONS = ['nice', 'ouch', 'haha', 'hurry', 'lucky', 'gg'];
const REACTION_COOLDOWN_MS = 1200;
const CHAT_MAX = 140;
const CHAT_GAP_MS = 600;
const CHAT_BURST = 5;
const CHAT_WINDOW_MS = 10000;

const cleanChat = (text) =>
  String(text ?? '')
    .replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, CHAT_MAX);

class UserError extends Error {}

const newId = (bytes = 6) => randomBytes(bytes).toString('hex');

// Bots wait for the dice and marble animations to finish before acting
function animationMs(game, now = Date.now()) {
  const recent = (event) => event && now - event.t < 250;
  let ms = 0;
  if (recent(game.lastRoll)) ms = 1300;
  if (recent(game.lastMove)) ms = Math.max(ms, 350 + game.lastMove.path.length * 190 + (game.lastMove.capture ? 700 : 0));
  if (game.pick && !game.lastRoll && now - game.pick.t < START_WHEEL_MS) ms = Math.max(ms, START_WHEEL_MS - (now - game.pick.t));
  return ms;
}

class Room {
  constructor(code, hooks, { instanceId = null } = {}) {
    this.code = code;
    this.hooks = hooks;
    this.instanceId = instanceId;
    this.seats = [null, null, null, null];
    this.hostId = null;
    this.game = null;
    this.teams = false;
    this.humansAtStart = 0;
    // Player ids of the last round's winners: one of them starts the rematch on their board
    this.lastWinners = [];
    this.timer = null;
    this.banterTimers = new Set();
    this.lastActive = Date.now();
  }

  touch() {
    this.lastActive = Date.now();
  }

  findByUser(userId) {
    const seat = this.seats.findIndex((p) => p && !p.isBot && p.userId === userId);
    return seat === -1 ? null : { seat, player: this.seats[seat] };
  }

  require(userId) {
    const found = userId && this.findByUser(userId);
    if (!found) throw new UserError('You are not in this room');
    return found;
  }

  requireHost(userId) {
    const found = this.require(userId);
    if (found.player.id !== this.hostId) throw new UserError('Only the host can do that');
    return found;
  }

  requireLobby() {
    if (this.game) throw new UserError('The game has already started');
  }

  join(info) {
    this.touch();
    const existing = this.findByUser(info.userId);
    if (existing) {
      Object.assign(existing.player, { name: info.name, cosmetics: info.cosmetics, level: info.level, tags: info.tags });
      return existing.player;
    }
    if (this.game) throw new UserError('A game is in progress here. Hang tight for the next round!');
    const seat = SEAT_ORDER.find((s) => !this.seats[s]);
    if (seat === undefined) throw new UserError('That room is full');
    const player = { id: newId(), ...info, isBot: false, connected: false, sockets: new Set() };
    this.seats[seat] = player;
    if (!this.hostId) this.hostId = player.id;
    return player;
  }

  updateUser(info) {
    const found = this.findByUser(info.userId);
    if (!found) return;
    Object.assign(found.player, { name: info.name, cosmetics: info.cosmetics, level: info.level, tags: info.tags });
    this.changed();
  }

  attach(userId, socketId) {
    const found = this.findByUser(userId);
    if (!found) return;
    found.player.sockets.add(socketId);
    found.player.connected = true;
    this.touch();
    this.changed();
  }

  detach(userId, socketId) {
    const found = this.findByUser(userId);
    if (!found) return;
    found.player.sockets.delete(socketId);
    found.player.connected = found.player.sockets.size > 0;
    this.changed();
  }

  leave(userId) {
    const { seat, player } = this.require(userId);
    if (this.game && this.game.phase !== 'over') {
      this.seats[seat] = { id: player.id, name: `${player.name} (bot)`, isBot: true, connected: true, cosmetics: player.cosmetics, level: player.level, standIn: true };
      rules.addLog(this.game, `${player.name} left, a bot takes over`, seat);
    } else this.seats[seat] = null;
    if (player.id === this.hostId) this.hostId = this.seats.find((p) => p && !p.isBot)?.id ?? null;
    this.changed();
  }

  setSeat(userId, seat) {
    this.requireLobby();
    const found = this.require(userId);
    if (!Number.isInteger(seat) || seat < 0 || seat > 3 || this.seats[seat]) throw new UserError('That seat is taken');
    this.seats[seat] = found.player;
    this.seats[found.seat] = null;
    this.changed();
  }

  addBot(userId, seat) {
    this.requireHost(userId);
    this.requireLobby();
    if (!Number.isInteger(seat) || seat < 0 || seat > 3 || this.seats[seat]) throw new UserError('That seat is taken');
    const used = new Set(this.seats.filter(Boolean).map((p) => p.name));
    const index = BOT_NAMES.findIndex((n) => !used.has(n));
    const name = index >= 0 ? BOT_NAMES[index] : `Bot ${seat + 1}`;
    this.seats[seat] = { id: newId(), name, isBot: true, connected: true, cosmetics: botCosmetics(randomInt(1000)), level: 1 + randomInt(30) };
    this.changed();
  }

  removeBot(userId, seat) {
    this.requireHost(userId);
    this.requireLobby();
    if (!this.seats[seat]?.isBot) throw new UserError('Only bots can be removed');
    this.seats[seat] = null;
    this.changed();
  }

  setTeams(userId, teams) {
    this.requireHost(userId);
    this.requireLobby();
    this.teams = !!teams;
    this.changed();
  }

  start(userId) {
    this.requireHost(userId);
    this.requireLobby();
    this.game = rules.createGame(this.seats, { teams: this.teams, starter: this.pickStarter() });
    this.humansAtStart = this.seats.filter((p) => p && !p.isBot).length;
    this.changed();
  }

  pickStarter() {
    const champions = [0, 1, 2, 3].filter((s) => this.seats[s] && this.lastWinners.includes(this.seats[s].id));
    if (champions.length) return { seat: champions[randomInt(champions.length)], reason: 'winner' };
    const active = [0, 1, 2, 3].filter((s) => this.seats[s]);
    return { seat: active[randomInt(active.length)], reason: 'wheel' };
  }

  rematch(userId) {
    this.requireHost(userId);
    if (!this.game || this.game.phase !== 'over') throw new UserError('The game is not over yet');
    this.lastWinners = this.game.winners.map((s) => this.seats[s]?.id).filter(Boolean);
    this.game = null;
    this.seats = this.seats.map((p) => (p && p.standIn ? null : p));
    this.changed();
  }

  requireTurn(userId) {
    const { seat } = this.require(userId);
    if (!this.game || this.game.turn !== seat) throw new UserError("It's not your turn");
  }

  roll(userId) {
    this.requireTurn(userId);
    if (this.game.phase !== 'roll') throw new UserError('Pick a marble to move first');
    rules.roll(this.game);
    this.changed();
  }

  move(userId, moveId) {
    this.requireTurn(userId);
    if (this.game.phase !== 'move') throw new UserError('Roll the dice first');
    if (!this.game.legalMoves.some((m) => m.id === moveId)) throw new UserError("That move isn't allowed");
    rules.move(this.game, moveId);
    this.afterMove();
    this.changed();
  }

  afterMove() {
    this.botBanter();
    if (this.game.phase === 'over' && !this.game.rewards) {
      const players = this.seats.map((p, seat) => p && !p.isBot && p.userId && { seat, userId: p.userId }).filter(Boolean);
      this.game.rewards = this.hooks.onGameOver?.(this, { players, botGame: this.humansAtStart < 2 }) || {};
    }
  }

  react(userId, key) {
    const { seat, player } = this.require(userId);
    if (!REACTIONS.includes(key)) throw new UserError('Unknown reaction');
    const now = Date.now();
    if (now - (player.lastReaction || 0) < REACTION_COOLDOWN_MS) return;
    player.lastReaction = now;
    this.hooks.onReaction?.(this, { seat, key, t: now });
  }

  chat(userId, text) {
    const { seat, player } = this.require(userId);
    if (!this.game) throw new UserError('Chat opens once the game starts');
    const clean = cleanChat(text);
    if (!clean) return;
    const now = Date.now();
    player.chatTimes = (player.chatTimes || []).filter((t) => now - t < CHAT_WINDOW_MS);
    if (player.chatTimes.length >= CHAT_BURST || now - (player.chatTimes.at(-1) || 0) < CHAT_GAP_MS) throw new UserError('Whoa, slow down a little!');
    player.chatTimes.push(now);
    rules.pushLog(this.game, { chat: true, seat, name: player.name, text: clean, t: now });
    this.hooks.onReaction?.(this, { seat, text: clean, t: now });
    this.changed();
  }

  botBanter() {
    const { game } = this;
    const mv = game.lastMove;
    const say = (seat, key, chance, delay) => {
      if (!this.seats[seat]?.isBot || Math.random() > chance) return;
      const timer = setTimeout(() => {
        this.banterTimers.delete(timer);
        this.hooks.onReaction?.(this, { seat, key, t: Date.now() });
      }, delay);
      this.banterTimers.add(timer);
    };
    const landed = 300 + (mv?.path?.length || 1) * 190;
    if (mv?.capture) {
      say(mv.seat, Math.random() < 0.6 ? 'haha' : 'nice', 0.6, landed + 300);
      say(mv.capture.seat, 'ouch', 0.7, landed + 800);
    }
    if (game.phase === 'over') game.winners.forEach((s, i) => say(s, 'gg', 0.9, 1800 + i * 500));
  }

  changed() {
    this.touch();
    this.scheduleAutoplay();
    this.hooks.onChange(this);
  }

  scheduleAutoplay() {
    clearTimeout(this.timer);
    this.timer = null;
    const { game } = this;
    if (!game || game.phase === 'over') return;
    const player = this.seats[game.turn];
    if (!player || (!player.isBot && player.connected)) return;
    const delay = (player.isBot ? BOT_DELAY_MS + randomInt(0, 400) : AWAY_GRACE_MS) + animationMs(game);
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.game !== game || game.phase === 'over') return;
      if (game.phase === 'roll') rules.roll(game);
      else {
        rules.move(game, chooseMove(game).id);
        this.afterMove();
      }
      this.changed();
    }, delay);
  }

  hasHumans() {
    return this.seats.some((p) => p && !p.isBot);
  }

  isAbandoned(now = Date.now()) {
    const anyoneHere = this.seats.some((p) => p && !p.isBot && p.connected);
    return !this.hasHumans() || (!anyoneHere && now - this.lastActive > ROOM_TTL_MS);
  }

  dispose() {
    clearTimeout(this.timer);
    this.banterTimers.forEach(clearTimeout);
  }

  view() {
    return {
      code: this.code,
      hostId: this.hostId,
      activity: !!this.instanceId,
      teams: this.teams,
      seats: this.seats.map((p) => p && { id: p.id, name: p.name, isBot: p.isBot, connected: p.connected, cosmetics: p.cosmetics, level: p.level, tags: p.tags || [] }),
      game: this.game,
    };
  }
}

class RoomManager {
  constructor(hooks) {
    this.rooms = new Map();
    this.instances = new Map();
    this.hooks = hooks;
  }

  create(options) {
    let code;
    do code = Array.from({ length: 4 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join('');
    while (this.rooms.has(code));
    const room = new Room(code, this.hooks, options);
    this.rooms.set(code, room);
    return room;
  }

  get(code) {
    const room = this.rooms.get(String(code ?? '').trim().toUpperCase());
    if (!room) throw new UserError('Room not found, check the code');
    return room;
  }

  forInstance(instanceId) {
    const id = String(instanceId || '').slice(0, 64);
    if (!/^[\w-]+$/.test(id)) throw new UserError('Invalid activity instance');
    const existing = this.rooms.get(this.instances.get(id));
    if (existing) return existing;
    const room = this.create({ instanceId: id });
    this.instances.set(id, room.code);
    return room;
  }

  roomsWithUser(userId) {
    return [...this.rooms.values()].filter((room) => room.findByUser(userId));
  }

  sweep() {
    for (const [code, room] of this.rooms) {
      if (room.isAbandoned()) {
        room.dispose();
        this.rooms.delete(code);
        if (room.instanceId) this.instances.delete(room.instanceId);
      }
    }
  }
}

module.exports = { Room, RoomManager, UserError };
