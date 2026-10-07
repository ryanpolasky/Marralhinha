const { randomBytes, randomInt } = require('crypto');
const rules = require('../src/shared/rules');
const { chooseMove } = require('../src/shared/bot');
const { animationMs, TURN_SECONDS, TURN_SECONDS_DEFAULT } = require('../src/shared/timing');
const { REACTION_KEYS } = require('../src/shared/reactions');
const { botCosmetics } = require('./economy');
const { ITEMS, DEFAULTS } = require('./catalog');

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SEAT_ORDER = [0, 2, 1, 3];
const BOT_NAMES = ['Rollo', 'Pebbles', 'Dicey', 'Clink', 'Marbo', 'Bolinha'];
const BOT_DELAY_MS = 450;
// One-time grace for a dropped player, then the bot plays their turns at idle speed until they're back
const AWAY_GRACE_MS = 20000;
// After this many timed-out turns in a row a player counts as away and gets played for quickly
const IDLE_MISSES = 2;
const IDLE_DELAY_MS = 2500;
// A disconnected host hands the host role to the next connected player after this long
const HOST_HANDOFF_MS = 15000;
const ROOM_TTL_MS = 15 * 60 * 1000;
const QUICK_PLAY_TTL_MS = 4 * 60 * 1000;
const REACTION_COOLDOWN_MS = 1200;
// Beta testers and Devs get a hair-trigger reactions panel for emote spam
const TESTER_REACTION_COOLDOWN_MS = 250;
const TESTER_TAGS = ['beta', 'dev'];
const CHAT_MAX = 280;
const CHAT_GAP_MS = 600;
const CHAT_BURST = 5;
const CHAT_WINDOW_MS = 10000;
const TEAM_LOG_LIMIT = 100;
const CHAT_LOG_LIMIT = 100;
const PING_COOLDOWN_MS = 1000;
const PING_TYPES = ['look', 'danger'];
const PING_BOUND = 16;
const BOT_ACK_MS = 700;

const teamSeats = (seat) => [seat, rules.partnerOf(seat)];

const cleanChat = (text) =>
  String(text ?? '')
    .replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, CHAT_MAX);

class UserError extends Error {}

const secureDie = () => randomInt(1, 7);
const newId = (bytes = 6) => randomBytes(bytes).toString('hex');

