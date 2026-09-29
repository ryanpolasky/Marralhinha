const { randomBytes, randomInt } = require('crypto');
const rules = require('./game/rules');
const { chooseMove } = require('./game/bot');
const { botCosmetics } = require('./economy');
const { ITEMS } = require('./catalog');

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SEAT_ORDER = [0, 2, 1, 3];
const BOT_NAMES = ['Rollo', 'Pebbles', 'Dicey', 'Clink', 'Marbo', 'Bolinha'];
const BOT_DELAY_MS = 450;
// How long the client shows the "who starts" wheel; bots wait for it (keep in sync with START_WHEEL_MS in src/game/moves.js)
const START_WHEEL_MS = 8500;
const START_WINNER_MS = 2200;
const AWAY_GRACE_MS = 20000;
// Connected players get this long per roll/move before the game plays for them. The host picks it in the
// lobby: 15-45s in 5s steps, or null for no limit (keep in sync with TURN_SECONDS in src/game/moves.js)
const TURN_SECONDS_DEFAULT = 30;
const TURN_SECONDS_OPTIONS = [15, 20, 25, 30, 35, 40, 45];
// After this many timed-out turns in a row a player counts as away and gets played for quickly
const IDLE_MISSES = 2;
const IDLE_DELAY_MS = 2500;
// A disconnected host hands the host role to the next connected player after this long
const HOST_HANDOFF_MS = 15000;
const ROOM_TTL_MS = 30 * 60 * 1000;
const REACTIONS = ['nice', 'ouch', 'haha', 'hurry', 'lucky', 'gg'];
const REACTION_COOLDOWN_MS = 1200;
const CHAT_MAX = 140;
const CHAT_GAP_MS = 600;
const CHAT_BURST = 5;
const CHAT_WINDOW_MS = 10000;
const TEAM_LOG_LIMIT = 60;
const PING_COOLDOWN_MS = 1000;
const PING_TYPES = ['look', 'danger'];
const PING_BOUND = 16;
const BOT_ACK_MS = 700;

// In 2v2, partners sit across from each other
const teamSeats = (seat) => [seat, (seat + 2) % 4];

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
  if (game.pick) {
    const introMs = game.pick.reason === 'wheel' ? START_WHEEL_MS : START_WINNER_MS;
    if (now - game.pick.t < introMs) ms = Math.max(ms, introMs - (now - game.pick.t));
  }
  return ms;
}

