# Asset Pipeline (Phase 0.5)

A **completely free**, solo-friendly asset pipeline for the arena RPG — designed
so the game is fully playable _today_ with primitives and every asset is
swappable for real art _later_ without touching gameplay code.

Guiding priorities, in order:

1. **Fastest path to playable** — primitives only, zero art required to ship.
2. **Replaceability later** — gameplay references IDs; art is data behind them.
3. **Minimal art requirements** — no Blender, no rigging, no texturing to start.

---

## 0.5.1 — Recommended tools (all free)

| Need               | Tool                                    | Why                                                                 |
| ------------------ | --------------------------------------- | ------------------------------------------------------------------- |
| Characters / props | **Kenney.nl** (CC0), **Quaternius**     | Thousands of low-poly CC0 GLTF models, no attribution, no licensing |
| Rigged + animated  | **Mixamo** (free)                       | Auto-rig + a huge free animation library; export GLB                |
| Model tweaks       | **Blockbench** (free)                   | Box/voxel modeling in the browser, far gentler than Blender; glTF   |
| If Blender needed  | **Blender** (free) — optional only      | Last resort; the above avoid it entirely                            |
| Textures           | **ambientCG**, **Poly Haven** (CC0)     | CC0 PBR textures/HDRIs                                              |
| Audio (later)      | **freesound.org** (CC0 filter)          | SFX                                                                 |
| GLTF inspection    | **gltf.report**, **don mccurdy viewer** | Validate/optimize before import                                     |
| Optimization       | **gltf-transform** (CLI), **Draco**     | Compress meshes, dedupe, resize textures                            |

**Recommended free art order:** Kenney/Quaternius CC0 GLTF → Mixamo for any
character that needs animation → Blockbench only when you need a custom shape.
Blender stays optional the whole way.

### Workflow

```
Find CC0 model ──▶ (optional) Mixamo rig+anim ──▶ gltf-transform optimize
        │                                                    │
        └────────────▶ drop .glb in apps/client/public/models/<category>/
                                                             │
        Edit ONE registry entry: kind 'placeholder' → 'gltf' + url ◀┘
                                                             │
                              Game renders the new art. No gameplay changes.
```

### Naming conventions

- **Asset IDs** (what code uses): `category.name[.variant]`, lower-kebab —
  `char.warrior`, `char.npc.guard`, `weapon.sword`, `vfx.fireball`, `map.arena`,
  `prop.building.house`, `anim.idle`. Categories: `char weapon vfx map prop anim`.
- **Files** (what the registry points at, never code): mirror the id under
  `public/`, e.g. `char.warrior` → `public/models/characters/warrior.glb`.
- **GLTF animation clips**: PascalCase (`Idle`, `Walk`, `Attack`) and mapped to
  logical names in the descriptor's `clips`.

### Folder structure

```
apps/client/
├── public/                      # served as-is; the ONLY place files live
│   ├── models/{characters,weapons,props}/*.glb
│   ├── textures/*
│   └── hdri/*
└── src/
    ├── assets/                  # the registry + descriptor DATA (no Three.js)
    │   ├── registry.ts          # AssetRegistry singleton
    │   ├── CharacterFactory.ts  # class (+skin) → descriptor
    │   └── data/{characters,weapons,props,vfx,maps,animations}.ts
    └── render/                  # the registry's React Three Fiber renderers
        ├── geometry.tsx         # primitive shape → geometry element
        ├── AssetMesh.tsx        # THE seam: placeholder parts OR gltf
        ├── CharacterModel.tsx   # body + grip weapon + procedural idle
        ├── AssetInstance.tsx    # render anything by id (dispatch on category)
        ├── Vfx.tsx / VfxLayer.tsx
        └── MapView.tsx
```

The contract types live in `@arena/shared` (`assets.ts`) so the **server can
validate and replicate** ids/classes without importing any rendering code.

---

## 0.5.2 — Placeholder art strategy

