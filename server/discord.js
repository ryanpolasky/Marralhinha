const API = 'https://discord.com/api/v10';

const config = () => ({
  clientId: process.env.DISCORD_CLIENT_ID || '',
  clientSecret: process.env.DISCORD_CLIENT_SECRET || '',
  botToken: process.env.DISCORD_BOT_TOKEN || '',
  supporterSkuId: process.env.DISCORD_SUPPORTER_SKU_ID || '',
  halloweenSkuId: process.env.DISCORD_HALLOWEEN_SKU_ID || '',
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
const supporterConfigured = () => skuConfigured(config().supporterSkuId);
const halloweenConfigured = () => skuConfigured(config().halloweenSkuId);

// The Halloween Pack can only be bought during October (UTC); owners keep it forever
const halloweenOpen = (now = Date.now()) => new Date(now).getUTCMonth() === 9;

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

const supporterEntitlement = (discordId) => skuEntitlement(discordId, config().supporterSkuId, 'Supporter');
const halloweenEntitlement = (discordId) => skuEntitlement(discordId, config().halloweenSkuId, 'Halloween');

// Boolean metadata values are sent as '1'/'0'; Discord rejects 'true'/'false' silently
async function updateRoleConnection(accessToken, { username, supporter }) {
  const res = await fetch(`${API}/users/@me/applications/${config().clientId}/role-connection`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ platform_name: 'Marralhinha Online', platform_username: username, metadata: { supporter: supporter ? '1' : '0' } }),
  });
  if (!res.ok) throw new Error(`Role connection update failed (${res.status})`);
}

module.exports = { config, isEnabled, authorizeUrl, exchangeCode, fetchUser, redirectUri, linkedRoleRedirectUri, updateRoleConnection, supporterConfigured, supporterEntitlement, halloweenConfigured, halloweenEntitlement, halloweenOpen, activeEntitlement };
