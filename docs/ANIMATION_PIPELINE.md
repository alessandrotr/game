# Animation Pipeline (Mixamo → GLB → React Three Fiber)

This is the free, drop-in workflow for replacing the procedural placeholder
characters with rigged, animated models. The gameplay code never changes — you
only add a `.glb` and flip one descriptor (see [Wiring it in](#3-wiring-it-in)).

It complements [ASSET_PIPELINE.md](./ASSET_PIPELINE.md), which covers the general
"placeholder → GLTF" seam. This doc is specifically about **skinned characters
with animation clips**.

The engine drives five logical animation states — `idle`, `run`, `attack`,
`cast`, `die` (plus an optional `hit` flinch and `walk`). The animation **state
machine** (`apps/client/src/render/animation/animationStateMachine.ts`) decides
which logical name plays; the **controller**
(`apps/client/src/render/animation/useCharacterAnimator.ts`) maps that name to a
real GLTF clip. Your job in this pipeline is to produce a GLB whose clips can be
mapped to those logical names.

---

## 1. Folder structure

```
apps/client/public/
  models/
    characters/
      warrior.glb     # one skinned mesh + embedded named clips
      mage.glb
      archer.glb
      priest.glb
    weapons/          # (optional) static GLBs, no skeleton needed
    props/
```

`public/` is served at the site root, so `public/models/characters/warrior.glb`
loads from `/models/characters/warrior.glb`.

Each character is **one GLB** containing a single skinned mesh and all of its
animation clips, named exactly:

| Logical name | Clip name in GLB |
| ------------ | ---------------- |
| idle         | `Idle`           |
| run          | `Run`            |
| attack       | `Attack`         |
| cast         | `Cast`           |
| die          | `Die`            |
| hit (opt.)   | `Hit`            |
| walk (opt.)  | `Walk`           |

(The exact clip names are arbitrary — you map them in the descriptor — but
keeping them consistent across classes makes the descriptors copy-pasteable.)

---

## 2. Import process

### A. Download from Mixamo (free, CC-friendly)

1. Go to <https://www.mixamo.com> and pick a character (or upload your own rig).
2. Download the **base model once, with skin**: choose an Idle animation →
   *Download* → Format **FBX Binary (.fbx)**, *With Skin*.
3. For every other animation (Run, Attack, Cast, Death), download **Without
   Skin** — you only need the motion curves; the skeleton already matches.
   - Mixamo names: "Idle", "Running", a melee swing for Attack, a spellcast for
     Cast, and "Dying"/"Death" for die.

### B. Merge clips into one GLB (Blender — recommended)

1. Import the *with-skin* FBX (`File → Import → FBX`).
2. Import each *without-skin* FBX onto the same armature. Each becomes an Action
   in the NLA / Action Editor.
3. Rename the Actions to `Idle`, `Run`, `Attack`, `Cast`, `Die` (and `Hit`),
   and mark each "Fake User" (the shield icon) so the exporter keeps them.
4. Export `File → Export → glTF 2.0 (.glb)`:
   - Format: **glTF Binary (.glb)**
   - Include: **Selected Objects** (the armature + mesh)
   - Animation: **enabled**, export **all actions** (NLA strips / "Group by
     NLA Track" or "Export all Actions" depending on Blender version).
   - Apply transforms; +Y up.
5. Save as `apps/client/public/models/characters/<class>.glb`.

### C. Alternative: FBX2glTF CLI (no Blender)

If each Mixamo FBX already contains its single clip, convert and you'll get one
clip per file. To get one multi-clip GLB you still need to merge (Blender or a
glTF tool). For a quick start you can instead keep clips in separate files and
extend the descriptor's clip resolution — but the single-GLB path above is the
supported one.

```bash
# one clip per file
FBX2glTF -b -i Idle.fbx -o warrior_idle.glb
```

### D. Optimize (optional but recommended)

```bash
npx gltf-transform optimize warrior.glb warrior.glb --texture-compress webp
```

Keep characters low-poly (a few thousand tris) and textures ≤ 1K for the
low-poly fantasy look.

---

## 3. Wiring it in

Edit the character's descriptor in
`apps/client/src/assets/data/characters.ts`. Flip its `render` from a
`placeholder` to a `gltf` source and map the logical animation names to your
clip names:

```ts
// Before — primitive placeholder
render: { kind: 'placeholder', parts: [ /* boxes & capsules */ ] },

// After — rigged GLB
render: {
  kind: 'gltf',
  url: '/models/characters/warrior.glb',
  scale: 1,
  clips: {
    idle: 'Idle',
    run: 'Run',
    walk: 'Walk',
    attack: 'Attack',
    cast: 'Cast',
    hit: 'Hit',
    die: 'Die',
  },
},
```

**That is the only change.** No gameplay, networking, or state-machine code is
touched:

- `CharacterModel` detects `kind: 'gltf'` and renders the rigged path
  (`GltfCharacter`), which clones the scene per instance (so N players don't
  share one skeleton) and binds `useAnimations`.
- The animation **state machine** keeps emitting logical names from movement and
  combat events exactly as before.
- The **controller** (`useGltfAnimator`) crossfades to the clip named in
  `clips`, looping locomotion and clamping one-shots; a missing clip falls back
  to `Idle` so the character never freezes.

Cosmetic skins work the same way: a skin can supply its own `render` (a
different GLB) via `CharacterFactory`, and the animation layer follows the new
descriptor with no other changes.

---

## 4. R3F integration reference

The contract lives in two files:

- `apps/client/src/render/AssetMesh.tsx` — the GLTF seam. Loads with `useGLTF`
  and **clones with `SkeletonUtils.clone`** (multi-instance safety).
- `apps/client/src/render/CharacterModel.tsx` — `GltfCharacter` binds
  `useAnimations(animations, root)` to the cloned instance and feeds the
  controller.

Preload (optional) for a hitch-free first cast:

```ts
import { useGLTF } from '@react-three/drei';
useGLTF.preload('/models/characters/warrior.glb');
```

### Gotchas

- **Always clone** skinned GLTFs — the cached `useGLTF` scene is shared; render
  it directly and the same mesh teleports between players. (Already handled.)
- **Weapons** currently mount on the character root, not a hand bone. For a
  rigged model, either bake the weapon into the GLB or extend `WeaponMount` to
  attach to a named bone (`scene.getObjectByName('mixamorigRightHand')`).
- Mixamo rigs are ~100× or in cm in some exports — set `scale` in the descriptor
  (start at `1`, adjust to ~1.8 world units tall).
