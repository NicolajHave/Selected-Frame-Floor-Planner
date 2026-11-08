/**
 * Finds the room around a click on a plan picture: the lines of the plan
 * are walls, the room is the free space reached from the click. Gaps up to
 * a chosen width (doors, openings) are closed first, so the fill stays in
 * the room; the result is the room's inside outline as a simple polygon.
 *
 * Works on any plan picture (PDF page, image, DWG/DXF rendering): a grey
 * image `lum` (0 = black … 255 = white), `w` × `h` pixels.
 */

export interface GreyImage {
  lum: Uint8Array | Uint8ClampedArray;
  w: number;
  h: number;
}

export interface TraceOptions {
  /** Close gaps in the drawing up to this many pixels wide. */
  closePx: number;
  /** Simplify the outline to within this many pixels. */
  tolerancePx: number;
  /** Darker than this counts as a drawn line. */
  ink?: number;
}

export interface TraceResult {
  /** The room's inside outline, pixel coordinates, counter-clockwise or clockwise. */
  polygon: { x: number; y: number }[];
  /** The fill ran to the edge of the picture: there is an opening wider than `closePx`. */
  leaked: boolean;
  /** Area inside, in pixels. */
  areaPx: number;
}

/** Binary dilation with a (2r+1)-square, as two running-window passes. */
export function dilate(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  if (r <= 0) return mask.slice();
  const tmp = new Uint8Array(w * h);
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let count = 0;
    // Window [x - r, x + r]
    for (let x = 0; x < Math.min(r, w); x++) count += mask[row + x]!;
    for (let x = 0; x < w; x++) {
      const add = x + r;
      if (add < w) count += mask[row + add]!;
      const drop = x - r - 1;
      if (drop >= 0) count -= mask[row + drop]!;
      tmp[row + x] = count > 0 ? 1 : 0;
    }
  }
  for (let x = 0; x < w; x++) {
    let count = 0;
    for (let y = 0; y < Math.min(r, h); y++) count += tmp[y * w + x]!;
    for (let y = 0; y < h; y++) {
      const add = y + r;
      if (add < h) count += tmp[add * w + x]!;
      const drop = y - r - 1;
      if (drop >= 0) count -= tmp[drop * w + x]!;
      out[y * w + x] = count > 0 ? 1 : 0;
    }
  }
  return out;
}

/** 4-connected flood fill of `free` cells from `seed`; returns the filled mask and whether it hit the border. */
function flood(free: Uint8Array, w: number, h: number, seed: number) {
  const out = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  let top = 0;
  let leaked = false;
  out[seed] = 1;
  stack[top++] = seed;
  while (top > 0) {
    const i = stack[--top]!;
    const x = i % w;
    const y = (i - x) / w;
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1) leaked = true;
    if (x > 0 && free[i - 1] && !out[i - 1]) (out[i - 1] = 1), (stack[top++] = i - 1);
    if (x < w - 1 && free[i + 1] && !out[i + 1]) (out[i + 1] = 1), (stack[top++] = i + 1);
    if (y > 0 && free[i - w] && !out[i - w]) (out[i - w] = 1), (stack[top++] = i - w);
    if (y < h - 1 && free[i + w] && !out[i + w]) (out[i + w] = 1), (stack[top++] = i + w);
  }
  return { mask: out, leaked };
}

/** Fills the holes of `region` (furniture and text drawn inside the room). */
function fillHoles(region: Uint8Array, w: number, h: number): Uint8Array {
  // Everything not in the region that the border reaches is outside.
  const notRegion = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) notRegion[i] = region[i] ? 0 : 1;
  const outside = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  let top = 0;
  const push = (i: number) => {
    if (notRegion[i] && !outside[i]) {
      outside[i] = 1;
      stack[top++] = i;
    }
  };
  for (let x = 0; x < w; x++) push(x), push((h - 1) * w + x);
  for (let y = 0; y < h; y++) push(y * w), push(y * w + w - 1);
  while (top > 0) {
    const i = stack[--top]!;
    const x = i % w;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (i >= w) push(i - w);
    if (i < (h - 1) * w) push(i + w);
  }
  const out = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = outside[i] ? 0 : 1;
  return out;
}

/**
 * The outer boundary of a filled mask as a list of pixel corners, walking
 * the cracks between filled and empty pixels (so a 1-pixel room still has
 * an area). Starts at the top-left filled pixel.
 */
