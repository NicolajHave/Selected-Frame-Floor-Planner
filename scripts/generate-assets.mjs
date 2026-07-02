/**
 * Procedural GLB generator for the Selected Frame SIS catalog.
 *
 * Builds stylised 3D models (glTF 2.0 / GLB, metres, Y-up, origin at
 * centre-bottom) for every catalog item from its authoritative catalog
 * dimensions. Run with:
 *
 *   node scripts/generate-assets.mjs
 *
 * Output: public/assets/3d/<item-number>.glb
 *
 * The models are parametric approximations of the catalog renders —
 * tube frames, shelves, panels — not CAD imports. Swap any file for a
 * higher-fidelity export later; the floor planner only cares about the
 * file, not how it was made.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets', '3d');

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

// Metallic factors are kept low: the planner scene has no environment
// map, and full-metal PBR surfaces render near-black without one.
const MATERIALS = {
  steel:   { color: [0.76, 0.78, 0.79, 1], metallic: 0.35, roughness: 0.4  },
  oak:     { color: [0.78, 0.62, 0.42, 1], metallic: 0.0,  roughness: 0.7  },
  mint:    { color: [0.84, 0.89, 0.83, 1], metallic: 0.0,  roughness: 0.25 },
  mirror:  { color: [0.85, 0.88, 0.9, 1],  metallic: 0.5,  roughness: 0.08 },
  black:   { color: [0.08, 0.08, 0.09, 1], metallic: 0.2,  roughness: 0.4  },
  leather: { color: [0.16, 0.2, 0.16, 1],  metallic: 0.0,  roughness: 0.8  },
  carpet:  { color: [0.66, 0.61, 0.31, 1], metallic: 0.0,  roughness: 1.0  },
  beige:   { color: [0.89, 0.79, 0.66, 1], metallic: 0.0,  roughness: 0.8  },
  acrylic: { color: [0.93, 0.95, 0.96, 1], metallic: 0.0,  roughness: 0.1  },
  white:   { color: [0.95, 0.95, 0.93, 1], metallic: 0.1,  roughness: 0.5  },
};

// ---------------------------------------------------------------------------
// Geometry builders (all dimensions in mm; converted to metres on write)
// ---------------------------------------------------------------------------

/** Axis-aligned box centred at (cx, cy, cz). */
function boxAt(cx, cy, cz, w, h, d) {
  const x0 = cx - w / 2, x1 = cx + w / 2;
  const y0 = cy - h / 2, y1 = cy + h / 2;
  const z0 = cz - d / 2, z1 = cz + d / 2;
  const positions = [];
  const normals = [];
  const indices = [];
  const face = (verts, n) => {
    const base = positions.length / 3;
    for (const v of verts) positions.push(...v);
    for (let i = 0; i < 4; i++) normals.push(...n);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  face([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1]);   // +Z
  face([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1]);  // -Z
  face([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0]);   // +X
  face([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0]);  // -X
  face([[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], [0, 1, 0]);   // +Y
  face([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0]);  // -Y
  return { positions, normals, indices };
}

/** Elliptical cylinder centred at (cx, cy, cz); cy is the vertical centre. */
function cylAt(cx, cy, cz, rx, rz, h, seg = 28) {
  const positions = [];
  const normals = [];
  const indices = [];
  const y0 = cy - h / 2, y1 = cy + h / 2;
  // Side (smooth normals)
  const base = 0;
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    const c = Math.cos(a), s = Math.sin(a);
    const nx = c / rx, nz = s / rz;
    const nl = Math.hypot(nx, nz);
    positions.push(cx + rx * c, y0, cz + rz * s, cx + rx * c, y1, cz + rz * s);
    normals.push(nx / nl, 0, nz / nl, nx / nl, 0, nz / nl);
  }
  for (let i = 0; i < seg; i++) {
    const a = base + i * 2;
    indices.push(a, a + 2, a + 3, a, a + 3, a + 1);
  }
  // Caps (fan around centre)
  for (const [y, ny] of [[y1, 1], [y0, -1]]) {
    const centre = positions.length / 3;
    positions.push(cx, y, cz);
    normals.push(0, ny, 0);
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      positions.push(cx + rx * Math.cos(a), y, cz + rz * Math.sin(a));
      normals.push(0, ny, 0);
    }
    for (let i = 0; i < seg; i++) {
      if (ny > 0) indices.push(centre, centre + 1 + i + 1, centre + 1 + i);
      else indices.push(centre, centre + 1 + i, centre + 1 + i + 1);
    }
  }
  return { positions, normals, indices };
}

