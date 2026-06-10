/**
 * Entity-based combat core (Phase 7).
 *
 * Pure functions over a minimal `CombatEntity` shape — no Colyseus, no room, no
 * networking. The authoritative `Player` schema satisfies `CombatEntity`
 * structurally, so `ArenaRoom` delegates the stat math here; future combatants
 * (NPCs, destructibles) reuse the exact same rules. Keeping it pure makes it
 * unit-testable and the single source of truth for HP/mana/death.
 *
 * Callers own side effects (broadcasting events, scheduling respawns); these
 * functions only mutate the entity and report what happened.
 */

/** The combat-relevant fields any combatant exposes. */
export interface CombatEntity {
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  alive: boolean;
}

export interface DamageResult {
  /** HP actually removed after clamping (0 if none). */
  applied: number;
  /** True if this blow brought the entity to 0 HP (and flipped `alive`). */
  lethal: boolean;
}

/** Apply damage, clamping at 0 HP and flipping `alive` on a lethal blow. */
export function applyDamage(entity: CombatEntity, amount: number): DamageResult {
  if (!entity.alive || amount <= 0) return { applied: 0, lethal: false };
  const before = entity.hp;
  entity.hp = Math.max(0, entity.hp - amount);
  const applied = before - entity.hp;
  const lethal = entity.hp <= 0;
  if (lethal) entity.alive = false;
  return { applied, lethal };
}

/** Restore HP, clamping at `maxHp`. Returns the amount actually healed. */
export function applyHeal(entity: CombatEntity, amount: number): number {
  if (!entity.alive || amount <= 0) return 0;
  const before = entity.hp;
  entity.hp = Math.min(entity.maxHp, entity.hp + amount);
  return entity.hp - before;
}

/** Spend mana if the entity can afford it. Returns false (and spends nothing)
 *  when it can't. */
export function spendMana(entity: CombatEntity, cost: number): boolean {
  if (cost <= 0) return true;
  if (entity.mana < cost) return false;
  entity.mana -= cost;
  return true;
}

/** Regenerate mana over `dt` seconds, clamped at `maxMana`. */
export function regenMana(entity: CombatEntity, perSecond: number, dt: number): void {
  if (!entity.alive) return;
  entity.mana = Math.min(entity.maxMana, entity.mana + perSecond * dt);
}

/** Restore an entity to full HP/mana and mark it alive (respawn / spawn). */
export function reviveFull(entity: CombatEntity): void {
  entity.hp = entity.maxHp;
  entity.mana = entity.maxMana;
  entity.alive = true;
}
