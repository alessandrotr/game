/**
 * Strongly-typed message contracts exchanged over the Colyseus channel.
 *
 * Client → Server messages carry player intent; the server validates and applies
 * them authoritatively. Server → Client gameplay state is replicated via schema
 * sync, so explicit server messages are reserved for discrete events (casts,
 * damage) that drive transient client feedback.
 */

import type { AbilityConfig, AbilityKind, GunKind, GunView, LobbyMode, Team } from './constants.js';
import type { CharacterClass } from './assets.js';
import type { ClassStats } from './classes.js';
import type { ChatMessage } from './chat.js';
import type { PerkId } from './perks.js';

/** AI skill level for practice bots, from sloppy auto-attacker to full kit. */
export type BotDifficulty = 'easy' | 'medium' | 'hard';

/** Message identifiers sent from client to server. */
export enum ClientMessage {
  /** Set/update the world-space point to move toward (hold-to-move). */
  MoveTo = 'move_to',
  /** Stop mouse-driven movement immediately (right mouse button released). */
  StopMove = 'stop_move',
  /** Request a jump; the server applies it only when grounded. */
  Jump = 'jump',
  /** Pickable objects: grab a nearby one (empty-handed) or throw the one being
   *  carried (the arena's spacebar action). The server decides which applies. */
  Interact = 'interact',
  /** Set the auto-attack target (a player session id); attack-move toward it. */
  Attack = 'attack',
  /** Request to cast an ability in a direction. */
  CastAbility = 'cast_ability',
  /** Set or change the player's display name. */
  SetName = 'set_name',
  /** Send a global chat message to everyone in the room. */
  Chat = 'chat',
  /** Matchmaking: create a new lobby (name + mode). */
  CreateLobby = 'create_lobby',
  /** Matchmaking: take a specific team slot in an open lobby. */
  JoinSlot = 'join_slot',
  /** Matchmaking: leave the lobby you're currently in. */
  LeaveLobby = 'leave_lobby',
  /** Matchmaking: accept the ready-check for your full lobby. */
  AcceptMatch = 'accept_match',
  /** Matchmaking: decline the ready-check (returns others to the open lobby). */
  DeclineMatch = 'decline_match',
  /** Co-op zombie: create a squad lobby (name + public/private). */
  ZombieCreateLobby = 'z_create_lobby',
  /** Co-op zombie: join a public squad lobby from the browser (by id). */
  ZombieJoinLobby = 'z_join_lobby',
  /** Co-op zombie: join a private squad lobby by its share code. */
  ZombieJoinByCode = 'z_join_code',
  /** Co-op zombie: leave the squad lobby you're in. */
  ZombieLeaveLobby = 'z_leave_lobby',
  /** Co-op zombie: host launches the run (1–5 players). */
  ZombieStartMatch = 'z_start_match',
  /** Dev-only: live-tune authoritative movement "feel" for the room. */
  DevTune = 'dev_tune',
  /** Dev-only: live-tune ability balance (global base and/or per-class overrides). */
  AbilityTune = 'ability_tune',
  /** Dev-only: live-tune per-class stats (HP / mana / move speed / attack). */
  StatTune = 'stat_tune',
  /** Dev-only: set the arena's practice-bot population and AI difficulty. */
  BotControl = 'bot_control',
  /** Feature flag: enable/disable auto-attacks for the room (off by default). */
  SetAutoAttack = 'set_auto_attack',
  /** Gun Mode Zombie: fire the equipped gun toward an aim direction (right-click).
   *  The server enforces the magazine, fire rate, and reload. */
  FireWeapon = 'fire_weapon',
  /** Gun Mode Zombie: equip a gun by its slot (3 = pistol, 4 = machine gun). */
  SwitchWeapon = 'switch_weapon',
  /** Gun Mode Zombie: reload the equipped gun (R). */
  ReloadWeapon = 'reload_weapon',
  /** Gun Mode Zombie: update the facing/aim direction (mouse cursor), streamed so
   *  the character and remote clients track the cursor between shots. */
  AimWeapon = 'aim_weapon',
  /** Gun Mode Zombie: tell the server which camera view is active (fps/topdown)
   *  so it applies the matching move speed (kept in lockstep with prediction). */
  SetGunView = 'set_gun_view',
  /** Ask the server for the global leaderboard (town only). */
  RequestLeaderboard = 'request_leaderboard',
  /** Play an emote (dance) — replicated so everyone sees it. */
  Emote = 'emote',
  /** Update the aim direction of an in-progress channel (e.g. the priest beam),
   *  sent continuously while channelling so the ray tracks the cursor. */
  AimChannel = 'aim_channel',
  /** Update the player's equipped appearance live (skin / dye / title) so
   *  everyone in the room sees it immediately. Persistence is over HTTP. */
  EquipLoadout = 'equip_loadout',
  /** Zombie perk progression: pick a perk (slot 0/1/2) or upgrade an existing
   *  perk. Sent in response to a {@link ServerMessage.PerkOffer}. */
  PerkPick = 'perk_pick',
}

