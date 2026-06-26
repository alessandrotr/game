import { useEffect } from 'react';
import { Palette, X } from 'lucide-react';
import { useGameStore } from '../store/useGameStore';
import { useCharacterStore } from '../store/useCharacterStore';
import { useAuthStore } from '../store/useAuthStore';
import { useCustomizeStore } from '../store/useCustomizeStore';
import { useSidebarStore } from './hud/sidebar/useSidebarStore';
import { PaintStudio } from './PaintStudio';
import { Button, IconButton } from './primitives';

/** Guest gate: paint persists per account + is shown to other players, so guests
 *  get a "Save progress" CTA. Closes the studio and opens the sidebar's inline
 *  Save-progress section (the town's account-upgrade surface). */
function PaintGuestGate() {
  const saveProgress = () => {
    useCustomizeStore.getState().closePaint();
    useSidebarStore.getState().open('save-progress');
  };
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gold/15 text-gold">
        <Palette size={26} aria-hidden />
      </div>
      <div>
        <h3 className="font-display text-lg font-bold text-text">Painting is account-only</h3>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
          Create a free account to paint your character — your paint job saves to your profile and
          shows to everyone in the world.
        </p>
      </div>
      <Button variant="gold" size="lg" onClick={saveProgress}>
        Save progress
      </Button>
    </div>
  );
}

/**
 * The paint studio as a focused, full-screen surface. Painting wants the whole
 * body as a large interactive canvas, so it takes over the screen (opaque) rather
 * than docking in the sidebar. Launched from the Champion hub's "Paint" button;
 * Esc or the close button returns to town. Mounted only while open, so PaintStudio's
 * own ⌘Z undo shortcut is naturally scoped to when it's active.
 */
export function PaintOverlay() {
  const open = useCustomizeStore((s) => s.paintOpen);
  const close = useCustomizeStore((s) => s.closePaint);
  const guest = useAuthStore((s) => s.guest);
  const sessionId = useGameStore((s) => s.sessionId);
  const selectedClass = useCharacterStore((s) => s.selectedClass);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  if (!open) return null;

  const me = sessionId ? useGameStore.getState().players.get(sessionId) : undefined;
  const characterClass = me?.characterClass ?? selectedClass;

  return (
    <div className="fixed inset-0 z-modal flex flex-col bg-bg">
      <header className="flex items-center justify-between border-b border-white/10 px-5 py-3">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold tracking-wide text-gold">
          <Palette size={18} aria-hidden /> Paint Studio
        </h2>
        <IconButton icon={X} aria-label="Close paint studio" onClick={close} />
      </header>
      <div className="min-h-0 flex-1">
        {guest ? <PaintGuestGate /> : <PaintStudio characterClass={characterClass} />}
      </div>
    </div>
  );
}
