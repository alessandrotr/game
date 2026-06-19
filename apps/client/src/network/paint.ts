import { sanitizePaint, type PaintState } from '@arena/shared';
import { HTTP_BASE } from './auth';

/**
 * HTTP client for per-account character paint (per class: skin colors + painted
 * overlay PNGs). Self GET/PUT use the Bearer-token convention like /cosmetics;
 * `fetchPublicPaint` reads another player's paint by account id (public) so peers
 * can display it. Responses are re-sanitized so a garbled payload can't corrupt
 * local state. Errors throw so callers fall back to defaults.
 */
async function authed(token: string, init: RequestInit): Promise<PaintState> {
  let res: Response;
  try {
    res = await fetch(`${HTTP_BASE}/paint`, {
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
  return sanitizePaint(data);
}

export function fetchPaint(token: string): Promise<PaintState> {
  return authed(token, { method: 'GET' });
}

export function putPaint(token: string, state: PaintState): Promise<PaintState> {
  return authed(token, { method: 'PUT', body: JSON.stringify(state) });
}

/** Another player's paint, by account id (public read; '{}' on any failure). */
export async function fetchPublicPaint(pid: number): Promise<PaintState> {
  try {
    const res = await fetch(`${HTTP_BASE}/paint/${pid}`);
    if (!res.ok) return {};
    return sanitizePaint(await res.json());
  } catch {
    return {};
  }
}
