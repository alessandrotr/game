import type { AuthResult } from '@arena/shared';

/**
 * HTTP client for the account auth endpoints. The game server serves these over
 * the same host as the WebSocket endpoint, so we derive the HTTP base by
 * swapping the ws/wss scheme for http/https.
 */
const WS_ENDPOINT = import.meta.env.VITE_SERVER_URL ?? 'ws://localhost:2567';
// ws→http / wss→https, and strip any trailing slash so paths don't double up
// (e.g. a `VITE_SERVER_URL` ending in `/` would produce `…//auth/register`).
export const HTTP_BASE = WS_ENDPOINT.replace(/^ws/, 'http').replace(/\/+$/, '');

async function post(path: string, body: unknown): Promise<AuthResult> {
  const res = await request(path, { method: 'POST', body: JSON.stringify(body) });
  return res;
}

async function request(path: string, init: RequestInit): Promise<AuthResult> {
  let res: Response;
  try {
    res = await fetch(`${HTTP_BASE}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    });
  } catch {
    throw new Error('Cannot reach the server. Is it running?');
  }
  const data = (await res.json().catch(() => ({}))) as Partial<AuthResult> & { error?: string };
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
  return data as AuthResult;
}

export function registerAccount(
  email: string,
  username: string,
  password: string,
): Promise<AuthResult> {
  return post('/auth/register', { email, username, password });
}

export function loginAccount(email: string, password: string): Promise<AuthResult> {
  return post('/auth/login', { email, password });
}

/** Validate a stored token and refresh username + progress (session resume). */
export function fetchMe(token: string): Promise<AuthResult> {
  return request('/auth/me', { method: 'GET', headers: { Authorization: `Bearer ${token}` } });
}
