const catalog = require('../src/shared/cosmetics.json');
const { inSeason } = require('../src/shared/seasons');
const API = 'https://discord.com/api/v10';

const config = () => ({
  clientId: process.env.DISCORD_CLIENT_ID || '',
  clientSecret: process.env.DISCORD_CLIENT_SECRET || '',
  botToken: process.env.DISCORD_BOT_TOKEN || '',
  supporterSkuId: process.env.DISCORD_SUPPORTER_SKU_ID || '',
  halloweenSkuId: process.env.DISCORD_HALLOWEEN_SKU_ID || '',
  painterSkuId: process.env.DISCORD_PAINTER_SKU_ID || '',
  guildId: process.env.DISCORD_GUILD_ID || '',
  luckiestWebhookUrl: process.env.DISCORD_LUCKIEST_WEBHOOK_URL || '',
  publicUrl: (process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3001}`).replace(/\/$/, ''),
  clientUrl: (process.env.CLIENT_URL || process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3001}`).replace(/\/$/, ''),
});

const isEnabled = () => {
  const { clientId, clientSecret } = config();
  return Boolean(clientId && clientSecret);
};

const redirectUri = () => `${config().publicUrl}/api/auth/discord/callback`;
const linkedRoleRedirectUri = () => `${config().publicUrl}/api/auth/discord/linked-role/callback`;

function authorizeUrl(state, { scope = 'identify', redirect = redirectUri() } = {}) {
  const params = new URLSearchParams({
    client_id: config().clientId,
    response_type: 'code',
    redirect_uri: redirect,
    scope,
    state,
    prompt: 'none',
  });
  return `https://discord.com/oauth2/authorize?${params}`;
}

// Activity codes are exchanged without a redirect_uri, browser flows need the one they started with
async function exchangeCode(code, { redirect = null } = {}) {
  const { clientId, clientSecret } = config();
  const body = new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'authorization_code', code: String(code) });
  if (redirect) body.set('redirect_uri', redirect);
  const res = await fetch(`${API}/oauth2/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  if (!res.ok) throw new Error(`Discord token exchange failed (${res.status})`);
  return res.json();
}

async function fetchUser(accessToken) {
  const res = await fetch(`${API}/users/@me`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Discord user lookup failed (${res.status})`);
  return res.json();
}

const skuConfigured = (skuId) => {
  const { clientId, botToken } = config();
  return Boolean(/^\d{17,20}$/.test(clientId) && botToken && /^\d{17,20}$/.test(skuId));
};
// Seasonal packs are only sold inside their tag's season; owners keep them forever
const packOpen = (kind, now = Date.now()) => inSeason(catalog.tags[kind]?.season, now);

const PACKS = {
  supporter: { sku: 'supporterSkuId', name: 'Supporter', checkoutName: 'Supporter', linkPrompt: 'to support the game' },
  halloween: { sku: 'halloweenSkuId', name: 'Halloween', checkoutName: 'Halloween', linkPrompt: 'to get the Halloween Pack' },
  painter: { sku: 'painterSkuId', name: 'Painter', checkoutName: 'Painter Pack', linkPrompt: 'to get the Painter Pack' },
};

const packConfigured = (kind) => {
  const pack = PACKS[kind];
  return !!pack && skuConfigured(config()[pack.sku]);
};

const activeEntitlement = (entitlement, discordId, now = Date.now(), skuId = config().supporterSkuId) =>
  entitlement.application_id === config().clientId && entitlement.sku_id === skuId &&
  entitlement.user_id === discordId && !entitlement.deleted && !entitlement.consumed &&
  (!entitlement.starts_at || Date.parse(entitlement.starts_at) <= now) &&
  (!entitlement.ends_at || Date.parse(entitlement.ends_at) > now);

async function skuEntitlement(discordId, skuId, name) {
  if (!skuConfigured(skuId)) throw new Error(`${name} SKU is not configured`);
  const { clientId, botToken } = config();
  const url = new URL(`${API}/applications/${clientId}/entitlements`);
  url.searchParams.set('user_id', discordId);
  url.searchParams.set('sku_ids', skuId);
  url.searchParams.set('limit', '100');
  let after;
  do {
    if (after) url.searchParams.set('after', after);
    const res = await fetch(url, { headers: { Authorization: `Bot ${botToken}` } });
    if (!res.ok) throw new Error(`Discord entitlement lookup failed (${res.status})`);
    const entitlements = await res.json();
    if (!Array.isArray(entitlements)) throw new Error('Invalid Discord entitlement response');
    const current = entitlements.find((entry) => activeEntitlement(entry, discordId, Date.now(), skuId));
    if (current) return current.id;
    after = entitlements.length === 100 ? entitlements.at(-1).id : null;
  } while (after);
  return null;
}

