const fs = require('fs');
const http = require('http');
const path = require('path');
const express = require('express');
const { Server } = require('socket.io');
const { openDb } = require('./db');
const { Accounts } = require('./accounts');
const { Economy } = require('./economy');
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

const app = express();
app.set('trust proxy', 1);
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: (origin, cb) => cb(null, !origin || isAllowedOrigin(origin)) },
});

const pushProfile = (userId) => {
  const user = accounts.getUser(userId);
  if (!user) return;
  io.to(`user:${userId}`).emit('account:update', accounts.profile(user, { daily: economy.dailyStatus(user) }));
  rooms.roomsWithUser(userId).forEach((room) => room.updateUser(accounts.publicInfo(user)));
};

const rooms = new RoomManager({
  onChange: (room) => io.to(room.code).emit('room:state', room.view()),
  onReaction: (room, reaction) => io.to(room.code).emit('room:reaction', reaction),
  onGameOver: (room, { players, botGame }) => {
    try {
      const luckyBefore = accounts.luckyHolder();
      const rewards = economy.awardGame({ game: room.game, players, botGame });
      const touched = new Set(players.map((p) => p.userId));
      if (luckyBefore && luckyBefore !== accounts.luckyHolder()) touched.add(luckyBefore);
      setTimeout(() => touched.forEach((userId) => pushProfile(userId)), 0);
      return rewards;
    } catch (err) {
      console.error('[rewards]', err);
      return {};
    }
  },
});
setInterval(() => rooms.sweep(), 60 * 1000).unref();

app.get('/health', (req, res) => res.json({ ok: true, rooms: rooms.rooms.size }));
app.use('/api', createApi({ accounts, economy, rooms, onProfileChange: pushProfile, isAllowedOrigin }));
legalRoutes(app);

if (fs.existsSync(BUILD_DIR)) {
  app.use(express.static(BUILD_DIR));
  app.get('*', (req, res) => res.sendFile(path.join(BUILD_DIR, 'index.html')));
}

io.use((socket, next) => {
  const user = accounts.userForToken(socket.handshake.auth?.token);
  if (!user) return next(new Error('unauthorized'));
  socket.data.userId = user.id;
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
    const player = room.join(accounts.publicInfo(user), options);
    leaveOthers(room.code);
    if (socket.data.code && socket.data.code !== room.code) leaveCurrent(false);
    socket.data.code = room.code;
    socket.join(room.code);
    room.attach(userId, socket.id);
    return { code: room.code, playerId: player.id };
  };

  handle('room:create', () => enter(() => rooms.create()));
  // One round trip for "Quick play vs bots", so a flaky connection can't leave a half-filled lobby behind
  handle('room:quickPlay', () => {
    const res = enter(() => rooms.create());
    const room = rooms.get(res.code);
    [0, 1, 2, 3].filter((seat) => !room.seats[seat]).forEach((seat) => room.addBot(userId, seat));
    room.start(userId);
    return res;
  });
  handle('room:join', ({ code, spectate }) => enter(rooms.get(code), { spectate: spectate === true }));
  handle('room:joinInstance', ({ instanceId }) => enter(rooms.forInstance(instanceId)));
  // Lets a second device pick up wherever this account is seated (live games first)
  handle('room:current', () => {
    const seated = rooms.roomsWithUser(userId).filter((room) => room.findByUser(userId));
    const room = seated.find((r) => r.inLiveGame(userId)) || seated[0];
    return { code: room?.code || null };
  });
  handle('room:leave', () => leaveCurrent(true));
  handle('lobby:seat', ({ seat }) => current().setSeat(userId, seat));
  handle('lobby:offerSwap', ({ seat }) => current().offerSwap(userId, seat));
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
  handle('lobby:turnTime', ({ seconds }) => current().setTurnTime(userId, seconds ?? null));
  handle('game:start', () => current().start(userId));
  handle('game:roll', () => current().roll(userId));
  handle('game:move', ({ moveId }) => current().move(userId, moveId));
  handle('game:react', ({ key }) => current().react(userId, key));
  handle('game:chat', ({ text }) => current().chat(userId, text));
  handle('game:rematch', () => current().rematch(userId));

  socket.on('disconnect', () => leaveCurrent(false));
});

server.listen(PORT, process.env.HOST, () => console.log(`Marralhinha server listening on http://${process.env.HOST || 'localhost'}:${PORT}`));
