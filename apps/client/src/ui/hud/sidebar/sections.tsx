import {
  Keyboard,
  RotateCcw,
  Settings,
  ShoppingBag,
  Trophy,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';
import type { ComponentType } from 'react';
import type { SidebarSectionId } from './useSidebarStore';
import { ControlsContent } from './sections/ControlsContent';
import { SettingsContent } from './sections/SettingsContent';
import { LeaderboardSection } from './sections/LeaderboardSection';
import { SaveProgressContent } from './sections/SaveProgressContent';
import { ChangeCharacterContent } from './sections/ChangeCharacterContent';

/** Width of the expanded content panel — narrow for text/forms, medium for the
 *  leaderboard table, wide for the wardrobe. */
export type PanelWidth = 'narrow' | 'medium' | 'wide';

interface BaseEntry {
  label: string;
  icon: LucideIcon;
  /** Show only for guest accounts (e.g. "Save progress"). */
  guestOnly?: boolean;
  /** Footer entries render in a separate group below a divider. */
  footer?: boolean;
}

/** A nav entry that expands a content panel beside the rail. */
export interface PanelEntry extends BaseEntry {
  kind: 'panel';
  id: SidebarSectionId;
  width: PanelWidth;
  /** Simple sections supply their body here, rendered by the generic
   *  `SidebarPanel`. `hub` sections (Champion / Store) are rendered by the
   *  always-mounted `ChampionPanel` instead, so they omit this. */
  Content?: ComponentType;
  /** Champion / Store — share one persistently-mounted hub (preserves the WebGL
   *  thumbnail contexts); handled by `ChampionPanel`, not `SidebarPanel`. */
  hub?: boolean;
}

/** A nav entry that runs a one-shot action (no panel) — e.g. leave to character select. */
export interface ActionEntry extends BaseEntry {
  kind: 'action';
  id: string;
  run: () => void;
}

export type SidebarEntry = PanelEntry | ActionEntry;

/**
 * The town sidebar's single, ordered nav config.
 *
 * Migration in progress (see plan): entries marked `kind: 'action'` that merely
 * open a legacy dialog are transitional — each flips to `kind: 'panel'` with a
 * `Content` component as its surface is re-homed into the sidebar. Footer entries
 * (`footer: true`) are one-shot account actions grouped below a divider.
 */
export const SIDEBAR_ENTRIES: SidebarEntry[] = [
  // --- Store view of the champion hub. The Champion (customize) view is opened by
  //     the identity portrait at the top of the rail; both share one mounted hub. ---
  {
    kind: 'panel',
    id: 'store',
    label: 'Store',
    icon: ShoppingBag,
    width: 'wide',
    hub: true,
  },
  // --- Leaderboard (migrated: inline panel; diegetic town tablet keeps its dialog) ---
  {
    kind: 'panel',
    id: 'leaderboard',
    label: 'Leaderboard',
    icon: Trophy,
    width: 'medium',
    Content: LeaderboardSection,
  },
  // --- Controls (migrated: lives inline in the sidebar) ---
  {
    kind: 'panel',
    id: 'controls',
    label: 'Controls',
    icon: Keyboard,
    width: 'narrow',
    Content: ControlsContent,
  },
  // --- Settings (migrated: inline panel) ---
  {
    kind: 'panel',
    id: 'settings',
    label: 'Settings',
    icon: Settings,
    width: 'narrow',
    Content: SettingsContent,
  },
  // --- Account actions (footer; inline panels like the rest) ---
  {
    kind: 'panel',
    id: 'save-progress',
    label: 'Save progress',
    icon: UserPlus,
    width: 'narrow',
    guestOnly: true,
    footer: true,
    Content: SaveProgressContent,
  },
  {
    kind: 'panel',
    id: 'change-character',
    label: 'Change character',
    icon: RotateCcw,
    width: 'narrow',
    footer: true,
    Content: ChangeCharacterContent,
  },
];

/** Resolve a panel entry by its section id (used by the expanding panel). */
export function panelEntry(id: SidebarSectionId): PanelEntry | undefined {
  return SIDEBAR_ENTRIES.find((e): e is PanelEntry => e.kind === 'panel' && e.id === id);
}
