/**
 * Warm point lights for the trailer park's burning barrels. Cheap (shadowless,
 * bounded distance) flickerless glows that pool firelight on the surrounding
 * junk — the gritty-night counterpart to the town's TownLights. Positions match
 * the `prop.arena.drum.fire` placements in assets/data/maps.ts; keep them in
 * sync so every flame has a light and every light a flame.
 */
const FIRE_BARRELS: [number, number, number][] = [
  [8, 1.4, 2],
  [-8, 1.4, -2],
  [13, 1.4, 9],
];

export function ArenaLights() {
  return (
    <>
      {FIRE_BARRELS.map(([x, y, z], i) => (
        <pointLight
          key={i}
          position={[x, y, z]}
          color="#ff7a3a"
          intensity={9}
          distance={9}
          decay={2}
        />
      ))}
    </>
  );
}
