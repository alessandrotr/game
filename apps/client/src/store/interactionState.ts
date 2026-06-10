import { create } from 'zustand';
import { getDialogue, type DialogueId, type DialogueOutcome } from '../assets/data/dialogues';

/** An open conversation: which NPC, which dialogue, and the current line. */
interface ActiveDialogue {
  npcId: string;
  npcName: string;
  dialogueId: DialogueId;
  line: number;
}

interface InteractionStore {
  /** Closest in-range interactable NPC id (drives the "Press F" prompt). */
  nearbyNpcId: string | null;
  nearbyNpcName: string | null;
  /** The open dialogue, or null when none. */
  dialogue: ActiveDialogue | null;

  /** Set the current nearby NPC (no-ops if unchanged, to avoid re-renders). */
  setNearby: (npcId: string | null, npcName?: string | null) => void;
  /** Open a dialogue with an NPC at its first line. */
  open: (npcId: string, npcName: string, dialogueId: DialogueId) => void;
  /** Advance to the next line, or end the conversation on the last line. */
  advance: () => void;
  /** Close the dialogue without running its outcome. */
  close: () => void;
}

/**
 * The interaction outcome seam. Dialogue completion routes here; today only
 * logged in dev, but this is where shop/matchmaking/quest hooks attach later
 * (Phases 10–11) without touching the dialogue UI or data.
 */
function resolveOutcome(outcome: DialogueOutcome): void {
  if (outcome === 'none' || !outcome) return;
  if (import.meta.env.DEV) console.info(`[interaction] dialogue outcome (reserved): ${outcome}`);
}

export const useInteractionStore = create<InteractionStore>((set, get) => ({
  nearbyNpcId: null,
  nearbyNpcName: null,
  dialogue: null,

  setNearby: (npcId, npcName = null) => {
    if (get().nearbyNpcId === npcId) return;
    set({ nearbyNpcId: npcId, nearbyNpcName: npcId ? npcName : null });
  },

  open: (npcId, npcName, dialogueId) =>
    set({ dialogue: { npcId, npcName, dialogueId, line: 0 } }),

  advance: () => {
    const active = get().dialogue;
    if (!active) return;
    const dialogue = getDialogue(active.dialogueId);
    const next = active.line + 1;
    if (next >= dialogue.lines.length) {
      set({ dialogue: null });
      resolveOutcome(dialogue.onEnd ?? 'none');
      return;
    }
    set({ dialogue: { ...active, line: next } });
  },

  close: () => set({ dialogue: null }),
}));
