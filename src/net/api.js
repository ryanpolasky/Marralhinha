import { SERVER_URL } from './config';

const TOKEN_KEY = 'marralhinha:auth';
let token = null;
try {
  token = localStorage.getItem(TOKEN_KEY);
} catch {}

export const getToken = () => token;
export function setToken(next) {
  token = next;
  try {
    if (next) localStorage.setItem(TOKEN_KEY, next);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {}
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export async function api(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(`${SERVER_URL}/api${path}`, {
      method,
      headers: { ...(body && { 'Content-Type': 'application/json' }), ...(token && { Authorization: `Bearer ${token}` }) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError("Can't reach the game server", 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || 'Something went wrong', res.status);
  return data;
}

export const post = (path, body = {}) => api(path, { method: 'POST', body });
export const discordStartUrl = (ticket) => `${SERVER_URL}/api/auth/discord/start?ticket=${encodeURIComponent(ticket)}`;
