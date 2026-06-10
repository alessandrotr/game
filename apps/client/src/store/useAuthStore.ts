import { create } from 'zustand';
import type { ClassProgressView } from '@arena/shared';
import { fetchMe, loginAccount, registerAccount } from '../network/auth';

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

/**
 * `restoring` — validating a saved token on boot (show a splash, not the form).
 * `idle` — not signed in (show the auth screen). `authed` — signed in.
 */
export type AuthStatus = 'restoring' | 'idle' | 'authed';

interface AuthStore {
  status: AuthStatus;
  token: string | null;
  username: string | null;
  /** Per-class progression for the signed-in account (drives char-select levels). */
  progress: ClassProgressView[];
  /** Async-in-flight flag for the auth form (login/register button). */
  busy: boolean;
  error: string | null;

  restore: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, username: string, password: string) => Promise<void>;
  signOut: () => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  status: 'restoring',
  token: null,
  username: null,
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
      set({ status: 'authed', token: me.token, username: me.username, progress: me.progress });
    } catch {
      // Token invalid/expired or server unreachable — fall back to the form.
      saveToken(null);
      set({ status: 'idle', token: null, username: null, progress: [] });
    }
  },

  signIn: async (email, password) => {
    set({ busy: true, error: null });
    try {
      const res = await loginAccount(email, password);
      saveToken(res.token);
      set({
        status: 'authed',
        token: res.token,
        username: res.username,
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
      set({
        status: 'authed',
        token: res.token,
        username: res.username,
        progress: res.progress,
        busy: false,
      });
    } catch (err) {
      set({ busy: false, error: err instanceof Error ? err.message : 'Registration failed.' });
    }
  },

  signOut: () => {
    saveToken(null);
    set({ status: 'idle', token: null, username: null, progress: [], error: null });
  },
}));
