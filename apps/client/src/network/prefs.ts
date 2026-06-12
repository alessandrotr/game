import { DEFAULT_CAMERA_PREFS, type CameraPrefs } from '@arena/shared';
import { HTTP_BASE } from './auth';

/**
 * HTTP client for per-account preferences. Same host/scheme as the auth routes;
 * the token is sent as a Bearer header. Errors throw so callers can fall back to
 * defaults / retry.
 */
async function authed(path: string, token: string, init: RequestInit): Promise<CameraPrefs> {
  let res: Response;
  try {
    res = await fetch(`${HTTP_BASE}${path}`, {
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
  const data = (await res.json().catch(() => ({}))) as Partial<CameraPrefs> & { error?: string };
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
  return { ...DEFAULT_CAMERA_PREFS, ...data };
}

export function fetchCameraPrefs(token: string): Promise<CameraPrefs> {
  return authed('/prefs/camera', token, { method: 'GET' });
}

export function putCameraPrefs(token: string, prefs: CameraPrefs): Promise<CameraPrefs> {
  return authed('/prefs/camera', token, { method: 'PUT', body: JSON.stringify(prefs) });
}
