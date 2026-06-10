/**
 * Dialogue framework data (Phase 8.3). Dialogues are pure content: an ordered
 * list of lines plus reserved hooks for future quest support. The interaction
 * system advances through `lines` and, on completion, consults `onEnd` — today
 * a no-op placeholder, the seam where quests / shop / matchmaking will attach.
 */

export interface DialogueLine {
  /** Overrides the NPC's default name for this line (e.g. an interjection). */
  speaker?: string;
  text: string;
}

/** Reserved completion hooks — wired up in later phases (shop, matchmaking). */
export type DialogueOutcome = 'none' | 'open_shop' | 'queue_arena' | 'give_quest';

export interface Dialogue {
  id: string;
  /** Default speaker name shown for lines without their own `speaker`. */
  speaker: string;
  lines: DialogueLine[];
  /** What happens when the conversation ends (default 'none'). */
  onEnd?: DialogueOutcome;
  /** Reserved: associates this dialogue with a quest id (future). */
  questId?: string;
}

export type DialogueId = keyof typeof DIALOGUES;

export const DIALOGUES = {
  'dialogue.guard': {
    id: 'dialogue.guard',
    speaker: 'Town Guard',
    lines: [
      { text: 'Hold there, champion. The arena portal is just behind me.' },
      { text: 'Step through when you are ready to prove yourself.' },
      { text: 'Watch the pillars — cover wins duels.' },
    ],
    onEnd: 'none',
  },
  'dialogue.merchant': {
    id: 'dialogue.merchant',
    speaker: 'Merchant',
    lines: [
      { text: 'Welcome, traveler! Finest wares in the realm.' },
      { text: 'My shop is not open yet... come back soon.' },
    ],
    onEnd: 'open_shop',
  },
} as const satisfies Record<string, Dialogue>;

export function getDialogue(id: DialogueId): Dialogue {
  return DIALOGUES[id];
}