/** Ellipsoid centred at (cx, cy, cz). */
function ellipsoidAt(cx, cy, cz, rx, ry, rz, latSeg = 14, lonSeg = 20) {
  const positions = [];
  const normals = [];
  const indices = [];
  for (let lat = 0; lat <= latSeg; lat++) {
    const phi = (lat / latSeg) * Math.PI;
    const sp = Math.sin(phi), cp = Math.cos(phi);
    for (let lon = 0; lon <= lonSeg; lon++) {
      const theta = (lon / lonSeg) * Math.PI * 2;
      const st = Math.sin(theta), ct = Math.cos(theta);
      const x = rx * sp * ct, y = ry * cp, z = rz * sp * st;
      positions.push(cx + x, cy + y, cz + z);
      const nx = x / (rx * rx), ny = y / (ry * ry), nz = z / (rz * rz);
      const nl = Math.hypot(nx, ny, nz) || 1;
      normals.push(nx / nl, ny / nl, nz / nl);
    }
  }
  const row = lonSeg + 1;
  for (let lat = 0; lat < latSeg; lat++) {
    for (let lon = 0; lon < lonSeg; lon++) {
      const a = lat * row + lon;
      indices.push(a, a + row, a + row + 1, a, a + row + 1, a + 1);
    }
  }
  return { positions, normals, indices };
}

// ---------------------------------------------------------------------------
// GLB writer
// ---------------------------------------------------------------------------

function mergeByMaterial(parts) {
  const byMat = new Map();
  for (const { geo, mat } of parts) {
    if (!byMat.has(mat)) byMat.set(mat, { positions: [], normals: [], indices: [] });
    const g = byMat.get(mat);
    const offset = g.positions.length / 3;
    g.positions.push(...geo.positions);
    g.normals.push(...geo.normals);
    for (const i of geo.indices) g.indices.push(i + offset);
  }
  return byMat;
}

function writeGLB(filePath, parts) {
  const byMat = mergeByMaterial(parts);
  const matNames = [...byMat.keys()];

  const buffers = [];
  let byteOffset = 0;
  const bufferViews = [];
  const accessors = [];
  const primitives = [];

  const pushBuffer = (typedArray, target) => {
    // 4-byte alignment
    const pad = (4 - (byteOffset % 4)) % 4;
    if (pad) {
      buffers.push(Buffer.alloc(pad));
      byteOffset += pad;
    }
    const buf = Buffer.from(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength);
    const view = { buffer: 0, byteOffset, byteLength: buf.length, target };
    bufferViews.push(view);
    buffers.push(buf);
    byteOffset += buf.length;
    return bufferViews.length - 1;
  };

  for (const [mat, g] of byMat) {
    // mm -> metres
    const pos = new Float32Array(g.positions.map((v) => v / 1000));
    const nor = new Float32Array(g.normals);
    const idx = new Uint32Array(g.indices);

    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < pos.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        if (pos[i + k] < min[k]) min[k] = pos[i + k];
        if (pos[i + k] > max[k]) max[k] = pos[i + k];
      }
    }

    const posView = pushBuffer(pos, 34962);
    accessors.push({
      bufferView: posView, componentType: 5126, count: pos.length / 3, type: 'VEC3',
      min: [...min], max: [...max],
    });
    const posAcc = accessors.length - 1;

    const norView = pushBuffer(nor, 34962);
    accessors.push({ bufferView: norView, componentType: 5126, count: nor.length / 3, type: 'VEC3' });
    const norAcc = accessors.length - 1;

    const idxView = pushBuffer(idx, 34963);
    accessors.push({ bufferView: idxView, componentType: 5125, count: idx.length, type: 'SCALAR' });
    const idxAcc = accessors.length - 1;

    primitives.push({
      attributes: { POSITION: posAcc, NORMAL: norAcc },
      indices: idxAcc,
      material: matNames.indexOf(mat),
    });
  }

  const bin = Buffer.concat(buffers);

  const gltf = {
    asset: { version: '2.0', generator: 'sf-planner asset generator' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives }],
    materials: matNames.map((m) => ({
      name: m,
      pbrMetallicRoughness: {
        baseColorFactor: MATERIALS[m].color,
        metallicFactor: MATERIALS[m].metallic,
        roughnessFactor: MATERIALS[m].roughness,
      },
    })),
    accessors,
    bufferViews,
    buffers: [{ byteLength: bin.length }],
  };

  let json = Buffer.from(JSON.stringify(gltf), 'utf8');
  const jsonPad = (4 - (json.length % 4)) % 4;
  if (jsonPad) json = Buffer.concat([json, Buffer.alloc(jsonPad, 0x20)]);
  const binPad = (4 - (bin.length % 4)) % 4;
  const binPadded = binPad ? Buffer.concat([bin, Buffer.alloc(binPad)]) : bin;

  const total = 12 + 8 + json.length + 8 + binPadded.length;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); // 'glTF'
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(total, 8);
  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(json.length, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4); // 'JSON'
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(binPadded.length, 0);
  binHeader.writeUInt32LE(0x004e4942, 4); // 'BIN'

  fs.writeFileSync(filePath, Buffer.concat([header, jsonHeader, json, binHeader, binPadded]));
}

