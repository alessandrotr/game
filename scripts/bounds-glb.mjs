import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(process.argv[2]);
const root = doc.getRoot();

// Compute mesh-space bounds from position accessors (ignores skinning pose).
let min = [Infinity, Infinity, Infinity];
let max = [-Infinity, -Infinity, -Infinity];
for (const mesh of root.listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute('POSITION');
    if (!pos) continue;
    const a = pos.getArray();
    for (let i = 0; i < a.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k], a[i + k]);
        max[k] = Math.max(max[k], a[i + k]);
      }
    }
  }
}
console.log('clips:', root.listAnimations().map((a) => a.getName()));
console.log('min:', min.map((v) => v.toFixed(3)));
console.log('max:', max.map((v) => v.toFixed(3)));
console.log('size:', max.map((v, i) => (v - min[i]).toFixed(3)));
