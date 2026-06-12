import { create } from 'zustand';
import { DEFAULT_CAMERA_PREFS, type CameraPrefs } from '@arena/shared';
import { fetchCameraPrefs, putCameraPrefs } from '../network/prefs';
import { useAuthStore } from './useAuthStore';
import { clampCameraPitch, resetCameraYaw, resetCameraZoom } from './cameraControl';

/**
 * Account-synced camera preference locks. Locks apply locally the instant they're
 * toggled (so the camera obeys them immediately) and are saved to the account on
 * a short debounce; they're pulled back from the server after sign-in. If there's
 * no token or persistence is off, the locks still work for the session — they
 * just don't persist.
 */
interface CameraPrefsStore {
  prefs: CameraPrefs;
  /** Toggle a single lock. */
  setLock: (key: keyof CameraPrefs, value: boolean) => void;
  /** Load the signed-in account's prefs from the server (call once after auth). */
  loadForAccount: () => Promise<void>;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

/** Snap the live camera offsets out of any now-forbidden axis. */
function applyLocks(prefs: CameraPrefs): void {
  if (prefs.lockRotation) resetCameraYaw();
  if (prefs.lockZoom) resetCameraZoom();
  clampCameraPitch(!prefs.lockTiltUp, !prefs.lockTiltDown);
}

export const useCameraPrefsStore = create<CameraPrefsStore>((set, get) => ({
  prefs: { ...DEFAULT_CAMERA_PREFS },

  setLock: (key, value) => {
    const prefs = { ...get().prefs, [key]: value };
    set({ prefs });
    applyLocks(prefs);

    // Debounced server save — skipped silently without a token (locks still
    // apply this session).
    const token = useAuthStore.getState().token;
    if (!token) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      void putCameraPrefs(token, get().prefs).catch(() => {
        /* persistence unavailable — keep local; next change retries */
      });
    }, 500);
  },

  loadForAccount: async () => {
    const token = useAuthStore.getState().token;
    if (!token) return;
    try {
      const prefs = await fetchCameraPrefs(token);
      set({ prefs });
      applyLocks(prefs);
    } catch {
      /* server/DB unavailable — keep defaults; locks still work locally */
    }
  },
}));
