import { create } from 'zustand';
import { CHAT_HISTORY_SIZE, type ChatMessage } from '@arena/shared';

/** Global chat log shown in the chat panel. Capped to the same size the server
 *  retains, so the client never grows unbounded. */
interface ChatStore {
  messages: ChatMessage[];
  /** Append one received message. */
  add: (message: ChatMessage) => void;
  /** Replace the log (e.g. with history on join). */
  set: (messages: ChatMessage[]) => void;
  clear: () => void;
}

export const useChatStore = create<ChatStore>((set) => ({
  messages: [],
  add: (message) =>
    set((s) => ({ messages: [...s.messages, message].slice(-CHAT_HISTORY_SIZE) })),
  set: (messages) => set({ messages: messages.slice(-CHAT_HISTORY_SIZE) }),
  clear: () => set({ messages: [] }),
}));
