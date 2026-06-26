import { describe, expect, it } from 'vitest';
import { QUEUE_BOT_FILL_MS } from '@arena/shared';
import { MatchmakingState } from '../mmSchema.js';
import { QueueManager, type Identity } from './queue.js';

const IDENTITY: Identity = {
  token: '',
  name: 'P',
  characterClass: 'warrior',
  skinId: '',
  dyeId: '',
  pedestalId: '',
  titleId: '',
  rimId: '',
  weaponId: '',
  enchantId: '',
  sessionKey: '',
};

function managerWith(sessionIds: string[]): QueueManager {
  const q = new QueueManager(new MatchmakingState());
  for (const id of sessionIds) q.setIdentity(id, { ...IDENTITY, name: id });
  return q;
}

describe('QueueManager.planMatch', () => {
  it('forms an instant 1v1 with two solo queuers, on opposite teams', () => {
    const q = managerWith(['a', 'b']);
    q.join('a', '1v1', 1000);
    q.join('b', '1v1', 1001);
    const plan = q.planMatch('1v1', 1002);
    expect(plan).not.toBeNull();
    expect(plan!.botFill).toEqual({ blue: 0, red: 0 });
    const teams = Object.fromEntries(plan!.humans.map((h) => [h.sessionId, h.team]));
    expect(teams.a).not.toBe(teams.b); // opponents
  });

  it('waits (returns null) while a 1v1 queue has only one player and time is short', () => {
    const q = managerWith(['a']);
    q.join('a', '1v1', 1000);
    expect(q.planMatch('1v1', 1000 + QUEUE_BOT_FILL_MS - 1)).toBeNull();
  });

  it('bot-fills a 1v1 once the lone queuer has waited past the threshold', () => {
    const q = managerWith(['a']);
    q.join('a', '1v1', 1000);
    const plan = q.planMatch('1v1', 1000 + QUEUE_BOT_FILL_MS);
    expect(plan).not.toBeNull();
    expect(plan!.humans).toHaveLength(1);
    expect(plan!.humans[0]!.team).toBe('blue');
    expect(plan!.botFill).toEqual({ blue: 0, red: 1 }); // one red bot opponent
  });

  it('keeps an invited party on the SAME team in a 2v2', () => {
    const q = managerWith(['p1', 'p2', 's1', 's2']);
    // The party (shared id) enqueued first so it lands together in blue.
    q.join('p1', '2v2', 1000, 'party-x');
    q.join('p2', '2v2', 1000, 'party-x');
    q.join('s1', '2v2', 1001);
    q.join('s2', '2v2', 1002);
    const plan = q.planMatch('2v2', 1003);
    expect(plan).not.toBeNull();
    expect(plan!.botFill).toEqual({ blue: 0, red: 0 });
    const teams = Object.fromEntries(plan!.humans.map((h) => [h.sessionId, h.team]));
    expect(teams.p1).toBe(teams.p2); // party stays together
  });

  it('removes matched players from the queue when a match forms', () => {
    const q = managerWith(['a', 'b']);
    q.join('a', '1v1', 1000);
    q.join('b', '1v1', 1000);
    q.planMatch('1v1', 1001);
    // Both consumed → a follow-up plan finds nobody.
    expect(q.planMatch('1v1', 1002)).toBeNull();
  });
});
