import { create } from 'zustand';
import type { AuthResult, ClassProgressView } from '@arena/shared';
import {
  decodeToken,
  fetchMe,
  guestLogin,
  loginAccount,
  registerAccount,
  upgradeAccount as upgradeAccountRequest,
} from '../network/auth';
import { setTelemetryUser } from '../network/telemetry';
import { useCosmeticsStore } from './useCosmeticsStore';

/** Seed the cosmetics store from an auth response so the equipped loadout is
 *  available immediately (before connecting to a room). */
function hydrateCosmetics(res: AuthResult): void {
  useCosmeticsStore.getState().hydrate(res.cosmetics);
}

const TOKEN_KEY = 'arena.auth.token';

function loadToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
function saveToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage blocked — token lives only in memory this session */
  }
}

/** Mirror the signed-in account into crash reports (Sentry user + the
 *  self-hosted sink), so a captured error carries the account id + display name.
 *  The account id is decoded from the token; null on sign-out clears it. */
function tagTelemetryUser(token: string, username: string): void {
  setTelemetryUser({ accountId: decodeToken(token)?.pid, username });
}

/**
 * `restoring` — validating a saved token on boot (show a splash, not the form).
 * `idle` — not signed in (show the auth screen). `authed` — signed in.
 */
export type AuthStatus = 'restoring' | 'idle' | 'authed';

interface AuthStore {
  status: AuthStatus;
  token: string | null;
  username: string | null;
  /** True while signed in as a guest (drives the in-game "save progress" CTA). */
  guest: boolean;
  /** Per-class progression for the signed-in account (drives char-select levels). */
  progress: ClassProgressView[];
  /** Async-in-flight flag for the auth form (login/register button). */
  busy: boolean;
  error: string | null;

  restore: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, username: string, password: string) => Promise<void>;
  /** Start a guest session (temporary account, progress saved on first match). */
  signInAsGuest: () => Promise<void>;
  /** Convert the current guest session into a full account, keeping progress.
   *  Resolves on success and rejects on failure (so the form can stay open). */
  upgradeAccount: (email: string, username: string, password: string) => Promise<void>;
  signOut: () => void;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  status: 'restoring',
  token: null,
  username: null,
  guest: false,
  progress: [],
  busy: false,
  error: null,

  restore: async () => {
    const token = loadToken();
    if (!token) {
      set({ status: 'idle' });
      return;
    }
    try {
      const me = await fetchMe(token);
      saveToken(me.token);
      tagTelemetryUser(me.token, me.username);
      hydrateCosmetics(me);
      set({
        status: 'authed',
        token: me.token,
        username: me.username,
        guest: me.guest ?? false,
        progress: me.progress,
      });
    } catch {
      // Token invalid/expired or server unreachable — fall back to the form.
      saveToken(null);
      setTelemetryUser(null);
      set({ status: 'idle', token: null, username: null, guest: false, progress: [] });
    }
  },

  signIn: async (email, password) => {
    set({ busy: true, error: null });
    try {
      const res = await loginAccount(email, password);
      saveToken(res.token);
      tagTelemetryUser(res.token, res.username);
      hydrateCosmetics(res);
      set({
        status: 'authed',
        token: res.token,
        username: res.username,
        guest: false,
        progress: res.progress,
        busy: false,
      });
    } catch (err) {
      set({ busy: false, error: err instanceof Error ? err.message : 'Sign in failed.' });
    }
  },

  signUp: async (email, username, password) => {
    set({ busy: true, error: null });
    try {
      const res = await registerAccount(email, username, password);
      saveToken(res.token);
      tagTelemetryUser(res.token, res.username);
      hydrateCosmetics(res);
      set({
        status: 'authed',
        token: res.token,
        username: res.username,
        guest: false,
        progress: res.progress,
        busy: false,
      });
    } catch (err) {
      set({ busy: false, error: err instanceof Error ? err.message : 'Registration failed.' });
    }
  },

  signInAsGuest: async () => {
    set({ busy: true, error: null });
    try {
      const res = await guestLogin();
      saveToken(res.token);
      tagTelemetryUser(res.token, res.username);
      hydrateCosmetics(res);
      set({
        status: 'authed',
        token: res.token,
        username: res.username,
        guest: res.guest ?? true,
        progress: res.progress,
        busy: false,
      });
    } catch (err) {
      set({ busy: false, error: err instanceof Error ? err.message : 'Could not start a guest session.' });
    }
  },

  upgradeAccount: async (email, username, password) => {
    const token = get().token;
    if (!token) throw new Error('Not signed in.');
    set({ busy: true, error: null });
    try {
      const res = await upgradeAccountRequest(token, email, username, password);
      saveToken(res.token);
      tagTelemetryUser(res.token, res.username);
      hydrateCosmetics(res);
      set({
        status: 'authed',
        token: res.token,
        username: res.username,
        guest: false,
        progress: res.progress,
        busy: false,
      });
    } catch (err) {
      set({ busy: false, error: err instanceof Error ? err.message : 'Could not create your account.' });
      throw err; // let the dialog keep itself open on failure
    }
  },

  signOut: () => {
    saveToken(null);
    setTelemetryUser(null);
    set({ status: 'idle', token: null, username: null, guest: false, progress: [], error: null });
  },
}));