class Room {
  constructor(code, hooks, { instanceId = null, quickPlay = false } = {}) {
    this.code = code;
    this.hooks = hooks;
    this.instanceId = instanceId;
    this.quickPlay = quickPlay;
    this.seats = [null, null, null, null];
    this.spectators = new Map();
    this.swapOffers = [];
    this.hostId = null;
    this.game = null;
    this.teams = false;
    this.variant = 'classic';
    this.turnSeconds = TURN_SECONDS_DEFAULT;
    this.humansAtStart = 0;
    // Player ids of the last round's winners: one of them starts the rematch on their board
    this.lastWinners = [];
    // Team chat never enters the shared game log; each team's history only goes to that team's devices
    this.teamLogs = [[], []];
    // Chat while no game is running (lobby, between rounds) lives here instead of game.log
    this.chatLog = [];
    this.timer = null;
    this.timerKey = null;
    this.turnDeadline = null;
    this.hostTimer = null;
    this.banterTimers = new Set();
    this.rematchVotes = new Set();
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

  // Lobby and results both let people sit down or get up; only mid-game locks the seats
  requireSeatable() {
    if (this.game && this.game.phase !== 'over') throw new UserError('The game has already started');
  }

  hostPlayer() {
    return this.seats.find((p) => p && p.id === this.hostId) || null;
  }

  setHost(player) {
    const from = this.hostPlayer();
    if (from?.id === player.id || player.isBot) return;
    // Fresh rooms and offline hosts don't need the fanfare
    const freshRoom = !from && !this.seats.some((p) => p && !p.isBot && p !== player);
    this.hostId = player.id;
    this.rematchVotes.delete(player.id);
    if (freshRoom || !player.connected) return;
    if (this.game) rules.addLog(this.game, `${player.name} is the host now`, null);
    this.hooks.onHostChange?.(this, { id: player.id, name: player.name, from: from?.name ?? null });
  }

  // A newly seated player picks up a vacant or long-absent host role
  ensureHost(player) {
    const host = this.hostPlayer();
    if (!host) this.setHost(player);
    else if (!host.isBot && !host.connected) this.scheduleHostHandoff();
  }

  passHostFrom(player) {
    if (player.id !== this.hostId) return;
    this.cancelHostHandoff();
    const next = this.seats.find((p) => p && p !== player && !p.isBot && p.connected) ?? this.seats.find((p) => p && p !== player && !p.isBot);
    if (next) this.setHost(next);
    else this.hostId = null;
  }

  // `spectate` joins as a watcher even when a lobby seat is free (used by the admin "spectate" button)
  // `prefer` is the player's favourite colour (seat 0-3): used when it's free, otherwise the usual order
  join(info, { spectate = false, prefer = null } = {}) {
    this.touch();
    const existing = this.findByUser(info.userId);
    if (existing) {
      Object.assign(existing.player, { name: info.name, avatar: info.avatar, cosmetics: info.cosmetics, level: info.level, tags: info.tags });
      return existing.player;
    }
    const spectator = this.spectators.get(info.userId);
    if (spectator) {
      Object.assign(spectator, { name: info.name, avatar: info.avatar, cosmetics: info.cosmetics, level: info.level, tags: info.tags });
      return spectator;
    }
    const favourite = SEAT_ORDER.includes(prefer) && !this.seats[prefer] ? prefer : undefined;
    const seat = this.game || spectate ? undefined : (favourite ?? SEAT_ORDER.find((s) => !this.seats[s]));
    if (seat === undefined && this.spectators.size >= 32) throw new UserError('That room is full, including spectators');
    const player = { id: newId(), ...info, isBot: false, connected: false, sockets: new Set(), clients: new Map(), blitz: false, goneAt: Date.now() };
    if (seat === undefined) this.spectators.set(info.userId, player);
    else {
      this.seats[seat] = player;
      if (!this.hostId) this.setHost(player);
    }
    return player;
  }

  updateUser(info) {
    const player = this.findViewer(info.userId);
    if (!player) return;
    Object.assign(player, { name: info.name, avatar: info.avatar, cosmetics: info.cosmetics, level: info.level, tags: info.tags });
    this.changed();
  }

  attach(userId, socketId, { blitz = true } = {}) {
    const player = this.findViewer(userId);
    if (!player) return;
    player.clients?.set(socketId, blitz);
    player.blitz = player.clients ? [...player.clients.values()].every(Boolean) : blitz;
    player.sockets.add(socketId);
    player.connected = true;
    player.goneAt = null;
    this.emptyAt = null;
    if (player.id === this.hostId) this.cancelHostHandoff();
    else {
      // Someone arrived while the host is gone: (re)start the handoff countdown so the lobby is never hostless
      const host = this.hostPlayer();
      if (host && !host.isBot && !host.connected) this.scheduleHostHandoff();
      else if (!host && this.seats.includes(player)) this.setHost(player);
    }
    this.touch();
    this.changed();
  }

  detach(userId, socketId) {
    const player = this.findViewer(userId);
    if (!player) return;
    player.sockets.delete(socketId);
    player.clients?.delete(socketId);
    if (player.clients?.size) player.blitz = [...player.clients.values()].every(Boolean);
    player.connected = player.sockets.size > 0;
    if (!player.connected) {
      player.goneAt = Date.now();
      this.spectators.delete(userId);
      // An activity seat is only worth holding while the game is live; outside that, gone means gone
      if (this.instanceId && this.findByUser(userId) && !this.inLiveGame(userId)) {
        this.leave(userId);
      } else {
        if (player.id === this.hostId) this.scheduleHostHandoff();
        this.maybeRematch();
      }
      if (!this.anyoneConnected()) this.emptyAt = Date.now();
    }
    this.changed();
  }

  // Is at least one human (seated or spectating) actually connected right now
  anyoneConnected() {
    return this.seats.some((p) => p && !p.isBot && p.connected) || [...this.spectators.values()].some((p) => p.connected);
  }

  // The countdown runs from goneAt, so a host gone past the grace period yields on the spot
  scheduleHostHandoff() {
    this.cancelHostHandoff();
    const host = this.hostPlayer();
    if (!host || host.isBot) return;
    const delay = Math.max(0, (host.goneAt ?? Date.now()) + HOST_HANDOFF_MS - Date.now());
    this.hostTimer = setTimeout(() => {
      this.hostTimer = null;
      const current = this.hostPlayer();
      if (!current || current.connected || current.isBot) return;
      const next = this.seats.find((p) => p && !p.isBot && p.connected);
      if (!next) return;
      this.setHost(next);
      this.maybeRematch();
      this.changed();
    }, delay);
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
    this.rematchVotes.delete(player.id);
    this.swapOffers = this.swapOffers.filter((offer) => offer.fromId !== player.id && offer.toId !== player.id);
    // Hand the host off before the seat becomes a stand-in
    this.passHostFrom(player);
    if (this.game && this.game.phase !== 'over') {
      this.seats[seat] = { id: player.id, name: `${player.name} (bot)`, isBot: true, connected: true, cosmetics: player.cosmetics, level: player.level, standIn: true };
      rules.addLog(this.game, `${player.name} left, a bot takes over`, seat);
    } else this.seats[seat] = null;
    if (!this.anyoneConnected()) this.emptyAt = Date.now();
    this.maybeRematch();
    this.changed();
  }

  setSeat(userId, seat) {
    this.requireSeatable();
    const found = this.findByUser(userId);
    const player = found?.player || this.spectators.get(userId);
    if (!player) throw new UserError('You are not in this room');
    if (!Number.isInteger(seat) || seat < 0 || seat > 3 || this.seats[seat]) throw new UserError('That seat is taken');
    this.seats[seat] = player;
    if (found) this.seats[found.seat] = null;
    else this.spectators.delete(userId);
    this.ensureHost(player);
    this.swapOffers = [];
    this.maybeRematch();
    this.changed();
  }

  unseat(userId) {
    this.requireSeatable();
    const { seat, player } = this.require(userId);
    this.rematchVotes.delete(player.id);
    this.swapOffers = this.swapOffers.filter((offer) => offer.fromId !== player.id && offer.toId !== player.id);
    this.seats[seat] = null;
    this.spectators.set(userId, player);
    this.passHostFrom(player);
    this.maybeRematch();
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

  // Bots don't mind: seated players swap straight in, and spectators just take the seat over
  takeBotSeat(userId, seat) {
    this.requireSeatable();
    const found = this.findByUser(userId);
    const player = found?.player || this.spectators.get(userId);
    if (!player) throw new UserError('You are not in this room');
    if (!Number.isInteger(seat) || !this.seats[seat]?.isBot) throw new UserError('That seat has no bot in it');
    if (found) [this.seats[found.seat], this.seats[seat]] = [this.seats[seat], this.seats[found.seat]];
    else {
      this.seats[seat] = player;
      this.spectators.delete(userId);
      this.ensureHost(player);
    }
    this.swapOffers = [];
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

  // Dev-only (checked by the caller): dress a seat's marbles, dice or kill effect in anything, null hands back their own
  setSkin(userId, { seat, slot, item }) {
    if (!this.findViewer(userId)) throw new UserError('You are not in this room');
    if (!['marble', 'dice', 'fx', 'trail'].includes(slot)) throw new UserError('Pick marbles, dice, kill effects or trails');
    const target = this.seats[seat];
    if (!target) throw new UserError('That seat is empty');
    const entry = item == null ? null : ITEMS.get(item);
    if (item != null && (!entry || entry.slot !== slot)) throw new UserError('Unknown item for that slot');
    const troll = { ...(target.troll || {}) };
    if (entry) troll[slot] = entry.id;
    else delete troll[slot];
    if (Object.keys(troll).length) target.troll = troll;
    else delete target.troll;
    if (this.game) rules.addLog(this.game, entry ? `Dev gave ${target.name} the ${entry.name}` : `${target.name} is back to their own look`, null);
    this.changed();
  }

  setTurnTime(userId, seconds) {
    this.requireHost(userId);
    this.requireLobby();
    if (!TURN_SECONDS.includes(seconds)) throw new UserError('Pick 15 to 45 seconds, or no limit');
    this.turnSeconds = seconds;
    this.changed();
  }

  setTeams(userId, teams) {
    this.requireHost(userId);
    this.requireLobby();
    this.teams = !!teams;
    this.changed();
  }

  setVariant(userId, variant) {
    this.requireHost(userId);
    this.requireLobby();
    let spec;
    try {
      spec = rules.boardSpec(variant);
    } catch {
      throw new UserError('Unknown board variant');
    }
    if (spec.id === 'blitz') {
      const outdated = [...this.seats, ...this.spectators.values()].some((p) => p && !p.isBot && p.connected && p.blitz === false);
      if (outdated) throw new UserError('Everyone at the table needs to reload before playing Blitz');
    }
    this.variant = spec.id;
    this.changed();
  }

  start(userId) {
    this.requireHost(userId);
    this.requireLobby();
    this.beginGame();
    this.changed();
  }

  endTable(userId) {
    const { player } = this.requireHost(userId);
    if (!this.instanceId) throw new UserError('Only Discord tables can end a game');
    if (!this.game || this.game.phase === 'over') throw new UserError('There is no active game to end');
    this.doRematch();
    this.teamLogs = [[], []];
    this.banterTimers.forEach(clearTimeout);
    this.banterTimers.clear();
    this.changed();
    this.hooks.onTableEnded?.(this, { id: player.id, name: player.name });
  }

  // start() without the host check: a unanimous vote goes straight to the next round
  beginGame() {
    const humans = [0, 1, 2, 3].filter((seat) => this.seats[seat] && !this.seats[seat].isBot);
    humans.forEach((seat) => Object.assign(this.seats[seat], { missed: 0, idle: false, away: false }));
    this.swapOffers = [];
    this.teamLogs = [[], []];
    this.rematchVotes.clear();
    this.game = rules.createGame(this.seats, { rng: secureDie, teams: this.teams, starter: this.pickStarter(), boardSeat: humans.length === 1 ? humans[0] : null, variant: this.variant });
    // Who actually took each seat's turns: rolls = all turns, botRolls = the bot played them (timeouts, away,
    // disconnected), plus rolls/sixes/captures someone else made for this seat, which never count towards its stats
    this.game.played = [0, 1, 2, 3].map(() => ({ rolls: 0, botRolls: 0, coveredRolls: 0, coveredSixes: 0, coveredCaptures: 0 }));
    this.humansAtStart = humans.length;
  }

  pickStarter() {
    const champions = [0, 1, 2, 3].filter((s) => this.seats[s] && this.lastWinners.includes(this.seats[s].id));
    if (champions.length) return { seat: champions[randomInt(champions.length)], reason: 'winner' };
    const active = [0, 1, 2, 3].filter((s) => this.seats[s]);
    return { seat: active[randomInt(active.length)], reason: 'wheel' };
  }

  // A host press fires instantly; anyone else's press toggles a vote. All votes in = next round.
  rematch(userId) {
    const { player } = this.require(userId);
    if (!this.game || this.game.phase !== 'over') throw new UserError('The game is not over yet');
    if (player.id === this.hostId) {
      this.doRematch();
      this.changed();
      return;
    }
    const now = Date.now();
    if (now - (player.lastVote || 0) < REACTION_COOLDOWN_MS) return;
    player.lastVote = now;
    const on = !this.rematchVotes.delete(player.id);
    if (on) this.rematchVotes.add(player.id);
    Object.assign(player, { away: false, idle: false, missed: 0 });
    rules.addLog(this.game, on ? `${player.name} wants a rematch` : `${player.name} backed out of the rematch`, null);
    const fired = this.maybeRematch();
    this.changed();
    this.hooks.onRematchVote?.(this, { id: player.id, name: player.name, on, fired });
  }

  rematchNeeded() {
    return this.seats.filter((p) => p && !p.isBot && p.connected && !p.away && !p.idle && p.id !== this.hostId);
  }

  rematchStatus() {
    const needed = this.rematchNeeded();
    const voters = needed.filter((p) => this.rematchVotes.has(p.id)).map((p) => p.id);
    const pending = needed.filter((p) => !this.rematchVotes.has(p.id)).map((p) => p.id);
    return { voters, pending };
  }

  maybeRematch() {
    if (!this.game || this.game.phase !== 'over') return false;
    const { voters, pending } = this.rematchStatus();
    if (!voters.length || pending.length) return false;
    this.doRematch();
    if (this.seats.filter(Boolean).length >= 2) this.beginGame();
    return true;
  }

  doRematch() {
    this.lastWinners = this.game.winners?.map((s) => this.seats[s]?.id).filter(Boolean) || [];
    this.game = null;
    // Activity seats held by closed clients free up for the next round instead of staying locked
    const gone = (p) => p.standIn || (this.instanceId && !p.isBot && !p.connected);
    this.seats = this.seats.map((p) => (p && gone(p) ? null : p));
    this.rematchVotes.clear();
    if (!this.hostPlayer()) {
      const next = this.seats.find((p) => p && !p.isBot && p.connected);
      if (next) this.setHost(next);
      else this.hostId = null;
    }
  }

  coverFor(seat) {
    return rules.coverFor(this.game, this.seats, seat);
  }

  // Returns who is acting for the turn: 'self', or 'partner' when covering for an away teammate.
  // Acting on your own turn also brings you back from being away.
  requireTurn(userId) {
    const { seat, player } = this.require(userId);
    const turn = this.game?.turn;
    const kind = turn === seat ? 'self' : turn !== undefined && this.coverFor(turn) === player ? 'partner' : null;
    if (!kind) throw new UserError("It's not your turn");
    Object.assign(player, { missed: 0, idle: false }, kind === 'self' ? { away: false, coveredBy: null } : {});
    return kind;
  }

  // Bookkeeping for rewards and stats (see game.played in start)
  recordRoll(seat, kind) {
    const played = this.game.played?.[seat];
    if (!played) return;
    played.rolls += 1;
    if (kind === 'bot') played.botRolls += 1;
    if (kind !== 'self') played.coveredRolls += 1;
    if (kind !== 'self' && this.game.lastRoll?.die === 6) played.coveredSixes += 1;
  }

  recordMove(seat, kind) {
    const played = this.game.played?.[seat];
    if (played && kind !== 'self' && this.game.lastMove?.capture) played.coveredCaptures += 1;
  }

  roll(userId) {
    const kind = this.requireTurn(userId);
    if (this.game.phase !== 'roll') throw new UserError('Pick a marble to move first');
    const seat = this.game.turn;
    rules.roll(this.game, secureDie);
    this.recordRoll(seat, kind);
    this.changed();
  }

  move(userId, moveId) {
    const kind = this.requireTurn(userId);
    if (this.game.phase !== 'move') throw new UserError('Roll the dice first');
    if (!this.game.legalMoves.some((m) => m.id === moveId)) throw new UserError("That move isn't allowed");
    const seat = this.game.turn;
    rules.move(this.game, moveId);
    this.recordMove(seat, kind);
    this.afterMove();
    this.changed();
  }

  // "Step away": the bot (or, in 2v2, your partner) plays your turns until you come back
  stepAway(userId, away) {
    const { player } = this.require(userId);
    if (!this.game || this.game.phase === 'over') throw new UserError('You can only step away during a game');
    if (!!player.away === away) return;
    Object.assign(player, { away, coveredBy: null }, away ? {} : { idle: false, missed: 0 });
    const mate = this.seats[rules.partnerOf(this.seats.indexOf(player))];
    if (mate?.coveredBy === player.id) mate.coveredBy = null;
    rules.addLog(this.game, away ? `${player.name} stepped away` : `${player.name} is back`);
    this.changed();
  }

  // 2v2: the bot plays for an away player unless their teammate opts in to play for them
  coverTeammate(userId, on) {
    const { seat, player } = this.require(userId);
    const mate = this.seats[rules.partnerOf(seat)];
    if (this.game?.mode !== 'teams' || this.game.phase === 'over') throw new UserError('Only in a 2v2 game');
    if (!mate || mate.isBot || !mate.away) throw new UserError("Your teammate hasn't stepped away");
    if (player.away || player.idle) throw new UserError("You're away yourself");
    if ((mate.coveredBy === player.id) === on) return;
    mate.coveredBy = on ? player.id : null;
    rules.addLog(this.game, on ? `${player.name} is playing for ${mate.name}` : `${player.name} handed ${mate.name} back to the bot`);
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
    const pack = ITEMS.get(player.cosmetics?.emotes || DEFAULTS.emotes);
    const emote = pack?.slot === 'emotes' && (pack.emotes || []).some((e) => e.key === key);
    if (!REACTION_KEYS.includes(key) && !emote) throw new UserError('Unknown reaction');
    const now = Date.now();
    const cooldown = (player.tags || []).some((tag) => TESTER_TAGS.includes(tag)) ? TESTER_REACTION_COOLDOWN_MS : REACTION_COOLDOWN_MS;
    if (now - (player.lastReaction || 0) < cooldown) return;
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
    const clean = cleanChat(text);
    if (!clean) return;
    const now = Date.now();
    player.chatTimes = (player.chatTimes || []).filter((t) => now - t < CHAT_WINDOW_MS);
    if (player.chatTimes.length >= CHAT_BURST || now - (player.chatTimes.at(-1) || 0) < CHAT_GAP_MS) throw new UserError('Whoa, slow down a little!');
    player.chatTimes.push(now);
    if (channel === 'team' && seat !== null && this.game?.mode === 'teams') {
      const entry = { chat: true, team: true, seat, from: player.id, name: player.name, text: clean, t: now };
      const log = this.teamLogs[seat % 2];
      log.push(entry);
      if (log.length > TEAM_LOG_LIMIT) log.splice(0, log.length - TEAM_LOG_LIMIT);
      this.hooks.onTeam?.(this, teamSeats(seat), 'room:teamChat', entry);
      this.hooks.onTeam?.(this, teamSeats(seat), 'room:reaction', { seat, text: clean, team: true, t: now });
      this.touch();
      return;
    }
    const entry = { chat: true, seat, from: player.id, spectator: seat === null, name: player.name, text: clean, t: now };
    // Live rounds log chat into the game; lobby and results banter collect in the room log
    if (this.game && this.game.phase !== 'over') {
      rules.pushLog(this.game, entry);
    } else {
      this.chatLog.push(entry);
      if (this.chatLog.length > CHAT_LOG_LIMIT) this.chatLog.splice(0, this.chatLog.length - CHAT_LOG_LIMIT);
    }
    if (seat !== null && this.game) this.hooks.onReaction?.(this, { seat, text: clean, t: now });
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
    const partner = toTeam ? this.seats[rules.partnerOf(seat)] : null;
    if (partner?.isBot) {
      const timer = setTimeout(() => {
        this.banterTimers.delete(timer);
        this.hooks.onPing?.(this, { ...ping, id: newId(), seat: rules.partnerOf(seat), name: partner.name, type: 'ack', t: Date.now() }, teamSeats(seat));
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
    const cover = player ? this.coverFor(game.turn) : null;
    const key = player && [game.turn, game.phase, game.lastRoll?.t, game.lastMove?.t, player.id, player.isBot, player.connected, player.idle, player.away, cover?.id].join('|');
    if (key && key === this.timerKey && this.timer) return;
    clearTimeout(this.timer);
    this.timer = null;
    this.timerKey = key;
    this.turnDeadline = null;
    if (!player) return;
    const human = !player.isBot;
    // Waiting on a person: the player themselves, or their partner covering while they're away
    const waiting = human && (cover || (player.connected && !player.idle && !player.away));
    // No turn limit: connected players take as long as they like
    if (waiting && this.turnSeconds === null) return;
    const now = Date.now();
    const base = waiting
      ? this.turnSeconds * 1000
      : !human || player.away
        ? BOT_DELAY_MS + randomInt(0, 400)
        : !player.connected
          ? Math.max(BOT_DELAY_MS, (player.goneAt ?? now) + AWAY_GRACE_MS - now)
          : IDLE_DELAY_MS;
    const delay = base + animationMs(game, now);
    if (waiting) this.turnDeadline = Date.now() + delay;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.timerKey = null;
      if (this.game !== game || game.phase === 'over') return;
      if (waiting && !cover) {
        player.missed = (player.missed || 0) + 1;
        if (player.missed >= IDLE_MISSES) player.idle = true;
        rules.addLog(game, `${player.name} ran out of time`, game.turn);
      }
      const seat = game.turn;
      if (game.phase === 'roll') {
        rules.roll(game, secureDie);
        if (human) this.recordRoll(seat, 'bot');
      } else {
        rules.move(game, chooseMove(game).id);
        if (human) this.recordMove(seat, 'bot');
        this.afterMove();
      }
      this.changed();
    }, delay);
  }

  hasHumans() {
    return this.seats.some((p) => p && !p.isBot) || [...this.spectators.values()].some((p) => p.connected);
  }

  isAbandoned(now = Date.now()) {
    if (!this.hasHumans()) return true;
    if (this.anyoneConnected()) return false;
    // Everyone's gone: the room dies ROOM_TTL_MS after the last human left, even if bots keep moving marbles
    return now - (this.emptyAt ?? this.lastActive) > (this.quickPlay ? QUICK_PLAY_TTL_MS : ROOM_TTL_MS);
  }

  dispose() {
    clearTimeout(this.timer);
    this.cancelHostHandoff();
    this.banterTimers.forEach(clearTimeout);
  }

  view() {
    const now = Date.now();
    return {
      code: this.code,
      hostId: this.hostId,
      activity: !!this.instanceId,
      teams: this.teams,
      variant: this.game?.variant || this.variant,
      turnSeconds: this.turnSeconds,
      seats: this.seats.map((p) => p && {
        id: p.id,
        name: p.name,
        avatar: p.avatar ?? null,
        userId: p.userId ?? null,
        isBot: p.isBot,
        connected: p.connected,
        // ms until a disconnected player's reconnect grace runs out and the bot plays at normal speed
        coverGrace: p.connected || p.away || p.isBot ? 0 : Math.max(0, (p.goneAt ?? now) + AWAY_GRACE_MS - now),
        idle: !!p.idle,
        away: !!p.away,
        coveredBy: p.coveredBy ?? null,
        devices: p.sockets?.size || 0,
        cosmetics: p.troll ? { ...p.cosmetics, ...p.troll } : p.cosmetics,
        level: p.level,
        tags: p.tags || [],
      }),
      // Relative, so client clock skew doesn't matter
      turnEndsIn: this.turnDeadline ? Math.max(0, this.turnDeadline - Date.now()) : null,
      spectators: [...this.spectators.values()].map((p) => ({ id: p.id, name: p.name, connected: p.connected })),
      swapOffers: this.swapOffers,
      rematch: this.game?.phase === 'over' ? this.rematchStatus() : null,
      chat: this.chatLog,
      game: this.game,
    };
  }

  // Compact overview for the admin "active games" list
  summary() {
    const { game } = this;
    return {
      code: this.code,
      activity: !!this.instanceId,
      empty: !this.anyoneConnected(),
      phase: !game ? 'lobby' : game.phase === 'over' ? 'over' : 'playing',
      teams: this.teams,
      variant: game?.variant || this.variant,
      players: this.seats.map((p, seat) => p && { seat, name: p.name, isBot: !!p.isBot, away: !p.isBot && (!p.connected || !!p.idle || !!p.away), home: game ? game.marbles[seat]?.filter((m) => m.zone === 'home').length ?? 0 : 0 }).filter(Boolean),
      spectators: this.spectators.size,
      lastActive: this.lastActive,
      startedAt: game?.startedAt ?? null,
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
