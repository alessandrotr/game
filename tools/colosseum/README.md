# Colosseum arena generator

Procedural Blender pipeline for the **FFA / ranked arena** (`apps/client/public/models/colosseum.glb`).
Everything is code — change a number, re-run. Supersedes the old `tools/blender_arena_gen.py`.

```bash
/Applications/Blender.app/Contents/MacOS/Blender -b -P tools/colosseum/gen.py   # headless: never touches an open Blender session
pnpm --filter @arena/shared build
```

Optional env: `COLOSSEUM_GLB`, `COLOSSEUM_TS`, `COLOSSEUM_PNG` (writes an EEVEE preview render).

## What it writes

| Output | Purpose |
| ------ | ------- |
| `apps/client/public/models/colosseum.glb` | Visuals, textured (sand floor r=30, 7 seating tiers, outer wall, 4 gates, gold-trimmed cross paths, sun dais, columns, cover, braziers, banners). Game coordinates, Y-up, 1 unit = 1 m. |
| `packages/shared/src/colosseum.ts` | **Generated** — collision circles, spawn ring, flame anchors. Built from the same placement tables as the meshes, so visuals and collision can't drift. |

## How it plugs into the game

- `generateArenaLayout(seed, zombieMode=false)` returns the fixed colosseum layout: `COLOSSEUM_OBSTACLES` + an invisible ring of 104 circles just outside the floor edge (the parapet). Movement, pathfinding, bots and projectiles all already collide against the obstacle list, so no special bounds code.
- FFA/ranked bounds are the colosseum's bounding square (`modes.ts`); spawns come from `colosseumSpawnsForTeam` (blue +Z, red −Z). Zombie survival is unchanged (rectangular courtyard + room expansion).
- Client: `scene/ColosseumArena.tsx` loads the glb, adds flickering point lights at `COLOSSEUM_FLAMES`.

## Editing

Placement tables live in `build_props()` (positions are Blender coords: +Y = north gate; game `z = -y`).
Spawns are auto-picked with ≥ 3.2 m clearance from cover — the generator asserts if a layout leaves no room.
Mesh object names matter to the client: `Floor_*`/`Dais*` only receive shadows, `Flames*` cast none.

## Textures

`textures.py` procedurally generates tileable albedo + normal JPGs into `tools/colosseum/tex/` (warm marble with gold-grey veins, honey limestone ashlar, limestone paving slabs, sand, cloth; wood/timber/dirt are copied from the lobby set). `gen.py` runs it automatically when `tex/` is missing — delete the folder to regenerate. Materials are declared in `MATS` (`tex=(albedo, metres-per-tile, normal)`); UVs are projected in world space (box projection, cylindrical on the round walls/tiers) so texel density is uniform everywhere.
