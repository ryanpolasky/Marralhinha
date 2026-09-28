const API = 'https://discord.com/api/v10';

const config = () => ({
  clientId: process.env.DISCORD_CLIENT_ID || '',
  clientSecret: process.env.DISCORD_CLIENT_SECRET || '',
  publicUrl: (process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3001}`).replace(/\/$/, ''),
  clientUrl: (process.env.CLIENT_URL || process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3001}`).replace(/\/$/, ''),
});

const isEnabled = () => {
  const { clientId, clientSecret } = config();
  return Boolean(clientId && clientSecret);
};

const redirectUri = () => `${config().publicUrl}/api/auth/discord/callback`;

function authorizeUrl(state) {
  const params = new URLSearchParams({
    client_id: config().clientId,
    response_type: 'code',
    redirect_uri: redirectUri(),
    scope: 'identify',
    state,
    prompt: 'none',
  });
  return `https://discord.com/oauth2/authorize?${params}`;
}

// Activity codes are exchanged without a redirect_uri, website ones need it
async function exchangeCode(code, { withRedirect }) {
  const { clientId, clientSecret } = config();
  const body = new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'authorization_code', code: String(code) });
  if (withRedirect) body.set('redirect_uri', redirectUri());
  const res = await fetch(`${API}/oauth2/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  if (!res.ok) throw new Error(`Discord token exchange failed (${res.status})`);
  return res.json();
}

async function fetchUser(accessToken) {
  const res = await fetch(`${API}/users/@me`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Discord user lookup failed (${res.status})`);
  return res.json();
}

module.exports = { config, isEnabled, authorizeUrl, exchangeCode, fetchUser };
