const fs = require('fs');
const http = require('http');
const path = require('path');
const express = require('express');
const { Server } = require('socket.io');
const { openDb, transaction } = require('./db');
const { Accounts } = require('./accounts');
const { Economy } = require('./economy');
const { Reports } = require('./reports');
const { Matches } = require('./matches');
const { createApi } = require('./api');
const { RoomManager, UserError } = require('./rooms');
const { legalRoutes } = require('./legal');

const PORT = Number(process.env.PORT) || 3001;
const BUILD_DIR = path.join(__dirname, '..', 'build');
const allowedOrigins = process.env.CLIENT_ORIGIN ? process.env.CLIENT_ORIGIN.split(',').map((o) => o.trim()) : null;
const isAllowedOrigin = (origin) => (allowedOrigins ? allowedOrigins.includes(origin) : process.env.NODE_ENV !== 'production');

const db = openDb();
const accounts = new Accounts(db);
const economy = new Economy(db, accounts);
const reports = new Reports(db);
const matches = new Matches(db, accounts);

const app = express();
app.set('trust proxy', 1);
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: (origin, cb) => cb(null, !origin || isAllowedOrigin(origin)) },
});

const pushProfile = (userId) => {
  const user = accounts.getUser(userId);
  if (!user) return;
  io.to(`user:${userId}`).emit('account:update', accounts.profile(user, { daily: economy.dailyStatus(user), replies: reports.pendingReplies(userId) }));
  rooms.roomsWithUser(userId).forEach((room) => room.updateUser(accounts.publicInfo(user)));
};

// Team-only messages go straight to the partners' sockets, never to the room broadcast
const emitToSeats = (room, seats, event, payload) => {
  const ids = room.socketsForSeats(seats);
  if (ids.length) io.to(ids).emit(event, payload);
};

const announceLucky = (change) => {
  if (!change) return;
  const { holder, previous, reclaimed, unlocked } = change;
  if (holder !== previous && holder) {
    const name = accounts.getUser(holder)?.name;
    if (name) io.emit('luckiest:change', `${name} has ${reclaimed ? 'reclaimed' : 'taken'} Luckiest${previous && !reclaimed ? ` from ${accounts.getUser(previous)?.name || 'the previous holder'}` : ''}!`);
  }
  for (const id of unlocked) {
    const name = accounts.getUser(id)?.name;
    if (name) io.emit('luckiest:change', `${name} unlocked the Golden Die after reigning as Luckiest for 7 total days!`);
  }
  new Set([holder, previous, ...unlocked].filter(Boolean)).forEach(pushProfile);
};

const rooms = new RoomManager({
  onChange: (room) => io.to(room.code).emit('room:state', room.view()),
  onReaction: (room, reaction) => io.to(room.code).emit('room:reaction', reaction),
  onTeam: emitToSeats,
  onPing: (room, ping, seats) => (seats ? emitToSeats(room, seats, 'room:ping', ping) : io.to(room.code).emit('room:ping', ping)),
  onGameOver: (room, { players, botGame }) => {
    try {
      const { rewards, lucky } = transaction(db, () => {
        matches.record(room);
        const rewards = economy.awardGame({ game: room.game, players, botGame });
        const lucky = accounts.refreshLucky();
        const winner = players.find((p) => p.userId === lucky?.holder);
        if (winner && lucky?.previous !== lucky.holder) rewards[winner.seat].luckyTag = true;
        for (const player of players) if (lucky?.unlocked.includes(player.userId)) rewards[player.seat].goldenDie = true;
        return { rewards, lucky };
      });
      setTimeout(() => {
        players.forEach(({ userId }) => pushProfile(userId));
        announceLucky(lucky);
      }, 0);
      return rewards;
    } catch (err) {
      console.error('[rewards]', err);
      return {};
    }
  },
});
announceLucky(accounts.refreshLucky(Date.now(), { inactivityOnly: true }));
setInterval(() => {
  rooms.sweep();
  try {
    announceLucky(accounts.refreshLucky(Date.now(), { inactivityOnly: true }));
  } catch (err) {
    console.error('[luckiest]', err);
  }
}, 60 * 1000).unref();

app.get('/health', (req, res) => res.json({ ok: true, rooms: rooms.rooms.size }));
app.use('/api', createApi({ accounts, economy, rooms, reports, matches, onProfileChange: pushProfile, isAllowedOrigin }));
legalRoutes(app);

if (fs.existsSync(BUILD_DIR)) {
  app.use(express.static(BUILD_DIR));
  app.get('*', (req, res) => res.sendFile(path.join(BUILD_DIR, 'index.html')));
}

io.use((socket, next) => {
  const user = accounts.userForToken(socket.handshake.auth?.token);
  if (!user) return next(new Error('unauthorized'));
  socket.data.userId = user.id;
  socket.data.blitz = Array.isArray(socket.handshake.auth?.features) && socket.handshake.auth.features.includes('blitz');
  return next();
});

