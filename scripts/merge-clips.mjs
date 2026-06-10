/**
 * Merge several single-clip GLBs that share one skeleton into a single GLB with
 * named animation clips. The base file contributes the mesh + skin; each extra's
 * animation is transplanted onto the base skeleton, matching bones by node name.
 *
 * Usage:
 *   node scripts/merge-clips.mjs <out.glb> \
 *     base=<file.glb>:<ClipName> \
 *     add=<file.glb>:<ClipName> [add=...]
 *
 * Bone-name reconciliation: a node name in an extra is matched to the base by an
 * exact match first, then by ':'->'_' normalization (Mixamo colon/underscore).
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

const args = process.argv.slice(2);
const out = args.shift();
let basePart = null;
const addParts = [];
for (const a of args) {
  const [kind, rest] = a.split('=', 2);
  const idx = rest.lastIndexOf(':');
  const file = rest.slice(0, idx);
  const clip = rest.slice(idx + 1);
  if (kind === 'base') basePart = { file, clip };
  else if (kind === 'add') addParts.push({ file, clip });
}
if (!out || !basePart) throw new Error('need <out.glb> base=<file>:<Clip> [add=...]');

const base = await io.read(basePart.file);
const baseRoot = base.getRoot();

// Name the base's own clip.
const baseAnims = baseRoot.listAnimations();
if (baseAnims.length === 0) throw new Error(`${basePart.file} has no animation`);
// Keep only the first animation; drop any others to avoid duplicate locomotion.
baseAnims.slice(1).forEach((a) => a.dispose());
baseAnims[0].setName(basePart.clip);

// Index base nodes by name (and by normalized name) for bone matching.
const byName = new Map();
const byNorm = new Map();
const norm = (s) => s.replace(/:/g, '_');
for (const n of baseRoot.listNodes()) {
  byName.set(n.getName(), n);
  byNorm.set(norm(n.getName()), n);
}
const matchNode = (name) => byName.get(name) ?? byNorm.get(norm(name)) ?? null;

const buffer = baseRoot.listBuffers()[0];

for (const part of addParts) {
  const src = await io.read(part.file);
  const srcAnim = src.getRoot().listAnimations()[0];
  if (!srcAnim) {
    console.warn(`! ${part.file} has no animation, skipping`);
    continue;
  }
  const dst = base.createAnimation(part.clip);
  let mapped = 0;
  let missed = 0;
  for (const ch of srcAnim.listChannels()) {
    const srcNode = ch.getTargetNode();
    if (!srcNode) continue;
    const dstNode = matchNode(srcNode.getName());
    if (!dstNode) {
      missed++;
      continue;
    }
    const s = ch.getSampler();
    const input = base
      .createAccessor()
      .setType(s.getInput().getType())
      .setArray(s.getInput().getArray().slice())
      .setBuffer(buffer);
    const output = base
      .createAccessor()
      .setType(s.getOutput().getType())
      .setArray(s.getOutput().getArray().slice())
      .setBuffer(buffer);
    const sampler = base
      .createAnimationSampler()
      .setInput(input)
      .setOutput(output)
      .setInterpolation(s.getInterpolation());
    dst.addSampler(sampler);
    dst.addChannel(
      base.createAnimationChannel().setTargetNode(dstNode).setTargetPath(ch.getTargetPath()).setSampler(sampler),
    );
    mapped++;
  }
  console.log(`+ ${part.clip}: mapped ${mapped} channels${missed ? `, missed ${missed}` : ''}`);
}

console.log('final clips:', baseRoot.listAnimations().map((a) => a.getName()));
console.log('skins:', baseRoot.listSkins().length);
await io.write(out, base);
console.log('wrote', out);