const packEntitlement = (kind, discordId) => {
  const pack = PACKS[kind];
  if (!pack) throw new Error('Unknown pack');
  return skuEntitlement(discordId, config()[pack.sku], pack.name);
};
const supporterConfigured = () => packConfigured('supporter');
const supporterEntitlement = (discordId) => packEntitlement('supporter', discordId);
const halloweenConfigured = () => packConfigured('halloween');
const halloweenEntitlement = (discordId) => packEntitlement('halloween', discordId);

// Boolean metadata values are sent as '1'/'0'; Discord rejects 'true'/'false' silently
async function updateRoleConnection(accessToken, { username, supporter }) {
  const res = await fetch(`${API}/users/@me/applications/${config().clientId}/role-connection`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ platform_name: 'Marralhinha Online', platform_username: username, metadata: { supporter: supporter ? '1' : '0' } }),
  });
  if (!res.ok) throw new Error(`Role connection update failed (${res.status})`);
}

async function isGuildMember(discordId) {
  const { botToken, guildId } = config();
  if (!botToken || !/^\d{17,20}$/.test(guildId) || !/^\d{17,20}$/.test(discordId || '')) return false;
  const res = await fetch(`${API}/guilds/${guildId}/members/${discordId}`, { headers: { Authorization: `Bot ${botToken}` } });
  if (res.status === 404) return false;
  if (!res.ok) throw new Error(`Discord member lookup failed (${res.status})`);
  return true;
}

const escapeMarkdown = (text) => String(text).replace(/([\\*_~`|])/g, '\\$1');

async function announceLuckiest({ name, discordId, monthName, rolls, sixes }) {
  const { luckiestWebhookUrl, clientUrl } = config();
  if (!luckiestWebhookUrl) return false;
  const ping = await isGuildMember(discordId).catch((err) => {
    console.error('[luckiest shoutout]', err);
    return false;
  });
  const who = ping ? `${escapeMarkdown(name)} (<@${discordId}>)` : escapeMarkdown(name);
  const text = (content) => ({ type: 10, content });
  const url = new URL(luckiestWebhookUrl);
  url.searchParams.set('with_components', 'true');
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'Marralhinha',
      avatar_url: `${clientUrl}/logo512.png`,
      flags: 1 << 15,
      components: [{
        type: 17,
        accent_color: 0xffd166,
        components: [
          text('-# MARRALHINHA · MONTHLY LUCKIEST'),
          text(`# The Luckiest player of ${monthName} is ${who}!`),
          text(`**${sixes} sixes** in **${rolls} rolls** for a **${((sixes / rolls) * 100).toFixed(1)}%** six rate in one game.`),
          { type: 12, items: [{ media: { url: `${clientUrl}/og-image.jpg` } }] },
          { type: 14, divider: true, spacing: 2 },
          {
            type: 9,
            components: [text('**Congratulations!** Your Luckiest reward is waiting.\n-# Log in on the site or launch the Activity to claim it.')],
            accessory: { type: 2, style: 5, label: 'Claim reward', url: clientUrl },
          },
        ],
      }],
      allowed_mentions: ping ? { parse: [], users: [discordId] } : { parse: [] },
    }),
  });
  if (!res.ok) throw new Error(`Luckiest shoutout failed (${res.status})`);
  return true;
}

const playingPresence = (n) => ({ status: 'online', since: null, afk: false, activities: [{ name: 'Custom Status', type: 4, state: `${n} playing now · ${new URL(config().clientUrl).host}` }] });

// Holding a Gateway connection is the only way a bot shows online; intents 0 means Discord sends it no events
function connectGateway(playing = () => 0) {
  const { botToken } = config();
  if (!botToken) return null;
  const { WebSocketManager, WebSocketShardEvents } = require('@discordjs/ws');
  const { REST } = require('@discordjs/rest');
  const manager = new WebSocketManager({
    token: botToken,
    intents: 0,
    rest: new REST().setToken(botToken),
    initialPresence: playingPresence(playing()),
  });
  let shown = null;
  const refresh = () => {
    const n = playing();
    if (n === shown) return;
    shown = n;
    manager.send(0, { op: 3, d: playingPresence(n) }).catch((err) => console.error('[discord gateway]', err));
  };
  manager.on(WebSocketShardEvents.Ready, () => { shown = null; refresh(); });
  manager.on(WebSocketShardEvents.Error, ({ error }) => console.error('[discord gateway]', error));
  manager.connect().catch((err) => console.error('[discord gateway]', err));
  setInterval(refresh, 60_000).unref();
  return manager;
}

module.exports = { PACKS, config, isEnabled, authorizeUrl, exchangeCode, fetchUser, redirectUri, linkedRoleRedirectUri, updateRoleConnection, packConfigured, packEntitlement, supporterConfigured, supporterEntitlement, halloweenConfigured, halloweenEntitlement, packOpen, activeEntitlement, isGuildMember, announceLuckiest, connectGateway };
