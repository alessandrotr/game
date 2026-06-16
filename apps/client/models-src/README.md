# Source models (uncompressed originals)

Put the **original, full-quality** character GLBs here, mirroring the layout under
`public/models/` (e.g. `models-src/characters/zombie-fat.glb`).

`npm run compress:models` reads every `.glb` in this folder and writes an
optimized copy to the matching path under `public/models/` (resized + WebP
textures, quantized geometry). The game serves the optimized copies from
`public/`; these originals are the masters you re-compress from.

## One-time setup

```bash
cd apps/client
cp -R public/models/* models-src/      # seed this folder from the current models
npm i -D @gltf-transform/cli           # the compressor (bundles the encoders)
npm run compress:models                # writes optimized GLBs into public/models/
```

Then launch the game and check the models still look right (the texture downscale
is the only step that can occasionally look off — raise `MAX_TEXTURE` in
`scripts/compress-models.mjs` if a model needs more detail).

Keep this folder out of the shipped build — it's tooling input, not a runtime
asset. Commit the originals here if you want them version-controlled, or add
`models-src/` to `.gitignore` if they're large and tracked elsewhere.