class Room {
  constructor(code, hooks, { instanceId = null } = {}) {
    this.code = code;
    this.hooks = hooks;
    this.instanceId = instanceId;
    this.seats = [null, null, null, null];
    this.spectators = new Map();
    this.swapOffers = [];
    this.hostId = null;
    this.game = null;
    this.teams = false;
    this.turnSeconds = TURN_SECONDS_DEFAULT;
    this.humansAtStart = 0;
    // Player ids of the last round's winners: one of them starts the rematch on their board
    this.lastWinners = [];
    // Team chat never enters the shared game log; each team's history only goes to that team's devices
    this.teamLogs = [[], []];
    this.timer = null;
    this.timerKey = null;
    this.turnDeadline = null;
    this.hostTimer = null;
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

  findViewer(userId) {
    return this.findByUser(userId)?.player || this.spectators.get(userId);
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

  // `spectate` joins as a watcher even when a lobby seat is free (used by the admin "spectate" button)
  join(info, { spectate = false } = {}) {
    this.touch();
    const existing = this.findByUser(info.userId);
    if (existing) {
      Object.assign(existing.player, { name: info.name, cosmetics: info.cosmetics, level: info.level, tags: info.tags });
      return existing.player;
    }
    const spectator = this.spectators.get(info.userId);
    if (spectator) {
      Object.assign(spectator, { name: info.name, cosmetics: info.cosmetics, level: info.level, tags: info.tags });
      return spectator;
    }
    const seat = this.game || spectate ? undefined : SEAT_ORDER.find((s) => !this.seats[s]);
    if (seat === undefined && this.spectators.size >= 32) throw new UserError('That room is full, including spectators');
    const player = { id: newId(), ...info, isBot: false, connected: false, sockets: new Set() };
    if (seat === undefined) this.spectators.set(info.userId, player);
    else {
      this.seats[seat] = player;
      if (!this.hostId) this.hostId = player.id;
    }
    return player;
  }

  updateUser(info) {
    const player = this.findViewer(info.userId);
    if (!player) return;
    Object.assign(player, { name: info.name, cosmetics: info.cosmetics, level: info.level, tags: info.tags });
    this.changed();
  }

  attach(userId, socketId) {
    const player = this.findViewer(userId);
    if (!player) return;
    player.sockets.add(socketId);
    player.connected = true;
    if (player.id === this.hostId) this.cancelHostHandoff();
    this.touch();
    this.changed();
  }

  detach(userId, socketId) {
    const player = this.findViewer(userId);
    if (!player) return;
    player.sockets.delete(socketId);
    player.connected = player.sockets.size > 0;
    if (!player.connected) this.spectators.delete(userId);
    if (!player.connected && player.id === this.hostId) this.scheduleHostHandoff();
    this.changed();
  }

  scheduleHostHandoff() {
    this.cancelHostHandoff();
    this.hostTimer = setTimeout(() => {
      this.hostTimer = null;
      const host = this.seats.find((p) => p && p.id === this.hostId);
      if (host?.connected) return;
      const next = this.seats.find((p) => p && !p.isBot && p.connected);
      if (!next) return;
      this.hostId = next.id;
      this.changed();
    }, HOST_HANDOFF_MS);
  }

  cancelHostHandoff() {
    clearTimeout(this.hostTimer);
    this.hostTimer = null;
  }

  // "Leave" from one device: other devices on the same account keep the seat. Returns true if the user fully left
  leaveDevice(userId, socketId) {
    const player = this.findViewer(userId);
    if (!player) return true;
    if ([...player.sockets].some((id) => id !== socketId)) {
      this.detach(userId, socketId);
      return false;
    }
    this.leave(userId);
    return true;
  }

  // Seated in a game that is still being played
  inLiveGame(userId) {
    return !!(this.game && this.game.phase !== 'over' && this.findByUser(userId));
  }

  leave(userId) {
    if (this.spectators.delete(userId)) {
      this.changed();
      return;
    }
    const { seat, player } = this.require(userId);
    this.swapOffers = this.swapOffers.filter((offer) => offer.fromId !== player.id && offer.toId !== player.id);
    if (this.game && this.game.phase !== 'over') {
      this.seats[seat] = { id: player.id, name: `${player.name} (bot)`, isBot: true, connected: true, cosmetics: player.cosmetics, level: player.level, standIn: true };
      rules.addLog(this.game, `${player.name} left, a bot takes over`, seat);
    } else this.seats[seat] = null;
    if (player.id === this.hostId) this.hostId = this.seats.find((p) => p && !p.isBot)?.id ?? null;
    this.changed();
  }

  setSeat(userId, seat) {
    this.requireLobby();
    const found = this.findByUser(userId);
    const player = found?.player || this.spectators.get(userId);
    if (!player) throw new UserError('You are not in this room');
    if (!Number.isInteger(seat) || seat < 0 || seat > 3 || this.seats[seat]) throw new UserError('That seat is taken');
    this.seats[seat] = player;
    if (found) this.seats[found.seat] = null;
    else this.spectators.delete(userId);
    if (!this.hostId) this.hostId = player.id;
    this.swapOffers = [];
    this.changed();
  }

  offerSwap(userId, seat) {
    this.requireLobby();
    const { seat: from, player } = this.require(userId);
    const target = this.seats[seat];
    if (!Number.isInteger(seat) || seat < 0 || seat > 3 || seat === from || !target || target.isBot) throw new UserError('Choose another player to offer a swap');
    if (this.swapOffers.some((offer) => offer.fromId === player.id && offer.toId === target.id)) throw new UserError('Swap already offered');
    this.swapOffers = this.swapOffers.filter((offer) => offer.fromId !== player.id);
    this.swapOffers.push({ fromId: player.id, toId: target.id, from, to: seat });
    this.changed();
  }

  respondSwap(userId, fromId, accept) {
    this.requireLobby();
    const { seat, player } = this.require(userId);
    const offer = this.swapOffers.find((o) => o.fromId === fromId && o.toId === player.id);
    if (!offer) throw new UserError('That offer is no longer available');
    this.swapOffers = this.swapOffers.filter((o) => o !== offer);
    if (accept) {
      if (seat !== offer.to || this.seats[offer.from]?.id !== fromId) throw new UserError('Seats changed, ask for a new swap');
      [this.seats[seat], this.seats[offer.from]] = [this.seats[offer.from], this.seats[seat]];
      this.swapOffers = [];
    }
    this.changed();
  }

  cancelSwap(userId) {
    this.requireLobby();
    const { player } = this.require(userId);
    this.swapOffers = this.swapOffers.filter((offer) => offer.fromId !== player.id);
    this.changed();
  }

  forceSwap(userId, seat, fromSeat) {
    this.requireLobby();
    if (!this.findViewer(userId)) throw new UserError('You are not in this room');
    const from = fromSeat ?? this.findByUser(userId)?.seat;
    if (!Number.isInteger(from) || from < 0 || from > 3 || !this.seats[from] || !Number.isInteger(seat) || seat < 0 || seat > 3 || seat === from || !this.seats[seat]) throw new UserError('Choose two occupied seats to swap');
    [this.seats[from], this.seats[seat]] = [this.seats[seat], this.seats[from]];
    this.swapOffers = [];
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

  // Dev-only (checked by the caller): swap the table's board mid-game, or pass null to go back to the starter's
  setBoard(userId, itemId) {
    if (!this.findViewer(userId)) throw new UserError('You are not in this room');
    if (!this.game) throw new UserError('Start a game first');
    const item = itemId === null ? null : ITEMS.get(itemId);
    if (itemId !== null && item?.slot !== 'board') throw new UserError('Unknown board');
    this.game.boardOverride = itemId;
    rules.addLog(this.game, item ? `The table is now on ${item.name}` : "The table is back on the starter's board");
    this.changed();
  }

  setTurnTime(userId, seconds) {
    this.requireHost(userId);
    this.requireLobby();
    if (seconds !== null && !TURN_SECONDS_OPTIONS.includes(seconds)) throw new UserError('Pick 15 to 45 seconds, or no limit');
    this.turnSeconds = seconds;
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
    const humans = [0, 1, 2, 3].filter((seat) => this.seats[seat] && !this.seats[seat].isBot);
    humans.forEach((seat) => Object.assign(this.seats[seat], { missed: 0, idle: false }));
    this.swapOffers = [];
    this.teamLogs = [[], []];
    this.game = rules.createGame(this.seats, { teams: this.teams, starter: this.pickStarter(), boardSeat: humans.length === 1 ? humans[0] : null });
    this.humansAtStart = humans.length;
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
    const { seat, player } = this.require(userId);
    if (!this.game || this.game.turn !== seat) throw new UserError("It's not your turn");
    player.missed = 0;
    player.idle = false;
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

  // Seated players and spectators can both chat; only seated players get a bubble under their nameplate.
  // channel 'team' (2v2, seated only) goes to the two partners' devices and nowhere else.
  chat(userId, text, channel = 'all') {
    const found = this.findByUser(userId);
    const player = found?.player || this.spectators.get(userId);
    if (!player) throw new UserError('You are not in this room');
    const seat = found ? found.seat : null;
    if (!this.game) throw new UserError('Chat opens once the game starts');
    const clean = cleanChat(text);
    if (!clean) return;
    const now = Date.now();
    player.chatTimes = (player.chatTimes || []).filter((t) => now - t < CHAT_WINDOW_MS);
    if (player.chatTimes.length >= CHAT_BURST || now - (player.chatTimes.at(-1) || 0) < CHAT_GAP_MS) throw new UserError('Whoa, slow down a little!');
    player.chatTimes.push(now);
    if (channel === 'team' && seat !== null && this.game.mode === 'teams') {
      const entry = { chat: true, team: true, seat, from: player.id, name: player.name, text: clean, t: now };
      const log = this.teamLogs[seat % 2];
      log.push(entry);
      if (log.length > TEAM_LOG_LIMIT) log.splice(0, log.length - TEAM_LOG_LIMIT);
      this.hooks.onTeam?.(this, teamSeats(seat), 'room:teamChat', entry);
      this.hooks.onTeam?.(this, teamSeats(seat), 'room:reaction', { seat, text: clean, team: true, t: now });
      this.touch();
      return;
    }
    rules.pushLog(this.game, { chat: true, seat, from: player.id, spectator: seat === null, name: player.name, text: clean, t: now });
    if (seat !== null) this.hooks.onReaction?.(this, { seat, text: clean, t: now });
    this.changed();
  }

  teamLogFor(userId) {
    const found = this.findByUser(userId);
    return found && this.game?.mode === 'teams' ? this.teamLogs[found.seat % 2] : [];
  }

  // Socket ids of the humans sitting in these seats (for team-only messages)
  socketsForSeats(seats) {
    return seats.flatMap((seat) => {
      const p = this.seats[seat];
      return p && !p.isBot && p.sockets ? [...p.sockets] : [];
    });
  }

  // Drop an arrow on the board. Seated players ping their team (2v2) or everyone; spectators only if
  // they're Dev (admin), always to everyone. A team ping at a bot partner gets a little acknowledgement.
  ping(userId, { x, z, type, scope } = {}, { admin = false } = {}) {
    const found = this.findByUser(userId);
    const spectator = !found && this.spectators.get(userId);
    if (!found && !spectator) throw new UserError('You are not in this room');
    if (!found && !admin) throw new UserError('Only players can ping');
    if (!this.game) throw new UserError('Pings open once the game starts');
    const px = Number(x);
    const pz = Number(z);
    if (!Number.isFinite(px) || !Number.isFinite(pz) || Math.abs(px) > PING_BOUND || Math.abs(pz) > PING_BOUND) throw new UserError('Ping a spot on the board');
    const player = found?.player || spectator;
    const now = Date.now();
    if (player.lastPing !== undefined && now - player.lastPing < PING_COOLDOWN_MS) return;
    player.lastPing = now;
    const seat = found ? found.seat : null;
    const toTeam = seat !== null && scope === 'team' && this.game.mode === 'teams';
    const ping = { id: newId(), seat, name: player.name, x: Math.round(px * 100) / 100, z: Math.round(pz * 100) / 100, type: PING_TYPES.includes(type) ? type : 'look', scope: toTeam ? 'team' : 'all', dev: !found, t: now };
    this.touch();
    this.hooks.onPing?.(this, ping, toTeam ? teamSeats(seat) : null);
    const partner = toTeam ? this.seats[(seat + 2) % 4] : null;
    if (partner?.isBot) {
      const timer = setTimeout(() => {
        this.banterTimers.delete(timer);
        this.hooks.onPing?.(this, { ...ping, id: newId(), seat: (seat + 2) % 4, name: partner.name, type: 'ack', t: Date.now() }, teamSeats(seat));
      }, BOT_ACK_MS);
      this.banterTimers.add(timer);
    }
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

  // Bots, away players and idle players get played for. Unrelated updates (chat, reactions, spectators)
  // keep the running timer, so the turn clock never resets unless the turn itself changes
  scheduleAutoplay() {
    const { game } = this;
    const player = game && game.phase !== 'over' ? this.seats[game.turn] : null;
    const key = player && [game.turn, game.phase, game.lastRoll?.t, game.lastMove?.t, player.id, player.isBot, player.connected, player.idle].join('|');
    if (key && key === this.timerKey && this.timer) return;
    clearTimeout(this.timer);
    this.timer = null;
    this.timerKey = key;
    this.turnDeadline = null;
    if (!player) return;
    const human = !player.isBot;
    // No turn limit: connected players take as long as they like
    if (human && player.connected && !player.idle && this.turnSeconds === null) return;
    const base = !human ? BOT_DELAY_MS + randomInt(0, 400) : !player.connected ? AWAY_GRACE_MS : player.idle ? IDLE_DELAY_MS : this.turnSeconds * 1000;
    const delay = base + animationMs(game);
    if (human && player.connected && !player.idle) this.turnDeadline = Date.now() + delay;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.timerKey = null;
      if (this.game !== game || game.phase === 'over') return;
      if (human && player.connected && !player.idle) {
        player.missed = (player.missed || 0) + 1;
        if (player.missed >= IDLE_MISSES) player.idle = true;
        rules.addLog(game, `${player.name} ran out of time`, game.turn);
      }
      if (game.phase === 'roll') rules.roll(game);
      else {
        rules.move(game, chooseMove(game).id);
        this.afterMove();
      }
      this.changed();
    }, delay);
  }

  hasHumans() {
    return this.seats.some((p) => p && !p.isBot) || [...this.spectators.values()].some((p) => p.connected);
  }

  isAbandoned(now = Date.now()) {
    const anyoneHere = this.seats.some((p) => p && !p.isBot && p.connected) || [...this.spectators.values()].some((p) => p.connected);
    return !this.hasHumans() || (!anyoneHere && now - this.lastActive > ROOM_TTL_MS);
  }

  dispose() {
    clearTimeout(this.timer);
    this.cancelHostHandoff();
    this.banterTimers.forEach(clearTimeout);
  }

  view() {
    return {
      code: this.code,
      hostId: this.hostId,
      activity: !!this.instanceId,
      teams: this.teams,
      turnSeconds: this.turnSeconds,
      seats: this.seats.map((p) => p && { id: p.id, name: p.name, isBot: p.isBot, connected: p.connected, idle: !!p.idle, devices: p.sockets?.size || 0, cosmetics: p.cosmetics, level: p.level, tags: p.tags || [] }),
      // Relative, so client clock skew doesn't matter
      turnEndsIn: this.turnDeadline ? Math.max(0, this.turnDeadline - Date.now()) : null,
      spectators: [...this.spectators.values()].map((p) => ({ id: p.id, name: p.name, connected: p.connected })),
      swapOffers: this.swapOffers,
      game: this.game,
    };
  }

  // Compact overview for the admin "active games" list
  summary() {
    const { game } = this;
    return {
      code: this.code,
      activity: !!this.instanceId,
      phase: !game ? 'lobby' : game.phase === 'over' ? 'over' : 'playing',
      teams: this.teams,
      players: this.seats.map((p, seat) => p && { seat, name: p.name, isBot: !!p.isBot, away: !p.isBot && (!p.connected || !!p.idle), home: game ? game.marbles[seat]?.filter((m) => m.zone === 'home').length ?? 0 : 0 }).filter(Boolean),
      spectators: this.spectators.size,
      lastActive: this.lastActive,
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

  // Rooms with at least one human in them, live games first
  list() {
    const order = { playing: 0, lobby: 1, over: 2 };
    return [...this.rooms.values()]
      .filter((room) => room.hasHumans())
      .map((room) => room.summary())
      .sort((a, b) => order[a.phase] - order[b.phase] || b.lastActive - a.lastActive);
  }

  roomsWithUser(userId) {
    return [...this.rooms.values()].filter((room) => room.findViewer(userId));
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
