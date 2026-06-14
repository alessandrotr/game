import { type Client } from '@colyseus/core';
import {
  EMOTE_MS,
  ClientMessage,
  ServerMessage,
  getCosmetic,
  isEmote,
  type ClientMessagePayloads,
} from '@arena/shared';
import type { ArenaState, Player } from './schema.js';
import { BaseGameRoom } from './BaseGameRoom.js';
import { computeAnimState, type AnimOneShot } from '../animation.js';
import type { ChatLog } from '../chat.js';
import { MAX_NAME_LENGTH } from './util/identity.js';
import { clamp } from './util/locomotion.js';

/**
 * The shared "walkable avatar" room: a space where players move (point-and-click),
 * jump, emote and chat over the {@link ArenaState} schema. Both the combat
 * {@link ArenaRoom} and the social TownRoom extend this — it owns the locomotion
 * state and the six avatar message handlers, leaving each subclass to add its own
 * world rules (combat for the arena, persistence for the town) and its own
 * `update` loop. The variation points (movement bounds, jump force, whether a
 * player can currently act, what a move order cancels) are exposed as overridable
 * hooks below.
 */
export abstract class AvatarRoom extends BaseGameRoom<ArenaState> {
  /** Active move destination per session (cleared on arrival/death/cast). */
  protected readonly destinations = new Map<string, { x: number; z: number }>();
  protected readonly verticalVelocity = new Map<string, number>();
  protected readonly grounded = new Map<string, boolean>();
  /** Transient one-shot animation (emote/cast/attack/hit) asserted per player. */
  protected readonly animOneShots = new Map<string, AnimOneShot>();
  /** Accumulated simulation time in ms. */
  protected simTime = 0;

  /** The room's chat log (ephemeral for the arena, persisted for the town). */
  protected abstract readonly chat: ChatLog;

  // --- Overridable world rules ------------------------------------------

  /** Half the playable area minus the player radius (the movement clamp bound). */
  protected abstract readonly halfLimit: number;

  /** The upward impulse a jump applies (a constant in town, tunable in the arena). */
  protected abstract jumpForce(): number;

  /** Whether a player may currently issue move/jump/emote orders (the arena
   *  requires being alive; the town always allows it). */
  protected canControl(player: Player): boolean {
    return player.alive;
  }

  /** Hook run when a player issues a manual move order (the arena cancels any
   *  auto-attack; the town does nothing). */
  protected onMoveOrder(_sessionId: string): void {}

  // --- Shared handlers ---------------------------------------------------

  /** Register the six avatar message handlers. Each concrete room calls this
   *  from its `onCreate` (after `setState`). */
  protected registerAvatarHandlers(): void {
    this.onMessage<{ x: number; z: number }>(ClientMessage.MoveTo, (client, message) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || !this.canControl(player)) return;
      const limit = this.halfLimit;
      const x = Number.isFinite(message?.x) ? clamp(message.x, -limit, limit) : player.x;
      const z = Number.isFinite(message?.z) ? clamp(message.z, -limit, limit) : player.z;
      this.onMoveOrder(client.sessionId);
      this.destinations.set(client.sessionId, { x, z });
    });

    this.onMessage(ClientMessage.StopMove, (client) => {
      this.destinations.delete(client.sessionId);
    });

    this.onMessage(ClientMessage.Jump, (client) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || !this.canControl(player)) return;
      if (this.grounded.get(client.sessionId)) {
        this.verticalVelocity.set(client.sessionId, this.jumpForce());
        this.grounded.set(client.sessionId, false);
      }
    });

    this.onMessage<{ name: string }>(ClientMessage.SetName, (client, message) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      const name = String(message?.name ?? '')
        .trim()
        .slice(0, MAX_NAME_LENGTH);
      if (name.length > 0) player.name = name;
    });

    this.onMessage<{ text: string }>(ClientMessage.Chat, (client, message) => {
      const player = this.state.players.get(client.sessionId);
      this.chat.handle(this, client.sessionId, player?.name ?? 'Adventurer', message?.text);
    });

    this.onMessage<{ emote: string }>(ClientMessage.Emote, (client, message) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || !this.canControl(player) || !isEmote(message?.emote)) return;
      this.animOneShots.set(client.sessionId, {
        name: message.emote,
        until: this.simTime + EMOTE_MS,
      });
    });

    // Live appearance update — replicates skin/dye/title to everyone in the room
    // the instant the player equips. Persistence is the client's HTTP PUT; this
    // only mutates the replicated schema, so it accepts any valid cosmetic id of
    // the right type (ownership is enforced where the loadout is saved).
    this.onMessage<ClientMessagePayloads[ClientMessage.EquipLoadout]>(
      ClientMessage.EquipLoadout,
      (client, message) => {
        const player = this.state.players.get(client.sessionId);
        if (!player) return;
        const skin = getCosmetic(String(message?.skinId ?? ''));
        // A skin must match this player's class to apply.
        player.skinId =
          skin?.type === 'skin' && skin.characterClass === player.characterClass ? skin.id : '';
        player.dyeId = getCosmetic(String(message?.dyeId ?? ''))?.type === 'dye' ? message.dyeId : '';
        player.pedestalId =
          getCosmetic(String(message?.pedestalId ?? ''))?.type === 'pedestal' ? message.pedestalId : '';
        player.titleId =
          getCosmetic(String(message?.titleId ?? ''))?.type === 'title' ? message.titleId : '';
      },
    );
  }

  // --- Shared lifecycle / sim helpers ------------------------------------

  /** Greet a freshly joined client (session id + world seed) and send chat history. */
  protected sendWelcome(client: Client): void {
    client.send(ServerMessage.Welcome, {
      sessionId: client.sessionId,
      worldSeed: this.roomId.length,
    });
    this.chat.sendHistory(client);
  }

  /** Clear the avatar state every walkable room keeps per session. Subclasses
   *  call this from `removeClient`, then add their own cleanup. */
  protected baseRemove(sessionId: string): void {
    this.state.players.delete(sessionId);
    this.destinations.delete(sessionId);
    this.verticalVelocity.delete(sessionId);
    this.grounded.delete(sessionId);
    this.animOneShots.delete(sessionId);
    this.chat.forget(sessionId);
  }

  /** Resolve a living player's animation for this tick: a dance is cancelled by
   *  movement (a combat pose is not), then `computeAnimState` picks run/idle/pose. */
  protected resolveAvatarAnim(player: Player, sessionId: string, moving: boolean): void {
    const active = this.animOneShots.get(sessionId);
    if (active && moving && isEmote(active.name)) this.animOneShots.delete(sessionId);
    player.animState = computeAnimState({
      alive: player.alive,
      moving,
      oneShot: this.animOneShots.get(sessionId) ?? null,
      now: this.simTime,
    });
  }
}
