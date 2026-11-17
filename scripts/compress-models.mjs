// Shrinks the 3D models in public/assets/3d without changing how they look:
// identical data is stored once, vertices that coincide are welded, positions
// are stored to 0.1 mm (KHR_mesh_quantization, 14 bits over the model's
// size) and the buffers are packed with meshopt (EXT_meshopt_compression).
// The planner decodes them with three's MeshoptDecoder.
//
//   node scripts/compress-models.mjs [file.glb ...]     (default: every model)
//
// Run it after scripts/blender/build.py. Models that are already packed are
// left alone, so it is safe to run again.

import { readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets', '3d');
const files = process.argv.length > 2
  ? process.argv.slice(2)
  : readdirSync(dir).filter((f) => f.endsWith('.glb')).map((f) => join(dir, f));

await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

let before = 0;
let after = 0;
for (const file of files) {
  const size = statSync(file).size;
  const doc = await io.read(file);
  const packed = doc.getRoot().listExtensionsUsed().some((e) => e.extensionName === EXTMeshoptCompression.EXTENSION_NAME);
  if (packed) {
    before += size;
    after += size;
    continue;
  }
  await doc.transform(
    dedup(),
    prune(),
    weld(),
    // 'medium' keeps positions to 14 bits of the model's size: 0.14 mm on a 2.3 m wall unit.
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );
  await io.write(file, doc);
  const now = statSync(file).size;
  before += size;
  after += now;
  console.log(`${file.split('/').pop()}: ${(size / 1024).toFixed(0)} → ${(now / 1024).toFixed(0)} kB`);
}
console.log(`total: ${(before / 1048576).toFixed(1)} → ${(after / 1048576).toFixed(1)} MB`);
