#!/usr/bin/env node
/**
 * Offline GLB compression for the character models.
 *
 * The rigged character GLBs ship raw (~70MB total; the zombies are 13–20MB each),
 * which is the biggest load-time / bandwidth / VRAM cost for players on weak or
 * metered connections. This shrinks them with the gltf-transform CLI:
 *   • textures → resized to 1024 max + WebP        (the bulk of the savings)
 *   • geometry → KHR_mesh_quantization             (smaller, native decode)
 *   • prune / dedup / weld                         (cleanup)
 *
 * Both WebP and mesh-quantization are decoded NATIVELY by three's GLTFLoader, so
 * no runtime decoder wiring is needed — the optimized GLBs just load.
 *
 * Workflow (run from apps/client):
 *   1. one-time: cp -R public/models/* models-src/      # keep the originals
 *   2. npm i -D @gltf-transform/cli
 *   3. npm run compress:models
 *   4. launch the game and eyeball the models (texture downscale is the one thing
 *      that can occasionally look off — bump --texture-size if so).
 *
 * Re-run any time you drop new source models into models-src/.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync, mkdirSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = 'models-src';
const OUT = 'public/models';
const MAX_TEXTURE = 1024;

/** Recursively collect every .glb under a directory. */
function findGlbs(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...findGlbs(p));
    else if (entry.name.toLowerCase().endsWith('.glb')) out.push(p);
  }
  return out;
}

const mb = (bytes) => (bytes / 1024 / 1024).toFixed(1) + 'MB';

const files = findGlbs(SRC);
if (files.length === 0) {
  console.error(
    `No .glb files in ${SRC}/. Put your original models there first:\n  cp -R ${OUT}/* ${SRC}/`,
  );
  process.exit(1);
}

let before = 0;
let after = 0;
for (const inPath of files) {
  const outPath = join(OUT, relative(SRC, inPath));
  mkdirSync(join(outPath, '..'), { recursive: true });
  const inSize = statSync(inPath).size;
  process.stdout.write(`• ${relative(SRC, inPath)} (${mb(inSize)}) → `);
  const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  execFileSync(
    npxCmd,
    [
      '--no-install',
      'gltf-transform',
      'optimize',
      inPath,
      outPath,
      '--texture-compress',
      'webp',
      '--texture-size',
      String(MAX_TEXTURE),
      '--compress',
      'quantize', // KHR_mesh_quantization — native decode, no runtime loader
      '--simplify',
      'false', // never decimate rigged meshes (would corrupt skin weights)
    ],
    { stdio: ['ignore', 'ignore', 'inherit'], shell: true },
  );
  const outSize = statSync(outPath).size;
  before += inSize;
  after += outSize;
  console.log(`${mb(outSize)}`);
}

console.log(
  `\nDone. ${mb(before)} → ${mb(after)} (${Math.round((1 - after / before) * 100)}% smaller).`,
);
