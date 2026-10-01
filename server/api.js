const express = require('express');
const { randomBytes } = require('crypto');
const discord = require('./discord');
const { AccountError } = require('./accounts');
const { EconomyError } = require('./economy');
const { ReportError } = require('./reports');
const { TAG_KEYS, ADMIN_TAGS } = require('./catalog');

class ApiError extends Error {}

const GUEST_LIMIT_PER_HOUR = 30;
const randomKey = () => randomBytes(24).toString('base64url');

function createApi({ accounts, economy, rooms, reports, matches, onProfileChange, syncPurchases, isAllowedOrigin }) {
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
      const expected = err instanceof ApiError || err instanceof AccountError || err instanceof EconomyError || err instanceof ReportError;
      if (!expected) console.error(`[api ${req.path}]`, err);
      res.status(expected ? 400 : 500).json({ error: expected ? err.message : 'Something went wrong' });
    }
  };

  const profileOf = (userId) => {
    const user = accounts.getUser(userId);
    return accounts.profile(user, { daily: economy.dailyStatus(user), replies: reports ? reports.pendingReplies(userId) : [] });
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
      const tokens = await discord.exchangeCode(req.query.code, { redirect: discord.redirectUri() });
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

  // Linked Roles verification: Discord sends users here from a role's Links settings
  router.get('/auth/discord/linked-role/start', (req, res) => {
    if (!discord.isEnabled() || !discord.supporterConfigured()) return res.status(404).send('Not configured');
    const state = randomKey();
    put(`state:${state}`, { linkedRole: true }, 10 * 60 * 1000);
    return res.redirect(discord.authorizeUrl(state, { scope: 'identify role_connections.write', redirect: discord.linkedRoleRedirectUri() }));
  });

  router.get('/auth/discord/linked-role/callback', async (req, res) => {
    const done = (message) => res.send(`<!doctype html><title>Marralhinha Online</title><body style="font-family:sans-serif;background:#1e1f22;color:#fff;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0"><div style="text-align:center"><h1 style="margin:0 0 8px">Marralhinha Online</h1><p>${message}</p><p style="opacity:.6">You can close this tab.</p></div>`);
    try {
      const state = take(`state:${req.query.state}`);
      if (!state?.linkedRole || !req.query.code) return done('Verification was cancelled.');
      const tokens = await discord.exchangeCode(req.query.code, { redirect: discord.linkedRoleRedirectUri() });
      const me = await discord.fetchUser(tokens.access_token);
      const entitlementId = await discord.supporterEntitlement(me.id);
      await discord.updateRoleConnection(tokens.access_token, { username: me.global_name || me.username, supporter: Boolean(entitlementId) });
      const user = accounts.q.userByDiscord.get(me.id);
      if (user && accounts.setSupporter(user.id, entitlementId)) onProfileChange(user.id);
      return done(entitlementId ? 'Supporter Pack verified. Your Discord role is ready to claim.' : 'Verified. No Supporter Pack found on this account yet.');
    } catch (err) {
      console.error('[linked role]', err);
      return done('Something went wrong, please try again.');
    }
  });

  router.post(
    '/auth/redeem',
    handle(async (req) => {
      const token = take(`login:${req.body?.code}`);
      const user = token && accounts.userForToken(token);
      if (!user) throw new ApiError('That login link expired, please try again');
      try { await syncPurchases(user.id); } catch (err) { console.error('[purchases]', err); }
      return { token, profile: profileOf(user.id) };
    })
  );

  router.post(
    '/auth/discord/activity',
    handle(async (req) => {
      if (!discord.isEnabled()) throw new ApiError('Discord is not configured on this server');
      if (!req.body?.code) throw new ApiError('Missing authorization code');
      const tokens = await discord.exchangeCode(req.body.code);
      const user = accounts.loginDiscord(await discord.fetchUser(tokens.access_token));
      try { await syncPurchases(user.id); } catch (err) { console.error('[purchases]', err); }
      return { token: accounts.createSession(user.id), accessToken: tokens.access_token, profile: profileOf(user.id) };
    })
  );

  router.get('/me', auth, handle(async (req) => {
    try { await syncPurchases(req.user.id); } catch (err) { console.error('[purchases]', err); }
    return { profile: profileOf(req.user.id) };
  }));

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
    handle(async (req) => {
      if (/\.(supporter|halloween)$/.test(String(req.body?.item))) await syncPurchases(req.user.id);
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

  router.get('/shop', auth, handle(() => {
    const { clientId, supporterSkuId, halloweenSkuId } = discord.config();
    return {
      ...economy.shop(),
      supporter: discord.supporterConfigured() ? { skuId: supporterSkuId, clientId } : null,
      halloween: { open: discord.halloweenOpen(), ...(discord.halloweenConfigured() ? { skuId: halloweenSkuId, clientId } : {}) },
    };
  }));

  router.post('/shop/supporter/refresh', auth, handle(async (req) => {
    if (!discord.supporterConfigured()) throw new ApiError('Supporter checkout is not available yet');
    if (!req.user.discord_id) throw new ApiError('Link a Discord account to support the game');
    await syncPurchases(req.user.id);
    return { profile: profileOf(req.user.id) };
  }));

  router.post('/shop/halloween/refresh', auth, handle(async (req) => {
    if (!discord.halloweenConfigured()) throw new ApiError('Halloween checkout is not available yet');
    if (!req.user.discord_id) throw new ApiError('Link a Discord account to get the Halloween Pack');
    await syncPurchases(req.user.id);
    return { profile: profileOf(req.user.id) };
  }));

  // Bug reports & feature ideas: players file them, devs answer with a note and maybe a gift
  router.post(
    '/reports',
    auth,
    handle((req) => ({ report: reports.file(req.user.id, req.body?.kind, req.body?.text) }))
  );

  router.get('/reports', auth, handle((req) => ({ reports: reports.mine(req.user.id) })));

  // "Seen it" for replies with no gift attached
  router.post(
    '/reports/:id/seen',
    auth,
    handle((req) => {
      reports.dismiss(req.params.id, req.user.id);
    })
  );

  router.post(
    '/reports/:id/claim',
    auth,
    handle((req) => {
      const report = reports.get(req.params.id);
      const gift = reports.takeGift(req.params.id, req.user.id);
      let result = null;
      if (gift?.type === 'coins') economy.credit(req.user.id, gift.amount, `report:${report.id}`);
      else if (gift?.type === 'box') result = economy.grantBox(req.user.id, gift.box);
      else if (gift?.type === 'item') {
        accounts.grantItem(req.user.id, gift.item);
        result = { item: gift.item };
      }
      return { gift, result, profile: changed(req.user.id) };
    })
  );

  router.get('/leaderboard', auth, handle(() => ({ boards: matches.leaders() })));

  // Another player's public card + recent games, for the in-game and end-screen peeks
  router.get(
    '/players/:id',
    auth,
    handle((req) => {
      const user = accounts.getUser(String(req.params.id || ''));
      if (!user) throw new ApiError('Player not found');
      return { player: accounts.publicCard(user), matches: matches.history(user.id, 20) };
    })
  );

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
    handle((req) => {
      const users = accounts.search(req.query.q, 40, { guests: req.query.guests === '1' }).map((u) => accounts.adminView(u));
      const { total, throwaway } = accounts.userCount();
      return { users, total, throwaway };
    })
  );

  router.get(
    '/admin/rooms',
    auth,
    admin,
    handle(() => ({ rooms: rooms ? rooms.list() : [] }))
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

  router.get(
    '/admin/reports',
    auth,
    admin,
    handle((req) => ({ reports: reports.list({ includeResolved: req.query.all === '1' }) }))
  );

  router.post(
    '/admin/reports/:id/resolve',
    auth,
    admin,
    handle((req) => ({ report: reports.resolve(req.params.id, req.body?.response, req.body?.gift) }))
  );

  router.post(
    '/admin/reports/:id/reopen',
    auth,
    admin,
    handle((req) => ({ report: reports.reopen(req.params.id) }))
  );

  router.use((req, res) => res.status(404).json({ error: 'Not found' }));
  return router;
}

module.exports = { createApi };