function outline(mask: Uint8Array, w: number, h: number): { x: number; y: number }[] {
  const at = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] === 1;
  let start = -1;
  for (let i = 0; i < w * h; i++) {
    if (mask[i]) {
      start = i;
      break;
    }
  }
  if (start < 0) return [];
  const sx = start % w;
  const sy = (start - sx) / w;
  // Walk corners (x, y) with the filled pixel on the right-hand side.
  // Directions: 0 right, 1 down, 2 left, 3 up.
  const dx = [1, 0, -1, 0];
  const dy = [0, 1, 0, -1];
  // Pixel to the right of travel and to the left, for a step from corner (x, y) in direction d.
  const right = (x: number, y: number, d: number) =>
    d === 0 ? at(x, y) : d === 1 ? at(x - 1, y) : d === 2 ? at(x - 1, y - 1) : at(x, y - 1);
  const left = (x: number, y: number, d: number) =>
    d === 0 ? at(x, y - 1) : d === 1 ? at(x, y) : d === 2 ? at(x - 1, y) : at(x - 1, y - 1);
  const pts: { x: number; y: number }[] = [];
  let x = sx;
  let y = sy;
  let d = 0;
  const limit = 4 * (w + 1) * (h + 1);
  for (let k = 0; k < limit; k++) {
    pts.push({ x, y });
    // Prefer turning left (outer boundary, clockwise in screen space), then straight, then right.
    for (const turn of [3, 0, 1, 2]) {
      const nd = (d + turn) % 4;
      if (right(x, y, nd) && !left(x, y, nd)) {
        d = nd;
        break;
      }
    }
    x += dx[d]!;
    y += dy[d]!;
    if (x === sx && y === sy) break;
  }
  return pts;
}

/** Douglas–Peucker on a closed ring. */
export function simplify(ring: { x: number; y: number }[], eps: number): { x: number; y: number }[] {
  if (ring.length < 4) return ring;
  // Split at the two points farthest apart so the ring becomes two open chains.
  let a = 0;
  let b = 0;
  let best = -1;
  const step = Math.max(1, Math.floor(ring.length / 200));
  for (let i = 0; i < ring.length; i += step) {
    for (let j = i + 1; j < ring.length; j += step) {
      const d = (ring[i]!.x - ring[j]!.x) ** 2 + (ring[i]!.y - ring[j]!.y) ** 2;
      if (d > best) (best = d), (a = i), (b = j);
    }
  }
  const chain = (from: number, to: number) => {
    const out: { x: number; y: number }[] = [];
    for (let i = from; ; i = (i + 1) % ring.length) {
      out.push(ring[i]!);
      if (i === to) break;
    }
    return out;
  };
  const dp = (pts: { x: number; y: number }[]): { x: number; y: number }[] => {
    if (pts.length < 3) return pts;
    const p = pts[0]!;
    const q = pts[pts.length - 1]!;
    const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
    let worst = 0;
    let at = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const r = pts[i]!;
      const d = Math.abs((q.x - p.x) * (p.y - r.y) - (p.x - r.x) * (q.y - p.y)) / len;
      if (d > worst) (worst = d), (at = i);
    }
    if (worst <= eps) return [p, q];
    return [...dp(pts.slice(0, at + 1)).slice(0, -1), ...dp(pts.slice(at))];
  };
  const first = dp(chain(a, b));
  const second = dp(chain(b, a));
  return [...first.slice(0, -1), ...second.slice(0, -1)];
}

/** Removes corners that barely turn (nearly straight runs left by pixel steps). */
function dropStraight(pts: { x: number; y: number }[], minTurnDeg = 8): { x: number; y: number }[] {
  let out = pts;
  for (let pass = 0; pass < 3; pass++) {
    const next = out.filter((p, i) => {
      const a = out[(i - 1 + out.length) % out.length]!;
      const b = out[(i + 1) % out.length]!;
      const t1 = Math.atan2(p.y - a.y, p.x - a.x);
      const t2 = Math.atan2(b.y - p.y, b.x - p.x);
      let turn = Math.abs(t2 - t1) % (Math.PI * 2);
      if (turn > Math.PI) turn = Math.PI * 2 - turn;
      return (turn * 180) / Math.PI >= minTurnDeg;
    });
    if (next.length === out.length || next.length < 3) break;
    out = next;
  }
  return out;
}

/**
 * The room around one or more clicks (several clicks add their areas
 * together: handy when furniture drawn in the room splits it up).
 */