/** Message identifiers sent from server to client (discrete events, not state sync). */
export enum ServerMessage {
  /** Sent once to the joining client with its identity and the world seed. */
  Welcome = 'welcome',
  /** An ability was cast (drives transient cast/impact VFX on clients). */
  AbilityCast = 'ability_cast',
  /** A player dealt damage to another player. */
  Damage = 'damage',
  /** A player was healed (drives healing combat text). */
  Heal = 'heal',
  /** A chat message was broadcast to the room. */
  Chat = 'chat',
  /** Recent chat history, sent to a client when it joins. */
  ChatHistory = 'chat_history',
  /** A matchmaking intent was rejected (validation, race, full, etc.). */
  LobbyError = 'lobby_error',
  /** A match was found — carries a seat reservation to consume into the arena. */
  MatchFound = 'match_found',
  /** A ranked match ended — carries the winner and final scoreboard. */
  MatchOver = 'match_over',
  /** The global leaderboard, sent in reply to {@link ClientMessage.RequestLeaderboard}. */
  Leaderboard = 'leaderboard',
  /** A player gained a level (drives the level-up flourish + HUD toast). */
  LevelUp = 'level_up',
  /** A projectile struck arena cover (drives an impact burst at the wall). */
  ProjectileImpact = 'projectile_impact',
  /** A burning barrel exploded (drives a blast burst + area-damage feedback). */
  BarrelExplosion = 'barrel_explosion',
  /** A destructible object was struck by a spell (drives a small dust/impact
   *  puff — NOT an explosion; the object just reacts physically). */
  DestructibleHit = 'destructible_hit',
  /** A cover structure (trailer/car/dumpster) lost all its HP and crumbled
   *  (drives a dust/debris burst; the structure also becomes uncollidable). */
  StructureCrumbled = 'structure_crumbled',
  /** A car ran out of HP and detonated (drives the fireball explosion VFX; the
   *  server has already applied its area damage). */
  CarExplosion = 'car_explosion',
  /** A thrown pickable (molotov / grenade) burst on impact (drives the blast VFX,
   *  sized to its radius; the server has already applied the area damage). */
  Detonation = 'detonation',
  /** Co-op zombie run ended (every player fell). Carries the wave reached for the
   *  defeat screen; the client returns to town. */
  ZombieGameOver = 'zombie_game_over',
  /** Gun Mode Zombie: a gun was fired (drives the muzzle flash + shot SFX). The
   *  bullet itself is a replicated projectile; this is just the firing feedback. */
  WeaponFired = 'weapon_fired',
  /** Zombie perk progression: offer 2 visible perks (+ the implicit jolly) after
   *  a wave clear. The client renders the picker; the player replies with
   *  {@link ClientMessage.PerkPick}. */
  PerkOffer = 'perk_offer',
}

/** A player's line on the end-of-match scoreboard. */
export interface MatchScore {
  /** Session id of the player (compare against the local id to find yourself). */
  id: string;
  name: string;
  /** Side this player fought for (groups the scoreboard into Blue/Red). */
  team: Team;
  kills: number;
  deaths: number;
}

/** Which metric a leaderboard is ranked by. Each is a column on `class_progress`,
 *  so the same per-(player+class) rows are simply re-sorted per category. */
export type LeaderboardCategory = 'wins' | 'losses' | 'kills' | 'deaths' | 'level';

/** All leaderboard categories, in display order (the dialog renders one tab each). */
export const LEADERBOARD_CATEGORIES: readonly LeaderboardCategory[] = [
  'wins',
  'losses',
  'kills',
  'deaths',
  'level',
] as const;

/** One ranked row on the global leaderboard (a player's progress for a class). */
export interface LeaderboardEntry {
  name: string;
  characterClass: string;
  level: number;
  wins: number;
  losses: number;
  kills: number;
  deaths: number;
  /** Account id, for fetching the champion's public paint (`/paint/:pid`). 0/absent
   *  for guests or when unavailable. Used by the town podium to render their look. */
  pid?: number;
  /** Equipped skin/dye cosmetic ids for this class, so the podium can show the
   *  champion in their actual appearance. Absent → default look. */
  skinId?: string;
  dyeId?: string;
  /** Equipped title cosmetic id, so the podium nameplate shows the player's custom
   *  title (tinted) like the rest of the game. Absent → no title. */
  titleId?: string;
}