// ---------------------------------------------------------------------------
// Shared sub-assemblies. Coordinates: X = width, Y = up, Z = depth.
// Origin is centre in X/Z, floor at Y = 0.
// ---------------------------------------------------------------------------

const T = 30;      // frame tube, mm
const SHELF = 25;  // shelf board thickness, mm

/** Rectangular wall-unit frame standing against the back plane (-Z). */
function wallFrame(w, d, h) {
  const zBack = -d / 2 + T / 2;
  const px = w / 2 - T / 2;
  return [
    { geo: boxAt(-px, h / 2, zBack, T, h, T), mat: 'steel' },
    { geo: boxAt(px, h / 2, zBack, T, h, T), mat: 'steel' },
    { geo: boxAt(0, h - T / 2, zBack, w - 2 * T, T, T), mat: 'steel' },
    { geo: boxAt(0, T / 2, zBack, w - 2 * T, T, T), mat: 'steel' },
    // top arms projecting forward + feet plates
    { geo: boxAt(-px, h - T / 2, 0, T, T, d - T), mat: 'steel' },
    { geo: boxAt(px, h - T / 2, 0, T, T, d - T), mat: 'steel' },
    { geo: boxAt(-px, 5, d * 0.05, 60, 10, d * 0.8), mat: 'steel' },
    { geo: boxAt(px, 5, d * 0.05, 60, 10, d * 0.8), mat: 'steel' },
  ];
}

/** Horizontal hang rail across the inner width. */
function rail(w, y, z = 0) {
  return [{ geo: boxAt(0, y, z, w - 2 * T, T, T), mat: 'steel' }];
}

/** Oak shelf board across the inner width. */
function shelfBoard(w, d, y, cx = 0, boardW = null) {
  const bw = boardW ?? w - 2 * T;
  return [{ geo: boxAt(cx, y, T / 4, bw, SHELF, d - T * 1.5), mat: 'oak' }];
}

/** Evenly spread shelf heights. */
function shelfHeights(count, top = 1900, bottom = 350) {
  const res = [];
  for (let i = 0; i < count; i++) res.push(bottom + (i * (top - bottom)) / Math.max(1, count - 1));
  return res;
}

/** Floor-rack frame: two uprights, top + bottom rails, T-feet. */
function rackFrame(w, d, h, { sign = false } = {}) {
  const px = w / 2 - T / 2;
  const parts = [
    { geo: boxAt(-px, h / 2, 0, T, h, T), mat: 'steel' },
    { geo: boxAt(px, h / 2, 0, T, h, T), mat: 'steel' },
    { geo: boxAt(0, h - T / 2, 0, w - 2 * T, T, T), mat: 'steel' },
    { geo: boxAt(0, T * 1.5, 0, w - 2 * T, T, T), mat: 'steel' },
    { geo: boxAt(-px, 4, 0, 80, 8, d), mat: 'steel' },
    { geo: boxAt(px, 4, 0, 80, 8, d), mat: 'steel' },
  ];
  if (sign) {
    parts.push({ geo: boxAt(px, h + 150, 0, 12, 300, 10), mat: 'steel' });
    parts.push({ geo: boxAt(px, h + 170, 0, 148.5, 210, 6), mat: 'acrylic' });
  }
  return parts;
}