io.on('connection', (socket) => {
  const { userId } = socket.data;
  socket.join(`user:${userId}`);

  const handle = (event, fn) =>
    socket.on(event, (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      try {
        reply({ ok: true, ...(fn(payload && typeof payload === 'object' ? payload : {}) || {}) });
      } catch (err) {
        if (!(err instanceof UserError)) console.error(`[${event}]`, err);
        reply({ ok: false, error: err instanceof UserError ? err.message : 'Something went wrong' });
      }
    });

  const current = () => {
    if (!socket.data.code) throw new UserError('Join a room first');
    return rooms.get(socket.data.code);
  };

  const leaveCurrent = (permanently) => {
    const { code } = socket.data;
    if (!code) return;
    socket.leave(code);
    socket.data.code = null;
    const room = rooms.rooms.get(code);
    if (!room || !room.findViewer(userId)) return;
    if (permanently) room.leaveDevice(userId, socket.id);
    else room.detach(userId, socket.id);
  };

  // One room per account. Refuse to silently forfeit a live game elsewhere; anything else (lobbies,
  // spectating, finished games) is left, and the user's other devices in those rooms are sent home
  const otherRooms = (code) => rooms.roomsWithUser(userId).filter((room) => room.code !== code);
  const ensureFree = (code) => {
    const live = otherRooms(code).find((room) => room.inLiveGame(userId));
    if (live) throw new UserError(`You're still playing in room ${live.code}. Leave that game first.`);
  };
  const leaveOthers = (code) => {
    otherRooms(code).forEach((room) => {
      const socketIds = [...(room.findViewer(userId)?.sockets || [])];
      room.leave(userId);
      socketIds.forEach((id) => {
        const other = io.sockets.sockets.get(id);
        if (!other || other.data.code !== room.code) return;
        other.leave(room.code);
        other.data.code = null;
        if (other.id !== socket.id) other.emit('room:left', { code: room.code, reason: 'You joined another room on another device' });
      });
    });
  };

  // `target` is a room, or a factory for a brand-new one (checked before it gets created)
  const enter = (target, options) => {
    const user = accounts.getUser(userId);
    if (!user) throw new UserError('Your account was not found, please reload');
    ensureFree(typeof target === 'function' ? null : target.code);
    const room = typeof target === 'function' ? target() : target;
    if (room.variant === 'blitz' && !socket.data.blitz) throw new UserError('Reload the page to play Blitz');
    const player = room.join(accounts.publicInfo(user), options);
    leaveOthers(room.code);
    if (socket.data.code && socket.data.code !== room.code) leaveCurrent(false);
    socket.data.code = room.code;
    socket.join(room.code);
    room.attach(userId, socket.id, { blitz: socket.data.blitz });
    // Team chat isn't in the shared state, so hand this device its team's history directly
    socket.emit('room:teamLog', { code: room.code, entries: room.teamLogFor(userId) });
    return { code: room.code, playerId: player.id };
  };

  // Favourite colour from the client's settings: a seat number, or anything else for "no preference"
  const preferOf = (payload) => (Number.isInteger(payload?.prefer) ? payload.prefer : null);

  handle('room:create', (payload) => enter(() => rooms.create(), { prefer: preferOf(payload) }));
  // One round trip for "Quick play vs bots": a lobby with bots in every other seat, so you can still
  // swap colours, switch on teams or change the timer before hitting Start
  handle('room:quickPlay', (payload) => {
    const res = enter(() => rooms.create(), { prefer: preferOf(payload) });
    const room = rooms.get(res.code);
    [0, 1, 2, 3].filter((seat) => !room.seats[seat]).forEach((seat) => room.addBot(userId, seat));
    return res;
  });
  handle('room:join', (payload) => enter(rooms.get(payload.code), { spectate: payload.spectate === true, prefer: preferOf(payload) }));
  handle('room:joinInstance', (payload) => enter(rooms.forInstance(payload.instanceId), { prefer: preferOf(payload) }));
  // Lets a second device pick up wherever this account is seated (live games first)
  handle('room:current', () => {
    const seated = rooms.roomsWithUser(userId).filter((room) => room.findByUser(userId));
    const room = seated.find((r) => r.inLiveGame(userId)) || seated[0];
    return { code: room?.code || null };
  });
  handle('room:leave', () => leaveCurrent(true));
  handle('lobby:seat', ({ seat }) => current().setSeat(userId, seat));
  handle('lobby:offerSwap', ({ seat }) => current().offerSwap(userId, seat));
  handle('lobby:takeBotSeat', ({ seat }) => current().takeBotSeat(userId, seat));
  handle('lobby:respondSwap', ({ fromId, accept }) => current().respondSwap(userId, fromId, accept === true));
  handle('lobby:cancelSwap', () => current().cancelSwap(userId));
  handle('lobby:forceSwap', ({ seat, fromSeat }) => {
    const user = accounts.getUser(userId);
    if (!user || !accounts.isAdmin(user)) throw new UserError('Only a Dev can force a swap');
    current().forceSwap(userId, seat, fromSeat);
  });
  handle('lobby:addBot', ({ seat }) => current().addBot(userId, seat));
  handle('lobby:removeBot', ({ seat }) => current().removeBot(userId, seat));
  handle('lobby:teams', ({ teams }) => current().setTeams(userId, teams));
  handle('lobby:variant', ({ variant }) => current().setVariant(userId, variant));
  handle('lobby:turnTime', ({ seconds }) => current().setTurnTime(userId, seconds ?? null));
  handle('game:start', () => current().start(userId));
  handle('game:roll', () => current().roll(userId));
  handle('game:move', ({ moveId }) => current().move(userId, moveId));
  handle('game:react', ({ key }) => current().react(userId, key));
  handle('game:chat', ({ text, channel }) => current().chat(userId, text, channel === 'team' ? 'team' : 'all'));
  handle('game:away', ({ away }) => current().stepAway(userId, away === true));
  handle('game:setBoard', ({ item }) => {
    if (!accounts.isAdmin(accounts.getUser(userId) || {})) throw new UserError('Only a Dev can change the table board');
    current().setBoard(userId, typeof item === 'string' ? item : null);
  });
  handle('game:ping', (payload) => current().ping(userId, payload, { admin: accounts.isAdmin(accounts.getUser(userId) || {}) }));
  handle('game:rematch', () => current().rematch(userId));

  socket.on('disconnect', () => leaveCurrent(false));
});

server.listen(PORT, process.env.HOST, () => console.log(`Marralhinha server listening on http://${process.env.HOST || 'localhost'}:${PORT}`));
