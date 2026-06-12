import {
  ChevronsUp,
  Crosshair,
  EyeOff,
  MessageSquare,
  MousePointer2,
  RotateCw,
  Search,
  Smile,
  Sparkles,
  Swords,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useControlsStore } from '../../store/useControlsStore';
import { Dialog, DialogClose, DialogContent, DialogTitle, IconButton } from '../primitives';

/** A keycap / input chip (the `Q`, `Space`, `Right-click` glyphs). */
function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex min-w-[1.4rem] items-center justify-center rounded-md border border-white/15 border-b-white/25 bg-white/5 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-text shadow-[0_1px_0_rgba(0,0,0,0.4)]">
      {children}
    </kbd>
  );
}

/** One control: icon · key chip(s) · what it does. */
function Row({ icon: Icon, keys, label }: { icon: LucideIcon; keys: string[]; label: string }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <Icon size={16} aria-hidden="true" className="shrink-0 text-muted" />
      <div className="flex flex-1 items-center gap-1">
        {keys.map((k, i) => (
          <span key={k} className="flex items-center gap-1">
            {i > 0 && <span className="text-[10px] text-muted">·</span>}
            <Key>{k}</Key>
          </span>
        ))}
      </div>
      <span className="text-[13px] text-text">{label}</span>
    </div>
  );
}

/** A labelled group of controls. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="px-3 pb-0.5 pt-3 text-[10px] font-semibold uppercase tracking-wider text-muted">
        {title}
      </div>
      <div className="divide-y divide-white/5">{children}</div>
    </div>
  );
}

/**
 * Controls helper — a modern, dismissable reference of every command, grouped
 * with icons + keycaps. Auto-shows once for a new player and is reopenable from
 * the game menu (see `useControlsStore`).
 */
export function ControlsHelp() {
  const open = useControlsStore((s) => s.open);
  const setOpen = useControlsStore((s) => s.setOpen);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md p-0" aria-describedby={undefined}>
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <DialogTitle className="font-display text-lg font-bold tracking-wide text-gold">
            Controls
          </DialogTitle>
          <DialogClose asChild>
            <IconButton icon={X} aria-label="Close" />
          </DialogClose>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-2 pb-3">
          <Section title="Move & Fight">
            <Row icon={MousePointer2} keys={['Right-click']} label="Move" />
            <Row icon={Swords} keys={['Left-click']} label="Attack / Inspect" />
            <Row icon={ChevronsUp} keys={['Space']} label="Jump" />
          </Section>

          <Section title="Abilities">
            <Row icon={Sparkles} keys={['Q', 'W', 'E', 'R']} label="Cast abilities" />
            <Row icon={Smile} keys={['1', '2']} label="Emote / dance" />
          </Section>

          <Section title="Talk & Chat">
            <Row icon={Crosshair} keys={['F']} label="Talk to nearby NPCs" />
            <Row icon={MessageSquare} keys={['Enter']} label="Open chat" />
          </Section>

          <Section title="Camera & Interface">
            <Row icon={RotateCw} keys={['←', '→']} label="Rotate the view" />
            <Row icon={Search} keys={['Scroll']} label="Zoom in / out" />
            <Row icon={EyeOff} keys={['H']} label="Hide the HUD" />
          </Section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
