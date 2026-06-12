/**
 * Warm point lights for the trailer park's burning barrels. Cheap (shadowless,
 * bounded distance) flickerless glows that pool firelight on the surrounding
 * junk — the gritty-night counterpart to the town's TownLights. The barrel
 * positions come from the per-match generated layout (the `prop.arena.drum.fire`
 * placements), so every flame tracks its barrel wherever it landed this match.
 */
export function ArenaLights({ barrels }: { barrels: [number, number, number][] }) {
  return (
    <>
      {barrels.map(([x, , z], i) => (
        <pointLight
          key={i}
          position={[x, 1.4, z]}
          color="#ff7a3a"
          intensity={9}
          distance={9}
          decay={2}
        />
      ))}
    </>
  );
}
