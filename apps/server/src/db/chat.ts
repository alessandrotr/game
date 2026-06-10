import type { ChatMessage } from '@arena/shared';
import type { Queryable } from './database.js';

/**
 * Persisted chat per channel. Pure over a `Queryable` (real Postgres in prod,
 * pg-mem in dev/tests). The room keeps the live broadcast in memory; this just
 * makes the last-N survive room disposal and restarts.
 */

/** Append one message to a channel. */
export async function saveChatMessage(
  q: Queryable,
  channel: string,
  sender: string,
  body: string,
): Promise<void> {
  await q.query('INSERT INTO chat_messages (channel, sender, body) VALUES ($1, $2, $3)', [
    channel,
    sender,
    body,
  ]);
}

/** The most recent `limit` messages for a channel, in chronological order. */
export async function loadRecentChat(
  q: Queryable,
  channel: string,
  limit: number,
): Promise<ChatMessage[]> {
  const res = await q.query(
    'SELECT sender, body FROM chat_messages WHERE channel = $1 ORDER BY id DESC LIMIT $2',
    [channel, limit],
  );
  // Query is newest-first for the LIMIT; reverse to oldest-first for display.
  return res.rows
    .map((row) => ({ from: String(row.sender ?? ''), text: String(row.body ?? '') }))
    .reverse();
}
