import type { Client, Room } from '@colyseus/core';
import { CHAT_HISTORY_SIZE, sanitizeChat, ServerMessage, type ChatMessage } from '@arena/shared';
import { getPool } from './db/database.js';
import { loadRecentChat, saveChatMessage } from './db/chat.js';
import { captureServerError } from './observability.js';

/** Sliding-window rate limit: at most this many messages per sender per window. */
export const CHAT_RATE_MAX = 5;
/** Rate-limit window, in milliseconds. */
export const CHAT_RATE_WINDOW_MS = 5000;

/**
 * Decide whether a sender may post now, given the timestamps of their recent
 * messages. Pure (time is injected) so it's unit-testable. Mutates `recent` in
 * place: drops entries outside the window and appends `now` when allowed.
 */
export function allowChat(recent: number[], now: number): boolean {
  // Drop timestamps that have aged out of the window.
  while (recent.length > 0 && now - recent[0]! >= CHAT_RATE_WINDOW_MS) recent.shift();
  if (recent.length >= CHAT_RATE_MAX) return false;
  recent.push(now);
  return true;
}

/**
 * Per-room global chat (Phase 10.2): sanitizes untrusted input, rate-limits each
 * sender (Phase 15 hardening), keeps a bounded history, broadcasts to everyone,
 * and replays recent lines to joiners. Shared by every room type so chat behaves
 * identically in town and arena.
 *
 * When constructed with a `channel`, the log is also **persisted** to the DB:
 * `load()` restores the last {@link CHAT_HISTORY_SIZE} on room create, and each
 * message is saved — so a channel (e.g. town) survives the room being disposed
 * when empty, or a server restart. Without a channel it stays in-memory only
 * (fine for ephemeral arena matches).
 */
export class ChatLog {
  private history: ChatMessage[] = [];
  /** Recent send timestamps per sender key (session id), for rate limiting. */
  private readonly recent = new Map<string, number[]>();
  private readonly channel?: string;

  constructor(options?: { channel?: string }) {
    this.channel = options?.channel;
  }

  /** Restore persisted history for this channel (call once on room create). */
  async load(): Promise<void> {
    const db = getPool();
    if (!db || !this.channel) return;
    try {
      this.history = await loadRecentChat(db, this.channel, CHAT_HISTORY_SIZE);
    } catch (err) {
      captureServerError(err, {
        message: '[chat] failed to load history:',
        tags: { where: 'chat.load', channel: this.channel },
      });
    }
  }

  /**
   * Sanitize, rate-limit, record, broadcast, and (if persistent) save a chat
   * line. No-op on empty/invalid input or when the sender is over their rate
   * limit. `key` identifies the sender for rate limiting (use the session id).
   */
  handle(room: Room, key: string, from: string, rawText: unknown): void {
    const text = sanitizeChat(rawText);
    if (!text) return;

    let stamps = this.recent.get(key);
    if (!stamps) {
      stamps = [];
      this.recent.set(key, stamps);
    }
    if (!allowChat(stamps, Date.now())) return;

    const message: ChatMessage = { from, text };
    this.history.push(message);
    if (this.history.length > CHAT_HISTORY_SIZE) this.history.shift();
    // Live broadcast carries the sender's session id for the in-world speech
    // bubble; the stored/replayed history (above) deliberately omits it.
    room.broadcast(ServerMessage.Chat, { ...message, senderId: key });

    const db = getPool();
    if (db && this.channel) {
      void saveChatMessage(db, this.channel, from, text).catch((err) =>
        captureServerError(err, {
          message: '[chat] failed to save message:',
          tags: { where: 'chat.save', channel: this.channel ?? 'unknown' },
        }),
      );
    }
  }

  /** Replay recent history to a single client (call on join). */
  sendHistory(client: Client): void {
    client.send(ServerMessage.ChatHistory, { messages: this.history });
  }

  /** Forget a sender's rate-limit state when they leave the room. */
  forget(key: string): void {
    this.recent.delete(key);
  }
}
