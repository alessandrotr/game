import type { Client, Room } from '@colyseus/core';
import { CHAT_HISTORY_SIZE, sanitizeChat, ServerMessage, type ChatMessage } from '@arena/shared';

/**
 * Per-room global chat (Phase 10.2): sanitizes untrusted input, keeps a bounded
 * history, broadcasts to everyone, and replays recent lines to joiners. Shared
 * by every room type so chat behaves identically in town and arena.
 */
export class ChatLog {
  private readonly history: ChatMessage[] = [];

  /** Sanitize, record, and broadcast a chat line. No-op on empty/invalid input. */
  handle(room: Room, from: string, rawText: unknown): void {
    const text = sanitizeChat(rawText);
    if (!text) return;
    const message: ChatMessage = { from, text };
    this.history.push(message);
    if (this.history.length > CHAT_HISTORY_SIZE) this.history.shift();
    room.broadcast(ServerMessage.Chat, message);
  }

  /** Replay recent history to a single client (call on join). */
  sendHistory(client: Client): void {
    client.send(ServerMessage.ChatHistory, { messages: this.history });
  }
}
