import { IS_ACTIVITY } from './config';
import { api, post, setToken, getToken, discordStartUrl, ApiError } from './api';
import { randomNickname } from '../game/fun';

let discordSdk = null;

async function activityLogin() {
  const { clientId } = await api('/config');
  if (!clientId) throw new Error('This server is not configured for Discord Activities yet');
  const { DiscordSDK } = await import('@discord/embedded-app-sdk');
  const sdk = new DiscordSDK(clientId);
  await sdk.ready();
  discordSdk = sdk;
  const { code } = await sdk.commands.authorize({ client_id: clientId, response_type: 'code', state: '', prompt: 'none', scope: ['identify'] });
  const { token, accessToken, profile } = await post('/auth/discord/activity', { code });
  setToken(token);
  await sdk.commands.authenticate({ access_token: accessToken });
  return { profile, instanceId: sdk.instanceId };
}

async function webLogin(preferredName) {
  const params = new URLSearchParams(window.location.search);
  const loginCode = params.get('login');
  const loginError = params.get('login_error');
  if (loginCode || loginError) {
    params.delete('login');
    params.delete('login_error');
    const rest = params.toString();
    window.history.replaceState(null, '', rest ? `?${rest}` : window.location.pathname);
  }
  if (loginCode) {
    const { token, profile } = await post('/auth/redeem', { code: loginCode });
    setToken(token);
    return { profile, notice: 'Logged in with Discord! Your progress is saved to your account.' };
  }
  if (getToken()) {
    try {
      return { profile: (await api('/me')).profile, notice: loginError ? 'Discord login was cancelled.' : null };
    } catch (err) {
      if (!(err instanceof ApiError) || err.status !== 401) throw err;
      setToken(null);
    }
  }
  const { token, profile } = await post('/auth/guest', { name: preferredName || randomNickname() });
  setToken(token);
  return { profile, notice: null };
}

export function bootstrapAuth(preferredName) {
  return IS_ACTIVITY ? activityLogin() : webLogin(preferredName);
}

export async function startDiscordLogin() {
  const { ticket } = await post('/auth/link-ticket');
  window.location.assign(discordStartUrl(ticket));
}

// Discord's sandbox blocks normal new-tab links, so Activities have to ask the SDK
export function openExternal(url) {
  if (discordSdk) discordSdk.commands.openExternalLink({ url }).catch(() => {});
  else window.open(url, '_blank', 'noopener,noreferrer');
}

export async function logout() {
  await post('/auth/logout').catch(() => {});
  setToken(null);
}