/** Payload map for {@link ClientMessage}. */
export interface ClientMessagePayloads {
  [ClientMessage.MoveTo]: { x: number; z: number };
  [ClientMessage.StopMove]: Record<string, never>;
  [ClientMessage.Jump]: Record<string, never>;
  [ClientMessage.Interact]: Record<string, never>;
  [ClientMessage.Attack]: { targetId: string };
  [ClientMessage.CastAbility]: {
    ability: AbilityKind;
    dirX: number;
    dirZ: number;
    /** Ground-target point (ground-targeted abilities only). */
    tx?: number;
    tz?: number;
    /** Locked target's session id (unit-targeted abilities only). */
    targetId?: string;
  };
  [ClientMessage.SetName]: { name: string };
  [ClientMessage.Chat]: { text: string };
  [ClientMessage.CreateLobby]: { name: string; mode: LobbyMode };
  [ClientMessage.JoinSlot]: { lobbyId: string; team: Team; index: number };
  [ClientMessage.LeaveLobby]: Record<string, never>;
  [ClientMessage.AcceptMatch]: Record<string, never>;
  [ClientMessage.DeclineMatch]: Record<string, never>;
  [ClientMessage.ZombieCreateLobby]: { name: string; isPrivate: boolean };
  [ClientMessage.ZombieJoinLobby]: { lobbyId: string };
  [ClientMessage.ZombieJoinByCode]: { code: string };
  [ClientMessage.ZombieLeaveLobby]: Record<string, never>;
  [ClientMessage.ZombieStartMatch]: Record<string, never>;
  [ClientMessage.RequestLeaderboard]: { category: LeaderboardCategory };
  [ClientMessage.Emote]: { emote: string };
  /** New aim direction for the active channel (normalized server-side). */
  [ClientMessage.AimChannel]: { dirX: number; dirZ: number };
  /** The appearance-affecting subset of the loadout (cosmetic ids; '' = none).
   *  `paintRev` is a short revision of the player's custom paint for this class —
   *  when it changes, peers refetch the paint PNG over HTTP (the PNG itself is too
   *  large for the realtime schema). '' = no custom paint. */
  [ClientMessage.EquipLoadout]: {
    skinId: string;
    dyeId: string;
    pedestalId: string;
    titleId: string;
    rimId: string;
    weaponId: string;
    enchantId: string;
    paintRev?: string;
  };
  /** Movement "feel" overrides (global). Walk speed is the per-class stat. */
  [ClientMessage.DevTune]: {
    jumpForce: number;
    stoppingDistance: number;
    rotationSpeed: number;
  };
  /**
   * Ability balance overrides, in the server's own units (ms, world units):
   * `global` patches the shared base; `perClass` patches a single class's copy.
   */
  [ClientMessage.AbilityTune]: {
    global?: Partial<Record<AbilityKind, Partial<AbilityConfig>>>;
    perClass?: Partial<Record<CharacterClass, Partial<Record<AbilityKind, Partial<AbilityConfig>>>>>;
  };
  /** Per-class stat overrides (HP / mana / move speed / attack). */
  [ClientMessage.StatTune]: Partial<Record<CharacterClass, Partial<ClassStats>>>;
  /** Reconcile the arena's practice-bot population to `count` at `difficulty`.
   *  `characterClass` pins every bot to one class (else each rolls a random one). */
  [ClientMessage.BotControl]: {
    count: number;
    difficulty: BotDifficulty;
    characterClass?: CharacterClass;
  };
  /** Toggle the auto-attack feature flag for the room. */
  [ClientMessage.SetAutoAttack]: { enabled: boolean };
  /** Fire the equipped gun along a normalized aim direction (the cursor). */
  [ClientMessage.FireWeapon]: { dirX: number; dirZ: number };
  /** Equip a gun by its number-key slot (3 = pistol, 4 = machine gun). */
  [ClientMessage.SwitchWeapon]: { slot: number };
  /** Reload the equipped gun. */
  [ClientMessage.ReloadWeapon]: Record<string, never>;
  /** Stream the gun-mode facing/aim direction (normalized server-side). */
  [ClientMessage.AimWeapon]: { dirX: number; dirZ: number };
  /** Set the active Gun Mode camera view (drives the server-side move speed). */
  [ClientMessage.SetGunView]: { view: GunView };
  /** Zombie perk: pick slot 0 (visible A), 1 (visible B), or 2 (jolly).
   *  `upgradeTarget` is the perk id to upgrade when using the free-choice path
   *  (only used during upgrade waves; omit for a fresh pick or a jolly). */
  [ClientMessage.PerkPick]: { slot: number; upgradeTarget?: PerkId };
}

