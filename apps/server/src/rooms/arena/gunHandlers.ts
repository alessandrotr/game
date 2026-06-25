import type { Client } from '@colyseus/core';
import {
  ClientMessage,
  isGunView,
  isStunned,
  isBlinded,
  type ClientMessagePayloads,
  type GunView,
} from '@arena/shared';
import type { ArenaRoom } from '../ArenaRoom.js';
import type { GunSystem } from './systems/guns.js';
import { normalizeAim } from './combatMath.js';

/**
 * Gun-mode-zombie message handlers (fire / switch / reload / aim / view). Lifted
 * out of ArenaRoom and registered only when the mode `usesGuns`. Takes the room
 * (for `onMessage` + `state`, both public on a Colyseus room) plus the gun system
 * and the per-player view map — so it needs none of the room's private internals.
 */
export function registerGunHandlers(
  room: ArenaRoom,
  guns: GunSystem,
  gunViews: Map<string, GunView>,
): void {
  room.onMessage(
    ClientMessage.FireWeapon,
    (client: Client, message: ClientMessagePayloads[ClientMessage.FireWeapon]) => {
      const player = room.state.players.get(client.sessionId);
      if (!player || !player.alive || isStunned(player) || isBlinded(player)) return;
      const { dirX, dirZ } = normalizeAim(player, message?.dirX, message?.dirZ);
      guns.fire(player, dirX, dirZ);
    },
  );

  room.onMessage(
    ClientMessage.SwitchWeapon,
    (client: Client, message: ClientMessagePayloads[ClientMessage.SwitchWeapon]) => {
      const player = room.state.players.get(client.sessionId);
      if (!player || !player.alive) return;
      guns.switchTo(player, Math.floor(Number(message?.slot)));
    },
  );

  room.onMessage(ClientMessage.ReloadWeapon, (client: Client) => {
    const player = room.state.players.get(client.sessionId);
    if (!player || !player.alive || isStunned(player)) return;
    guns.reload(player);
  });

  room.onMessage(
    ClientMessage.AimWeapon,
    (client: Client, message: ClientMessagePayloads[ClientMessage.AimWeapon]) => {
      const player = room.state.players.get(client.sessionId);
      if (!player || !player.alive) return;
      const dx = Number(message?.dirX) || 0;
      const dz = Number(message?.dirZ) || 0;
      if (Math.hypot(dx, dz) < 1e-3) return;
      player.rotation = Math.atan2(dx, dz);
    },
  );

  room.onMessage(
    ClientMessage.SetGunView,
    (client: Client, message: ClientMessagePayloads[ClientMessage.SetGunView]) => {
      if (isGunView(message?.view)) gunViews.set(client.sessionId, message.view);
    },
  );
}
