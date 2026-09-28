const express = require('express');
const { randomBytes } = require('crypto');
const discord = require('./discord');
const { AccountError } = require('./accounts');
const { EconomyError } = require('./economy');
const { TAG_KEYS, ADMIN_TAGS } = require('./catalog');

class ApiError extends Error {}

const GUEST_LIMIT_PER_HOUR = 30;
const randomKey = () => randomBytes(24).toString('base64url');

function createApi({ accounts, economy, onProfileChange, isAllowedOrigin }) {
  const router = express.Router();
  router.use(express.json({ limit: '10kb' }));

  router.use((req, res, next) => {
    const origin = req.get('origin');
    if (origin && isAllowedOrigin(origin)) {
      res.set({ 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST', Vary: 'Origin' });
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    return next();
  });

  const pending = new Map();
  const put = (key, value, ttlMs) => pending.set(key, { value, exp: Date.now() + ttlMs });
  const take = (key) => {
    const entry = pending.get(key);
    pending.delete(key);
    return entry && entry.exp > Date.now() ? entry.value : null;
  };
  const guestHits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of pending) if (entry.exp < now) pending.delete(key);
    guestHits.clear();
  }, 60 * 60 * 1000).unref();

  const auth = (req, res, next) => {
    const token = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const user = accounts.userForToken(token);
    if (!user) return res.status(401).json({ error: 'Not signed in' });
    req.user = user;
    req.token = token;
    return next();
  };

  const handle = (fn) => async (req, res) => {
    try {
      res.json((await fn(req, res)) ?? { ok: true });
    } catch (err) {
      const expected = err instanceof ApiError || err instanceof AccountError || err instanceof EconomyError;
      if (!expected) console.error(`[api ${req.path}]`, err);
      res.status(expected ? 400 : 500).json({ error: expected ? err.message : 'Something went wrong' });
    }
  };

  const profileOf = (userId) => {
    const user = accounts.getUser(userId);
    return accounts.profile(user, { daily: economy.dailyStatus(user) });
  };
  const changed = (userId) => {
    onProfileChange(userId);
    return profileOf(userId);
  };

  router.get('/config', (req, res) => res.json({ discord: discord.isEnabled(), clientId: discord.config().clientId || null }));

  router.post(
    '/auth/guest',
    handle((req) => {
      const hits = (guestHits.get(req.ip) || 0) + 1;
      guestHits.set(req.ip, hits);
      if (hits > GUEST_LIMIT_PER_HOUR) throw new ApiError('Too many new accounts from this network, try again later');
      const user = accounts.createUser({ name: req.body?.name || 'Player' });
      return { token: accounts.createSession(user.id), profile: profileOf(user.id) };
    })
  );

  router.post(
    '/auth/logout',
    auth,
    handle((req) => {
      accounts.deleteSession(req.token);
    })
  );

  // The browser leaves the page for Discord, so pass a one-time ticket instead of the session token
  router.post(
    '/auth/link-ticket',
    auth,
    handle((req) => {
      if (!discord.isEnabled()) throw new ApiError('Discord login is not set up on this server yet');
      const ticket = randomKey();
      put(`ticket:${ticket}`, req.user.id, 5 * 60 * 1000);
      return { ticket };
    })
  );

  router.get('/auth/discord/start', (req, res) => {
    if (!discord.isEnabled()) return res.status(404).send('Discord login is not configured');
    const guestId = req.query.ticket ? take(`ticket:${req.query.ticket}`) : null;
    const state = randomKey();
    put(`state:${state}`, { guestId }, 10 * 60 * 1000);
    return res.redirect(discord.authorizeUrl(state));
  });

  router.get('/auth/discord/callback', async (req, res) => {
    const back = (query) => res.redirect(`${discord.config().clientUrl}/?${query}`);
    try {
      const state = take(`state:${req.query.state}`);
      if (!state || !req.query.code) return back('login_error=cancelled');
      const tokens = await discord.exchangeCode(req.query.code, { withRedirect: true });
      const user = accounts.loginDiscord(await discord.fetchUser(tokens.access_token), state.guestId);
      const code = randomKey();
      put(`login:${code}`, accounts.createSession(user.id), 2 * 60 * 1000);
      onProfileChange(user.id);
      return back(`login=${code}`);
    } catch (err) {
      console.error('[discord callback]', err);
      return back('login_error=failed');
    }
  });

  router.post(
    '/auth/redeem',
    handle((req) => {
      const token = take(`login:${req.body?.code}`);
      const user = token && accounts.userForToken(token);
      if (!user) throw new ApiError('That login link expired, please try again');
      return { token, profile: profileOf(user.id) };
    })
  );

  router.post(
    '/auth/discord/activity',
    handle(async (req) => {
      if (!discord.isEnabled()) throw new ApiError('Discord is not configured on this server');
      if (!req.body?.code) throw new ApiError('Missing authorization code');
      const tokens = await discord.exchangeCode(req.body.code, { withRedirect: false });
      const user = accounts.loginDiscord(await discord.fetchUser(tokens.access_token));
      return { token: accounts.createSession(user.id), accessToken: tokens.access_token, profile: profileOf(user.id) };
    })
  );

  router.get('/me', auth, handle((req) => ({ profile: profileOf(req.user.id) })));

  router.post(
    '/me/name',
    auth,
    handle((req) => {
      accounts.rename(req.user.id, req.body?.name);
      return { profile: changed(req.user.id) };
    })
  );

  router.post(
    '/me/equip',
    auth,
    handle((req) => {
      accounts.equip(req.user.id, req.body?.slot, req.body?.item);
      return { profile: changed(req.user.id) };
    })
  );

  router.post(
    '/daily',
    auth,
    handle((req) => {
      const result = economy.claimDaily(req.user.id);
      return { ...result, profile: changed(req.user.id) };
    })
  );

  router.get('/shop', auth, handle(() => economy.shop()));

  router.post(
    '/shop/open',
    auth,
    handle((req) => {
      const result = economy.openBox(req.user.id, req.body?.box);
      return { result, profile: changed(req.user.id) };
    })
  );

  router.post(
    '/shop/buy',
    auth,
    handle((req) => {
      economy.buyFeatured(req.user.id, req.body?.item);
      return { profile: changed(req.user.id) };
    })
  );

  // Admin: only accounts holding an admin tag (Dev) get past this
  const admin = (req, res, next) => {
    if (!accounts.isAdmin(req.user)) return res.status(403).json({ error: 'Admins only' });
    return next();
  };
  const target = (req) => accounts.requireUser(String(req.params.id || ''));
  const adminResult = (user, extra = {}) => {
    onProfileChange(user.id);
    return { user: accounts.adminView(accounts.getUser(user.id)), ...extra };
  };

  router.get(
    '/admin/users',
    auth,
    admin,
    handle((req) => ({ users: accounts.search(req.query.q).map((u) => accounts.adminView(u)), total: accounts.userCount() }))
  );

  router.post(
    '/admin/users/:id/tags',
    auth,
    admin,
    handle((req) => {
      const user = target(req);
      const tags = Array.isArray(req.body?.tags) ? req.body.tags.filter((t) => TAG_KEYS.includes(t)) : null;
      if (!tags) throw new ApiError('Send a list of tags');
      if (user.id === req.user.id && !tags.some((t) => ADMIN_TAGS.includes(t))) throw new ApiError("You can't remove your own admin tag");
      accounts.setTags(user.id, tags);
      return adminResult(user);
    })
  );

  router.post(
    '/admin/users/:id/coins',
    auth,
    admin,
    handle((req) => {
      const user = target(req);
      accounts.grantCoins(user.id, req.body?.delta, `admin:${req.user.id}`);
      return adminResult(user);
    })
  );

  router.post(
    '/admin/users/:id/items',
    auth,
    admin,
    handle((req) => {
      const user = target(req);
      accounts.grantItem(user.id, String(req.body?.item || ''));
      return adminResult(user);
    })
  );

  router.post(
    '/admin/users/:id/name',
    auth,
    admin,
    handle((req) => {
      const user = target(req);
      accounts.rename(user.id, req.body?.name);
      return adminResult(user);
    })
  );

  router.use((req, res) => res.status(404).json({ error: 'Not found' }));
  return router;
}

module.exports = { createApi };