export function traceRoom(
  img: GreyImage,
  seeds: { x: number; y: number } | { x: number; y: number }[],
  opts: TraceOptions,
): TraceResult | null {
  const { lum, w, h } = img;
  const list = Array.isArray(seeds) ? seeds : [seeds];
  const inkLevel = opts.ink ?? 170;
  const ink = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) ink[i] = lum[i]! < inkLevel ? 1 : 0;
  // Half the gap on each side closes a gap of closePx.
  const r = Math.max(0, Math.round(opts.closePx / 2));
  const walls = dilate(ink, w, h, r);
  const free = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) free[i] = walls[i] ? 0 : 1;

  const filled = new Uint8Array(w * h);
  let leaked = false;
  let any = false;
  for (const seed of list) {
    const start = nearestFree(free, w, h, seed, 4 * (r + 3));
    if (start < 0 || filled[start]) continue;
    const f = flood(free, w, h, start);
    leaked ||= f.leaked;
    any = true;
    for (let i = 0; i < w * h; i++) if (f.mask[i]) filled[i] = 1;
  }
  if (!any) return null;
  // Back out to the walls' faces: grow by what the walls were grown by, then fill furniture holes.
  const grown = dilate(filled, w, h, r);
  for (let i = 0; i < w * h; i++) if (ink[i]) grown[i] = 0;
  // Areas from separate clicks are one room: join them across anything narrower than the gap
  // (a line, a corridor beside furniture), keeping the walls' faces where they are.
  const joined = list.length > 1 ? close(grown, w, h, Math.max(r, 3)) : grown;
  const room = fillHoles(joined, w, h);
  let area = 0;
  for (let i = 0; i < w * h; i++) area += room[i]!;
  const ring = outline(largestPart(room, w, h), w, h);
  if (ring.length < 4) return null;
  const polygon = dropStraight(simplify(ring, opts.tolerancePx));
  return polygon.length >= 3 ? { polygon, leaked, areaPx: area } : null;
}

/** The free pixel nearest to `seed` within `reach`, or -1. */
function nearestFree(free: Uint8Array, w: number, h: number, seed: { x: number; y: number }, reach: number) {
  const sx = Math.round(seed.x);
  const sy = Math.round(seed.y);
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) return -1;
  if (free[sy * w + sx]) return sy * w + sx;
  for (let rad = 1; rad < reach; rad++) {
    for (let oy = -rad; oy <= rad; oy++) {
      for (let ox = -rad; ox <= rad; ox++) {
        if (Math.max(Math.abs(ox), Math.abs(oy)) !== rad) continue;
        const x = sx + ox;
        const y = sy + oy;
        if (x >= 0 && y >= 0 && x < w && y < h && free[y * w + x]) return y * w + x;
      }
    }
  }
  return -1;
}

/** Morphological closing with a (2r+1)-square: fills gaps and notches narrower than 2r + 1. */
function close(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const grown = dilate(mask, w, h, r);
  const inv = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) inv[i] = grown[i] ? 0 : 1;
  const back = dilate(inv, w, h, r);
  const out = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = back[i] ? 0 : 1;
  return out;
}

/** Keeps the largest connected part (4-connected). */
function largestPart(mask: Uint8Array, w: number, h: number): Uint8Array {
  const label = new Int32Array(w * h);
  const stack = new Int32Array(w * h);
  let best = 0;
  let bestLabel = 0;
  let next = 0;
  for (let s = 0; s < w * h; s++) {
    if (!mask[s] || label[s]) continue;
    next++;
    let top = 0;
    let size = 0;
    label[s] = next;
    stack[top++] = s;
    while (top > 0) {
      const i = stack[--top]!;
      size++;
      const x = i % w;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i >= w ? i - w : -1, i < (h - 1) * w ? i + w : -1]) {
        if (j >= 0 && mask[j] && !label[j]) {
          label[j] = next;
          stack[top++] = j;
        }
      }
    }
    if (size > best) {
      best = size;
      bestLabel = next;
    }
  }
  const out = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = label[i] === bestLabel ? 1 : 0;
  return out;
}

/** Moves a polygon's edges outwards by `d` (mitred corners): from a room's inside face to its walls' centre line. */
export function outset(pts: { x: number; y: number }[], d: number): { x: number; y: number }[] {
  const n = pts.length;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % n]!;
    area += a.x * b.y - b.x * a.y;
  }
  const sign = area >= 0 ? -1 : 1; // outward normals
  const normal = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: (sign * -(b.y - a.y)) / len, y: (sign * (b.x - a.x)) / len };
  };
  return pts.map((p, i) => {
    const prev = pts[(i - 1 + n) % n]!;
    const next = pts[(i + 1) % n]!;
    const n1 = normal(prev, p);
    const n2 = normal(p, next);
    const dot = n1.x * n2.x + n1.y * n2.y;
    if (1 + dot < 1e-6) return { x: p.x + n1.x * d, y: p.y + n1.y * d };
    const k = d / (1 + dot);
    return { x: p.x + (n1.x + n2.x) * k, y: p.y + (n1.y + n2.y) * k };
  });
}
