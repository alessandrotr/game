import { MUSIC, SFX, type MusicTrackId, type SfxId } from './assets';

/** Crossfade / fade-out window for music swaps. */
const MUSIC_FADE_MS = 600;
/** Master-gain ramp for volume/mute changes — short, click-free. */
const GAIN_RAMP_S = 0.015;

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** A single playing music voice. Per-voice gain enables crossfading later. */
interface MusicVoice {
  id: MusicTrackId;
  el: HTMLAudioElement;
  source: MediaElementAudioSourceNode;
  gain: GainNode;
}

/**
 * The game's audio sink — a lazy singleton over the Web Audio API.
 *
 * Graph: `master → destination`, with `music` and `sfx` sub-buses feeding
 * `master`. Master gain reflects volume/mute; the sub-buses exist so per-category
 * sliders can be added later with no rework. Music streams through an
 * HTMLAudioElement (cheap for long loops); SFX decode into pooled buffers.
 *
 * It is a pure imperative sink: `useAudioStore` owns the reactive settings and
 * pushes them here. `MusicDirector` owns the "what should play" intent and calls
 * {@link playMusic}/{@link stopMusic}. Nothing reads state back out.
 *
 * Browsers suspend audio until a user gesture; {@link unlock} (driven by
 * `useAudioUnlock`) resumes the context and starts any deferred music.
 */
class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;

  /** Settings, applied to the graph once it exists (seeded by the store). */
  private masterVolume = 1;
  private muted = false;

  /** The track that *should* be playing (intent), reconciled into `voice`. */
  private desired: MusicTrackId | null = null;
  private voice: MusicVoice | null = null;

  /** Decoded SFX buffers + in-flight loads, cached by id. */
  private readonly sfxBuffers = new Map<SfxId, AudioBuffer>();
  private readonly sfxLoading = new Map<SfxId, Promise<AudioBuffer | null>>();

  private get running(): boolean {
    return this.ctx !== null && this.ctx.state === 'running';
  }

  /** Create the context + bus graph once. Idempotent. */
  private ensureGraph(): AudioContext {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctor();
      this.master = ctx.createGain();
      this.musicBus = ctx.createGain();
      this.sfxBus = ctx.createGain();
      this.musicBus.connect(this.master);
      this.sfxBus.connect(this.master);
      this.master.connect(ctx.destination);
      this.ctx = ctx;
      this.applyMasterGain();
    }
    return this.ctx;
  }

  /** Resume the context on a user gesture and start any deferred music. */
  unlock = (): void => {
    const ctx = this.ensureGraph();
    void ctx.resume().then(() => this.reconcileMusic());
  };

  // --- Settings (driven by useAudioStore) ----------------------------------

  setMasterVolume(volume: number): void {
    this.masterVolume = clamp01(volume);
    this.applyMasterGain();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyMasterGain();
  }

  private applyMasterGain(): void {
    if (!this.ctx || !this.master) return; // applied when the graph is created
    const target = this.muted ? 0 : this.masterVolume;
    this.master.gain.setTargetAtTime(target, this.ctx.currentTime, GAIN_RAMP_S);
  }

  // --- Music (driven by MusicDirector) -------------------------------------

  /** Set the desired track; starts/swaps once unlocked. No-op if already playing it. */
  playMusic(id: MusicTrackId): void {
    this.desired = id;
    this.reconcileMusic();
  }

  /** Fade out and stop whatever is playing. */
  stopMusic(): void {
    this.desired = null;
    this.reconcileMusic();
  }

  /** Make the playing voice match `desired`. Idempotent; deferred until unlocked. */
  private reconcileMusic(): void {
    if (!this.running) return; // resumes in unlock()
    const current = this.voice;
    if (current?.id === this.desired) return; // already correct (covers null === null)

    if (current) this.fadeOutAndStop(current);

    this.voice = this.desired === null ? null : this.startVoice(this.desired);
  }

  private startVoice(id: MusicTrackId): MusicVoice | null {
    const ctx = this.ctx!;
    const desc = MUSIC[id];
    if (!desc) {
      console.warn(`[audio] Unknown music track "${id}".`);
      return null;
    }
    const el = new Audio(desc.src);
    el.loop = desc.loop ?? true;
    el.preload = 'auto';
    const source = ctx.createMediaElementSource(el);
    const gain = ctx.createGain();
    gain.gain.value = 0; // fade in
    source.connect(gain);
    gain.connect(this.musicBus!);
    void el
      .play()
      .then(() => gain.gain.setTargetAtTime(desc.volume ?? 1, ctx.currentTime, MUSIC_FADE_MS / 3000))
      .catch(() => {
        /* autoplay still blocked — a later unlock() reconcile retries */
      });
    return { id, el, source, gain };
  }

  private fadeOutAndStop(voice: MusicVoice): void {
    const ctx = this.ctx!;
    voice.gain.gain.setTargetAtTime(0, ctx.currentTime, MUSIC_FADE_MS / 3000);
    window.setTimeout(() => {
      voice.el.pause();
      try {
        voice.source.disconnect();
        voice.gain.disconnect();
      } catch {
        /* already disconnected */
      }
    }, MUSIC_FADE_MS + 100);
  }

  // --- SFX (structured; no assets registered yet) --------------------------

  /** Fire-and-forget a one-shot sound effect through the SFX bus. */
  async playSfx(id: SfxId): Promise<void> {
    if (!this.running) return; // no audible playback before the gesture unlock
    const desc = SFX[id];
    if (!desc) {
      console.warn(`[audio] Unknown sfx "${String(id)}".`);
      return;
    }
    const buffer = await this.loadSfx(id, desc.src);
    if (!buffer || !this.ctx || !this.sfxBus) return;
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.value = desc.volume ?? 1;
    source.connect(gain);
    gain.connect(this.sfxBus);
    source.start();
  }

  /** Decode + cache an SFX buffer (deduped while in flight). */
  private loadSfx(id: SfxId, url: string): Promise<AudioBuffer | null> {
    const cached = this.sfxBuffers.get(id);
    if (cached) return Promise.resolve(cached);
    const inFlight = this.sfxLoading.get(id);
    if (inFlight) return inFlight;

    const promise = fetch(url)
      .then((r) => r.arrayBuffer())
      .then((data) => this.ctx!.decodeAudioData(data))
      .then((decoded) => {
        this.sfxBuffers.set(id, decoded);
        this.sfxLoading.delete(id);
        return decoded;
      })
      .catch((err) => {
        console.warn(`[audio] Failed to load sfx "${String(id)}".`, err);
        this.sfxLoading.delete(id);
        return null;
      });
    this.sfxLoading.set(id, promise);
    return promise;
  }
}

/** Process-wide singleton sink. */
export const audioEngine = new AudioEngine();
