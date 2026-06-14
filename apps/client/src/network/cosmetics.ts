import { sanitizeState, type CosmeticsState } from '@arena/shared';
import { HTTP_BASE } from './auth';

/**
 * HTTP client for per-account, per-class cosmetics (each character's owned ids +
 * equipped loadout). Same host/scheme and Bearer-token convention as the prefs
 * routes. Errors throw so callers fall back to defaults / retry; responses are
 * re-sanitized client-side so a stale/garbled payload can't corrupt local state.
 */
async function authed(token: string, init: RequestInit): Promise<CosmeticsState> {
  let res: Response;
  try {
    res = await fetch(`${HTTP_BASE}/cosmetics`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(init.headers ?? {}),
      },
    });
  } catch {
    throw new Error('Cannot reach the server.');
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
  return sanitizeState(data);
}

export function fetchCosmetics(token: string): Promise<CosmeticsState> {
  return authed(token, { method: 'GET' });
}

export function putCosmetics(token: string, state: CosmeticsState): Promise<CosmeticsState> {
  return authed(token, { method: 'PUT', body: JSON.stringify(state) });
}