/** Payload map for {@link ServerMessage}. */
export interface ServerMessagePayloads {
  [ServerMessage.Welcome]: { sessionId: string; worldSeed: number };
  [ServerMessage.AbilityCast]: {
    casterId: string;
    ability: AbilityKind;
    x: number;
    y: number;
    z: number;
    dirX: number;
    dirZ: number;
    /** Resolved impact point for ground-targeted abilities (else absent). */
    tx?: number;
    tz?: number;
    /** Locked target's session id for unit-targeted abilities (else absent). */
    targetId?: string;
  };
  [ServerMessage.Damage]: { from: string; to: string; amount: number; lethal: boolean; ability?: string; crit?: boolean };
  [ServerMessage.Heal]: { to: string; amount: number };
  [ServerMessage.Chat]: ChatMessage;
  [ServerMessage.ChatHistory]: { messages: ChatMessage[] };
  [ServerMessage.LobbyError]: { code: string; message: string };
  /** `reservation` is a Colyseus seat reservation passed straight to
   *  `client.consumeSeatReservation()` — its internal shape is opaque to us. */
  [ServerMessage.MatchFound]: { reservation: unknown };
  [ServerMessage.MatchOver]: {
    /** Side that won the match. */
    winnerTeam: Team;
    /** Combined team kills that were needed to win (for "15 / 15" display). */
    target: number;
    /** Final scoreboard for everyone in the match (grouped by team client-side). */
    scores: MatchScore[];
  };
  [ServerMessage.Leaderboard]: {
    /** Which ranking these entries are for — echoed back so the client can route
     *  the reply to the right tab and ignore stale responses for an old tab. */
    category: LeaderboardCategory;
    /** False when persistence is disabled (no DATABASE_URL) — show a notice. */
    enabled: boolean;
    /** Top entries, already ranked (best first) for {@link category}. */
    entries: LeaderboardEntry[];
  };
  [ServerMessage.LevelUp]: { sessionId: string; level: number };
  /** Source vfx tag + the world point where the projectile hit cover. */
  [ServerMessage.ProjectileImpact]: { ability: string; x: number; z: number };
  /** World point of a barrel blast (drives the explosion VFX). */
  [ServerMessage.BarrelExplosion]: { x: number; z: number };
  /** World point + category of a destructible spell impact (drives a small
   *  dust puff). `category` is 'tire' | 'barrel' | 'buildingPart'. */
  [ServerMessage.DestructibleHit]: { x: number; y: number; z: number; category: string };
  /** World point + footprint radius of a structure that just crumbled (drives a
   *  dust/debris burst sized to the structure). */
  [ServerMessage.StructureCrumbled]: { x: number; z: number; radius: number };
  /** World point + blast radius of a car that detonated (drives the fireball). */
  [ServerMessage.CarExplosion]: { x: number; z: number; radius: number };
  /** A thrown pickable burst: its kind, world point, and blast radius (the VFX is
   *  sized to the radius). The server has already applied the area damage. */
  [ServerMessage.Detonation]: { kind: string; x: number; z: number; radius: number };
  /** Co-op zombie run ended — the wave the squad reached (for the defeat screen). */
  [ServerMessage.ZombieGameOver]: { level: number };
  /** A gun was fired: the shooter, which gun, and the muzzle origin + aim — drives
   *  the muzzle flash and shot SFX (the bullet is a replicated projectile). */
  [ServerMessage.WeaponFired]: {
    shooterId: string;
    gun: GunKind;
    x: number;
    z: number;
    dirX: number;
    dirZ: number;
  };
  /** Zombie perk offer: the two visible options (the jolly is resolved server-side
   *  on pick). `isUpgrade` is true when the player should upgrade an existing perk
   *  rather than pick a new one; `fixedUpgrade` is the pre-rolled upgrade path
   *  offered in slot 2 (e.g. "thick_skin → fortified"). */
  [ServerMessage.PerkOffer]: {
    visible: [PerkId, PerkId];
    isUpgrade: boolean;
    /** The source perk id for the fixed-offer upgrade in slot 2 (only when
     *  `isUpgrade` is true). */
    fixedUpgradeFrom?: PerkId;
    /** The destination perk id for the fixed-offer upgrade. */
    fixedUpgradeTo?: PerkId;
  };
}
