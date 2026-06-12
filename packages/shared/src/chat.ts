/**
 * Global chat contract + sanitization, shared by client and server (Phase 10.2).
 * Sanitization is pure so it's unit-tested and applied identically on both ends
 * (the server is authoritative; the client may pre-check to disable the button).
 */

/** Max characters in a single chat message after sanitization. */
export const CHAT_MAX_LENGTH = 45;
/** How many recent messages a room retains and replays to joiners. */
export const CHAT_HISTORY_SIZE = 50;

/** One chat line as broadcast/stored. */
export interface ChatMessage {
  /** Sender display name. */
  from: string;
  text: string;
  /** Sender's session id — present on live broadcasts (drives the in-world
   *  speech bubble), absent on replayed history. */
  senderId?: string;
}

/**
 * Clean untrusted chat input: replace control characters (C0 + DEL) with spaces,
 * collapse whitespace, trim, and cap length. Returns null for anything empty
 * (nothing to send). A codepoint scan avoids embedding control bytes in a regex.
 */
export function sanitizeChat(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  let out = '';
  for (const ch of raw) {
    const code = ch.codePointAt(0) ?? 0;
    out += code < 0x20 || code === 0x7f ? ' ' : ch;
  }
  const cleaned = out.replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX_LENGTH);
  return cleaned.length > 0 ? cleaned : null;
}
