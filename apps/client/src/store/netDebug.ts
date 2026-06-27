/**
 * Tiny dev switch for the movement net-debug view: a red ghost drawn where the
 * SERVER says the local player is, next to where the screen shows them. When the
 * two drift apart you can see the rubber-band happen (and whether it's during the
 * walk or only on stop). Toggle with F10. Non-reactive (read in useFrame).
 */
let on = false;

export function isNetDebug(): boolean {
  return on;
}

export function toggleNetDebug(): boolean {
  on = !on;
  return on;
}