/** Column of oak shelves inside a rack. */
function rackShelfColumn(cx, d, boardW, heights) {
  const parts = [];
  for (const y of heights) {
    parts.push({ geo: boxAt(cx, y, 0, boardW, SHELF, d - 60), mat: 'oak' });
  }
  // column uprights
  parts.push({ geo: boxAt(cx - boardW / 2, heights[heights.length - 1] / 2 + 100, 0, T * 0.7, heights[heights.length - 1] + 200, T * 0.7), mat: 'steel' });
  parts.push({ geo: boxAt(cx + boardW / 2, heights[heights.length - 1] / 2 + 100, 0, T * 0.7, heights[heights.length - 1] + 200, T * 0.7), mat: 'steel' });
  return parts;
}

// ---------------------------------------------------------------------------
// Recipes — one per catalog item. Dimensions from the SIS catalog (rev 1).
// ---------------------------------------------------------------------------

const RECIPES = {
  // ---- WALL UNITS (H 2288) ----
  '105-99-003': () => [...wallFrame(1496, 434, 2288), ...rail(1496, 1950)],
  '105-99-004': () => {
    const parts = wallFrame(1496, 517, 2288);
    for (const y of shelfHeights(4, 1850, 350)) parts.push(...shelfBoard(1496, 517, y));
    return parts;
  },
  '105-99-005': () => [
    ...wallFrame(1496, 517, 2288),
    ...rail(1496, 1950),
    ...shelfBoard(1496, 517, 380),
  ],
  '105-99-006': () => [...wallFrame(1496, 542, 2288), ...rail(1496, 1950), ...rail(1496, 1000)],
  '105-99-007': () => [
    ...wallFrame(1496, 434, 2288),
    ...rail(1496, 1950),
    { geo: boxAt(-380, 800, -60, 450, 1500, 25), mat: 'mirror' },
  ],
  '105-99-008': () => {
    const parts = [...wallFrame(1496, 529.5, 2288), ...rail(1496, 2000)];
    // steel cabinet block
    parts.push({ geo: boxAt(-360, 1100, 0, 20, 1600, 450), mat: 'steel' });
    parts.push({ geo: boxAt(360, 1100, 0, 20, 1600, 450), mat: 'steel' });
    for (let i = 0; i < 6; i++) {
      parts.push({ geo: boxAt(0, 350 + i * 300, 0, 700, 18, 440), mat: 'steel' });
    }
    return parts;
  },
  '105-99-009': () => [
    ...wallFrame(1496, 445, 2288),
    { geo: boxAt(0, 1300, 0, 850, 1450, 60), mat: 'black' },
  ],
  '105-99-010': () => {
    const parts = wallFrame(810, 517, 2288);
    for (const y of shelfHeights(4, 1850, 350)) parts.push(...shelfBoard(810, 517, y));
    return parts;
  },
  '105-99-011': () => [...wallFrame(810, 389, 2288), ...rail(810, 1950), ...rail(810, 1000)],
  '105-99-012': () => [...wallFrame(810, 389, 2288), ...rail(810, 1950)],

  // ---- RACKS ----
  '105-06-001': () => rackFrame(1310, 500, 1758, { sign: true }),
  '105-06-002': () => rackFrame(800, 500, 1758, { sign: true }),
  '105-06-010': () => [
    ...rackFrame(1310, 500, 1758, { sign: true }),
    ...rackShelfColumn(1310 / 2 - 330, 500, 600, shelfHeights(4, 1550, 350)),
  ],
  '105-06-011': () => [
    ...rackFrame(1310, 500, 1758, { sign: true }),
    ...rackShelfColumn(-300, 500, 550, shelfHeights(4, 1550, 350)),
    ...rackShelfColumn(300, 500, 550, shelfHeights(4, 1550, 350)),
  ],
  '105-06-013': () => {
    const parts = rackFrame(1300, 500, 1752, { sign: true });
    for (const cx of [-425, 0, 425]) {
      parts.push(...rackShelfColumn(cx, 500, 400, shelfHeights(4, 1550, 350)));
    }
    return parts;
  },
  '105-06-014': () => rackFrame(1310, 500, 1708),
  '105-06-014-700': () => rackFrame(800, 500, 1708),
  '105-06-011-22-C': () => [
    { geo: boxAt(0, 30, 0, 12, 60, 10), mat: 'steel' },
    { geo: boxAt(0, 180, 0, 148.5, 290, 6), mat: 'acrylic' },
    { geo: boxAt(0, 40, 0, 180, 16, 19.6), mat: 'steel' },
  ],

  // ---- PODIUMS ----
  '105-09-001': () => [{ geo: cylAt(0, 375, 0, 225, 225, 750), mat: 'mint' }],
  '105-09-002': () => [{ geo: boxAt(0, 275, 0, 400, 550, 400), mat: 'oak' }],
  '105-09-003': () => [{ geo: boxAt(0, 200, 0, 400, 400, 400), mat: 'oak' }],

  // ---- LOGOS (wall-mounted) ----
  '105-13-001': () => [{ geo: boxAt(0, 112.5, 0, 1200, 225, 20), mat: 'white' }],
  '105-13-015': () => [{ geo: boxAt(0, 112.5, 0, 1200, 225, 20), mat: 'steel' }],
  '105-13-LED': () => [{ geo: boxAt(0, 112.5, 0, 1200, 225, 20), mat: 'white' }],

  // ---- ACCESSORIES ----
  '105-13-023': () => [
    { geo: boxAt(0, 4, 0, 148, 8, 50), mat: 'steel' },
    { geo: boxAt(0, 109, 0, 148, 202, 4), mat: 'steel' },
  ],
  '105-15-002': () => [
    { geo: boxAt(-368, 754, 0, 20, 1508, 20), mat: 'steel' },
    { geo: boxAt(368, 754, 0, 20, 1508, 20), mat: 'steel' },
    { geo: boxAt(-368, 4, 0, 80, 8, 500), mat: 'steel' },
    { geo: boxAt(368, 4, 0, 80, 8, 500), mat: 'steel' },
    { geo: boxAt(0, 830, 0, 700, 1300, 15), mat: 'steel' },
  ],
  '105-15-001': () => [
    { geo: boxAt(0, 14, 0, 420, 28, 275), mat: 'leather' },
  ],
  '105-15-003': () => [{ geo: boxAt(0, 35, 0, 287, 70, 287), mat: 'oak' }],
  '105-15-004': () => [{ geo: boxAt(0, 35, 0, 469, 70, 287), mat: 'oak' }],
  '105-18-001': () => [{ geo: boxAt(0, 25.6, 0, 180, 51.2, 241), mat: 'steel' }],

  // ---- TABLES ----
  '105-17-001': () => [
    { geo: boxAt(0, 215, 0, 1800, 430, 1280), mat: 'steel' },
    { geo: boxAt(0, 442, 0, 1800, 25, 1280), mat: 'oak' },
    { geo: boxAt(0, 630, -320, 1800, 355, 640), mat: 'steel' },
    { geo: boxAt(0, 815 - 12, -320, 1800, 25, 640), mat: 'oak' },
  ],
  '105-17-007': () => [
    { geo: cylAt(0, 180, 0, 300, 300, 360), mat: 'mint' },
    { geo: cylAt(0, 505, 0, 632, 600, 290, 40), mat: 'mint' },
  ],

  // ---- MANNEQUINS ----
  '112-18-001': () => [
    { geo: cylAt(0, 6, 0, 180, 180, 12), mat: 'steel' },
    { geo: cylAt(0, 400, 0, 10, 10, 780), mat: 'steel' },
    { geo: ellipsoidAt(0, 1120, 0, 185, 380, 120), mat: 'beige' },
  ],
  '112-18-002': () => [
    { geo: cylAt(0, 6, 0, 180, 180, 12), mat: 'steel' },
    { geo: cylAt(0, 400, 0, 10, 10, 780), mat: 'steel' },
    { geo: ellipsoidAt(0, 1140, 0, 210, 390, 130), mat: 'beige' },
  ],

  // ---- CARPETS ----
  '105-19-001': () => [{ geo: cylAt(0, 12.5, 0, 1212, 1404.5, 25, 48), mat: 'carpet' }],
};

// ---------------------------------------------------------------------------

fs.mkdirSync(OUT_DIR, { recursive: true });
let total = 0;
for (const [id, recipe] of Object.entries(RECIPES)) {
  const file = path.join(OUT_DIR, `${id}.glb`);
  writeGLB(file, recipe());
  const kb = fs.statSync(file).size / 1024;
  total += kb;
  console.log(`${id}.glb  ${kb.toFixed(1)} kB`);
}
console.log(`\n${Object.keys(RECIPES).length} models, ${(total / 1024).toFixed(2)} MB total`);
