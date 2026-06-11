import { create } from 'zustand';

/** How long a chat speech bubble stays above a player's head, in milliseconds. */
const BUBBLE_MS = 5000;

interface Bubble {
  text: string;
  /** Bumps each time the same player speaks, so the timer/animation resets. */
  nonce: number;
}

interface SpeechStore {
  /** Active bubble per player session id. */
  bubbles: Record<string, Bubble>;
  say: (sessionId: string, text: string) => void;
  clear: () => void;
}

const timers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Transient in-world speech bubbles. When a chat message arrives with a sender
 * id, the bubble is shown above that player's head for a few seconds; a newer
 * message from the same player replaces it and resets the timer.
 */
export const useSpeechStore = create<SpeechStore>((set, get) => ({
  bubbles: {},
  say: (sessionId, text) => {
    const prev = get().bubbles[sessionId];
    set({ bubbles: { ...get().bubbles, [sessionId]: { text, nonce: (prev?.nonce ?? 0) + 1 } } });
    const existing = timers.get(sessionId);
    if (existing) clearTimeout(existing);
    timers.set(
      sessionId,
      setTimeout(() => {
        timers.delete(sessionId);
        const { [sessionId]: _gone, ...rest } = get().bubbles;
        void _gone;
        set({ bubbles: rest });
      }, BUBBLE_MS),
    );
  },
  clear: () => {
    for (const t of timers.values()) clearTimeout(t);
    timers.clear();
    set({ bubbles: {} });
  },
}));