The entire game is playable using only `box`, `sphere`, `capsule`, `cone`,
`cylinder`, and `torus` with `meshStandardMaterial`. A placeholder model is just
a list of primitive **parts** (`PlaceholderPart[]`) — data, not code — so the
same `<AssetMesh>` renders every character, weapon, prop, and effect.

| Entity       | Primitive recipe                                                   | Id                |
| ------------ | ------------------------------------------------------------------ | ----------------- |
| Warrior      | red capsule + steel box helmet + box pauldrons + sword             | `char.warrior`    |
| Mage         | blue capsule + sphere head + tall cone hat + glowing staff         | `char.mage`       |
| Archer       | green capsule + cone hood + cylinder quiver + torus bow            | `char.archer`     |
| Priest       | pale capsule + emissive torus halo + mace                          | `char.priest`     |
| Fireball     | emissive sphere core + translucent sphere flame (projectile)       | `vfx.fireball`    |
| Arrow        | thin cylinder shaft + cone tip (projectile)                        | `vfx.arrow`       |
| Arena portal | emissive torus ring + flattened translucent sphere surface (spins) | `vfx.portal`      |
| NPCs         | recolored capsule + headgear (guard cone helm / merchant box pack) | `char.npc.*`      |
| Buildings    | box walls + 4-segment cone roof + box door; cylinder+cone tower    | `prop.building.*` |

These are defined in `apps/client/src/assets/data/*.ts` and rendered by
`apps/client/src/render/AssetMesh.tsx`. There is no separate "placeholder
component" per entity — the data drives one generic renderer.

---

## 0.5.3 — Character Asset System

- **Interfaces** (`@arena/shared/assets.ts`): `RenderSource = PlaceholderModel |
GltfModel` is the replaceability seam. `CharacterDescriptor` references a
  `RenderSource`, an optional `weaponId`, and logical `animations`.
- **Renderer architecture**: `AssetMesh` switches on `RenderSource.kind` —
  primitives now, `useGLTF` later. `CharacterModel` composes body + grip weapon
  - procedural idle. Nothing above `AssetMesh` knows whether art exists.
- **Asset registry**: `assets` singleton; `getCharacter(id)` returns a visible
  magenta fallback on a bad id rather than crashing.
- **Character factory**: `resolveCharacter(class, skinId)` turns replicated
  gameplay state into a concrete (skin-modified) descriptor — the single bridge
  from "I'm a warrior" to an asset.
- **Multiplayer sync**: `Player` schema carries `characterClass` + `skinId`;
  the client resolves them to a descriptor. **No model references are ever sent
  over the wire or hardcoded** — only ids.
- **Skins**: `registerSkin()` layers recolors (by part name) or a full GLTF
  render swap over a base character. Example: `skin.warrior.gold`.

### Replacing a placeholder with real art

```ts
// apps/client/src/assets/data/characters.ts — change ONE field:
render: { kind: 'gltf', url: '/models/characters/warrior.glb',
          clips: { idle: 'Idle', walk: 'Walk', attack: 'Attack' } }
```

Drop `warrior.glb` in `public/models/characters/`. Done — no gameplay, network,
or scene code changes.

---

## 0.5.4 — Asset Registry system

A single `AssetRegistry` indexes **characters, animations, VFX, weapons, props,
and maps**, each by typed id (`char.* weapon.* vfx.* map.* prop.* anim.*`). The
game references ids exclusively:

- `AssetInstance` renders **anything** from an id by dispatching on its category.
- `MapView` builds a level from `MapDescriptor.props` — a list of
  `{ assetId, position, rotation }`, so maps are pure data placing things by
  reference (a portal, two guards, buildings, trees…).
- File paths exist only inside `GltfModel.url`, resolved at load time and never
  surfaced to gameplay.

See `apps/client/src/assets/registry.ts` for the implementation and
`apps/client/src/assets/data/` for all registered assets.
