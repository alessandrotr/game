import { getDialogue } from '../assets/data/dialogues';
import { useInteractionStore } from '../store/interactionState';

/**
 * Interaction overlay (Phase 8.3): a "Press F" prompt when near an NPC, and the
 * dialogue panel while talking. The panel is click-to-advance; the prompt is
 * non-interactive. Both read the interaction store reactively.
 */
export function InteractionUI() {
  const nearbyNpcId = useInteractionStore((s) => s.nearbyNpcId);
  const nearbyNpcName = useInteractionStore((s) => s.nearbyNpcName);
  const dialogue = useInteractionStore((s) => s.dialogue);
  const advance = useInteractionStore((s) => s.advance);
  const close = useInteractionStore((s) => s.close);

  if (dialogue) {
    const data = getDialogue(dialogue.dialogueId);
    const line = data.lines[dialogue.line];
    const speaker = line?.speaker ?? dialogue.npcName ?? data.speaker;
    const last = dialogue.line >= data.lines.length - 1;
    return (
      <div className="pointer-events-none absolute inset-x-0 bottom-28 flex justify-center px-4">
        <div className="pointer-events-auto relative w-full max-w-xl rounded-xl border border-accent/30 bg-panel/95 px-5 py-4">
          {/* The text area is the advance target (click / F). */}
          <button type="button" onClick={advance} className="block w-full text-left">
            <div className="mb-1 text-sm font-semibold text-accent">{speaker}</div>
            <div className="text-[15px] leading-relaxed text-text">{line?.text}</div>
            <div className="mt-2 text-[11px] text-muted">
              Click or <kbd className="rounded bg-black/40 px-1">F</kbd>{' '}
              {last ? 'to finish' : 'to continue'}
            </div>
          </button>
          {/* Close is a sibling control, not nested inside the advance button. */}
          <button
            type="button"
            onClick={close}
            aria-label="Close dialogue"
            className="absolute bottom-4 right-5 text-[11px] text-muted transition hover:text-text"
          >
            <kbd className="rounded bg-black/40 px-1" aria-hidden="true">
              Esc
            </kbd>{' '}
            close
          </button>
        </div>
      </div>
    );
  }

  if (nearbyNpcId) {
    return (
      <div className="pointer-events-none absolute bottom-28 left-1/2 -translate-x-1/2 rounded-lg border border-accent/30 bg-panel/85 px-3 py-1.5 text-sm text-text">
        Press <kbd className="rounded bg-black/40 px-1 font-bold">F</kbd> to talk to{' '}
        {nearbyNpcName}
      </div>
    );
  }

  return null;
}
