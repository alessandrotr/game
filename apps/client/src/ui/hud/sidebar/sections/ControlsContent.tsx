import {
  ChevronsUp,
  EyeOff,
  MessageSquare,
  MousePointer2,
  MoveVertical,
  RotateCw,
  Search,
  Smile,
  Sparkles,
  Speech,
  Swords,
  X,
  type LucideIcon,
} from 'lucide-react';

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
 * Controls reference — every command grouped with icons + keycaps. Lifted out of
 * the old `ControlsHelp` dialog so it can live inside the town sidebar; the panel
 * owns the scroll + header, this just supplies the rows.
 */
export function ControlsContent() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
      <Section title="Move & Fight">
        <Row icon={MousePointer2} keys={['Right-click']} label="Move (hold to steer)" />
        <Row icon={Swords} keys={['Left-click']} label="Attack target · inspect player" />
        <Row icon={ChevronsUp} keys={['Space']} label="Jump · grab / throw in arena" />
      </Section>

      <Section title="Abilities">
        <Row icon={Sparkles} keys={['Q', 'W', 'E', 'R']} label="Cast abilities (hold to aim)" />
        <Row icon={Smile} keys={['1–9']} label="Emotes & dances" />
      </Section>

      <Section title="Camera">
        <Row icon={RotateCw} keys={['←', '→']} label="Rotate the view" />
        <Row icon={MoveVertical} keys={['↑', '↓']} label="Tilt the view" />
        <Row icon={Search} keys={['Scroll']} label="Zoom in / out" />
      </Section>

      <Section title="Talk & Interface">
        <Row icon={Speech} keys={['F']} label="Talk to nearby NPCs" />
        <Row icon={MessageSquare} keys={['Enter']} label="Open chat" />
        <Row icon={EyeOff} keys={['H']} label="Hide the HUD" />
        <Row icon={X} keys={['Esc']} label="Close menus · cancel aim" />
      </Section>
    </div>
  );
}
