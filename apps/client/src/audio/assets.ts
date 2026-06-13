/**
 * Client-local audio registry. Mirrors the id-keyed-descriptor convention of the
 * mesh asset registry (`src/assets/registry.ts`), but audio is pure client
 * decoration — the server never references it — so it lives here, not in
 * `@arena/shared`. Adding audio = adding an entry below; ids stay type-safe
 * because `MusicTrackId`/`SfxId` are derived from the records' keys.
 */

/** Dotted ids, mirroring the mesh registry's `vfx.*`/`char.*` convention. */
export type MusicTrackId = `music.${string}`;
export type SfxId = `sfx.${string}`;

export interface MusicDescriptor {
  /** Root-relative URL under `public/` (streamed via HTMLAudioElement). */
  src: string;
  /** Loop the track (background music nearly always does). Default true. */
  loop?: boolean;
  /** Per-track gain (0–1), to normalize loudness across tracks. Default 1. */
  volume?: number;
}

export interface SfxDescriptor {
  /** Root-relative URL under `public/` (short clips; decoded into an AudioBuffer). */
  src: string;
  /** Per-effect gain (0–1). Default 1. */
  volume?: number;
}

/** Long-form background tracks (streamed). */
export const MUSIC: Partial<Record<MusicTrackId, MusicDescriptor>> = {
  'music.join': { src: '/audio/music/trailer_park.mp3', loop: true },
};

/**
 * Short sound effects (decoded + pooled). None yet — add e.g.
 * `'sfx.dash': { src: '/audio/sfx/dash.mp3' }` here, then call
 * `audioEngine.playSfx('sfx.dash')` from the relevant event sink (see the SFX
 * call-sites noted in the feature plan). Unknown ids warn at runtime, matching
 * the mesh registry's missing-asset policy.
 */
export const SFX: Partial<Record<SfxId, SfxDescriptor>> = {};
