/**
 * A persistent, anonymous guest-account id for this browser. Generated once and
 * kept in localStorage, then sent on join so the server ties progression to the
 * device — no registration or password (see the auth roadmap; full login later).
 */
const STORAGE_KEY = 'arena.deviceId';

export function getDeviceId(): string {
  try {
    let id = localStorage.getItem(STORAGE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(STORAGE_KEY, id);
    }
    return id;
  } catch {
    // Private mode / storage blocked — a fresh (non-persistent) id per session.
    return crypto.randomUUID();
  }
}
