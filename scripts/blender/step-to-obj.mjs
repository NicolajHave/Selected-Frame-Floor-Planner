/**
 * Converts a STEP file to OBJ (millimetres, as in the STEP), one object per
 * part, using OpenCascade (occt-import-js). Blender imports the OBJ; see
 * step_models.py.
 *
 *   node scripts/blender/step-to-obj.mjs in.step out.obj
 */

import fs from 'node:fs';
import occtImport from 'occt-import-js';

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error('usage: step-to-obj.mjs in.step out.obj');
  process.exit(1);
}

const occt = await occtImport();
const result = occt.ReadStepFile(new Uint8Array(fs.readFileSync(input)), {
  linearUnit: 'millimeter',
  linearDeflectionType: 'bounding_box_ratio',
  linearDeflection: 0.0004,
  angularDeflection: 0.4,
});
if (!result.success) throw new Error(`Could not read ${input}`);

const lines = [`# ${input}`];
let base = 1;
result.meshes.forEach((m, i) => {
  const name = (m.name || 'part').replace(/[^\w.-]+/g, '_');
  lines.push(`o ${String(i).padStart(3, '0')}_${name}`);
  const p = m.attributes.position.array;
  for (let k = 0; k < p.length; k += 3) lines.push(`v ${p[k]} ${p[k + 1]} ${p[k + 2]}`);
  const idx = m.index.array;
  for (let k = 0; k < idx.length; k += 3) lines.push(`f ${idx[k] + base} ${idx[k + 1] + base} ${idx[k + 2] + base}`);
  base += p.length / 3;
});
fs.writeFileSync(output, lines.join('\n') + '\n');
console.log(`${result.meshes.length} parts → ${output}`);
