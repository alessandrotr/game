import { ClientMessage, isPerkId, type ClientMessagePayloads } from '@arena/shared';
import type { ArenaRoom } from '../ArenaRoom.js';
import type { ArenaTuning } from './systems/tuning.js';
import type { CombatSystem } from './systems/combat.js';
import type { PerkSystem } from './systems/perks.js';

interface DevHandlerDeps {
  tuning: ArenaTuning;
  combat: CombatSystem;
  perkSystem: PerkSystem | undefined;
  setBotPopulation: (message: ClientMessagePayloads[ClientMessage.BotControl]) => void;
}

/**
 * Dev-only tuning + debug message handlers: live balance (movement / abilities /
 * stats), bot population, grant/clear perks, and add levels. The perk + level
 * handlers no-op in production so a crafted client can't cheat a live match.
 * Lifted out of ArenaRoom — it only needs the tuning/combat/perk systems and a
 * bot-population callback, none of the room's private internals.
 */
export function registerDevHandlers(room: ArenaRoom, deps: DevHandlerDeps): void {
  const { tuning, combat, perkSystem, setBotPopulation } = deps;

  room.onMessage(ClientMessage.DevTune, (_client, message: Record<string, unknown>) =>
    tuning.tuneMovement(message),
  );
  room.onMessage(
    ClientMessage.AbilityTune,
    (_client, message: ClientMessagePayloads[ClientMessage.AbilityTune]) =>
      tuning.tuneAbilities(message),
  );
  room.onMessage(
    ClientMessage.StatTune,
    (_client, message: ClientMessagePayloads[ClientMessage.StatTune]) =>
      tuning.tuneStats(message),
  );
  room.onMessage(
    ClientMessage.BotControl,
    (_client, message: ClientMessagePayloads[ClientMessage.BotControl]) =>
      setBotPopulation(message),
  );

  // Dev-only perk debugging. Ignored in production so a crafted client can't
  // grant itself perks in a live match.
  room.onMessage(
    ClientMessage.DevGrantPerk,
    (client, message: ClientMessagePayloads[ClientMessage.DevGrantPerk]) => {
      if (process.env.NODE_ENV === 'production' || !perkSystem) return;
      if (message?.action === 'clear') perkSystem.devClear(client.sessionId);
      else if (message?.action === 'grant' && isPerkId(message.perkId))
        perkSystem.devGrant(client.sessionId, message.perkId);
    },
  );

  // Dev-only: jump the caller up N levels (no-op in production).
  room.onMessage(
    ClientMessage.DevAddLevel,
    (client, message: ClientMessagePayloads[ClientMessage.DevAddLevel]) => {
      if (process.env.NODE_ENV === 'production') return;
      const player = room.state.players.get(client.sessionId);
      if (player) combat.devAddLevels(player, message?.amount ?? 1);
    },
  );
}
