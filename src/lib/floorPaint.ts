import type { FloorKind } from './finishes';

/**
 * The floors, painted: one square of each kind of floor in a given colour,
 * drawn on a canvas so that it repeats without a seam. The 3D view lays it
 * over the floor; the panel shows it as the swatch to pick. Nothing here is
 * a photograph: planks, blocks, tiles, chips and marbling are drawn from a
 * fixed run of random numbers, so a floor looks the same every time.
 */

type RGB = [number, number, number];

const rgb = (hex: string): RGB => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
const css = (c: RGB, a = 1) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;
/** Lighter (k > 0) or darker (k < 0): that share of the way to white or to black. */
const shade = (c: RGB, k: number): RGB => c.map((v) => (k >= 0 ? v + (255 - v) * k : v * (1 + k))) as RGB;
const brightness = (c: RGB) => (c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114) / 255;

/** A fixed run of random numbers in 0..1 (mulberry32). */
function run(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Ctx = CanvasRenderingContext2D;

/** Draws `draw` so that what runs over an edge of the square comes back in on the other side. */
function wrapped(ctx: Ctx, size: number, reach: number, x: number, y: number, draw: (x: number, y: number) => void) {
  for (const dx of [-size, 0, size]) {
    for (const dy of [-size, 0, size]) {
      const px = x + dx;
      const py = y + dy;
      if (px < -reach || px > size + reach || py < -reach || py > size + reach) continue;
      draw(px, py);
    }
  }
}

/** A fine grain over everything, lighter and darker by up to `amount` (0..1). */
function speckle(ctx: Ctx, size: number, amount: number, rand: () => number) {
  const image = ctx.getImageData(0, 0, size, size);
  const d = image.data;
  for (let i = 0; i < d.length; i += 4) {
    const k = 1 + (rand() - 0.5) * 2 * amount;
    d[i] = Math.min(255, d[i]! * k);
    d[i + 1] = Math.min(255, d[i + 1]! * k);
    d[i + 2] = Math.min(255, d[i + 2]! * k);
  }
  ctx.putImageData(image, 0, 0);
}

/** Soft clouds of lighter and darker, as in a poured or mottled surface. */
function clouds(ctx: Ctx, size: number, c: RGB, count: number, strength: number, rand: () => number) {
  for (let i = 0; i < count; i++) {
    const r = size * (0.06 + rand() * 0.24);
    const tone = shade(c, (rand() - 0.5) * 0.5);
    const alpha = strength * (0.5 + rand() * 0.5);
    wrapped(ctx, size, r, rand() * size, rand() * size, (x, y) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, css(tone, alpha));
      g.addColorStop(1, css(tone, 0));
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
    });
  }
}

/**
 * One piece of wood, `w` × `h` at (x, y), its grain running along x:
 * its own shade of the colour, darker and lighter streaks, a dark edge.
 */
function wood(ctx: Ctx, x: number, y: number, w: number, h: number, c: RGB, rand: () => number) {
  const tone = shade(c, (rand() - 0.5) * 0.13);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = css(tone);
  ctx.fillRect(x, y, w, h);
  const streaks = Math.max(4, Math.round(h / 2.2));
  for (let i = 0; i < streaks; i++) {
    const sy = y + rand() * h;
    const from = x + rand() * w * 0.6 - w * 0.1;
    const len = w * (0.3 + rand() * 0.8);
    const bend = (rand() - 0.5) * h * 0.25;
    ctx.strokeStyle = css(shade(tone, rand() < 0.7 ? -0.22 : 0.18), 0.1 + rand() * 0.16);
    ctx.lineWidth = 0.6 + rand() * 1.2;
    ctx.beginPath();
    ctx.moveTo(from, sy);
    ctx.quadraticCurveTo(from + len / 2, sy + bend, from + len, sy);
    ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = css(shade(c, -0.55), 0.3);
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

/** Planks 200 mm wide in a 2.4 m square, their ends staggered row by row. */
function planks(ctx: Ctx, size: number, c: RGB, rand: () => number) {
  const rows = 12;
  const h = size / rows;
  for (let r = 0; r < rows; r++) {
    let x = rand() * size;
    const end = x + size;
    while (x < end - 1) {
      let len = size * (0.38 + rand() * 0.37);
      if (end - (x + len) < size * 0.2) len = end - x; // no stub at the end of a row
      const seed = Math.floor(rand() * 1e9);
      // Twice, a square apart, each with the same grain: the plank that runs off the right edge comes back on the left.
      for (const at of [x, x - size]) wood(ctx, at, r * h, len, h, c, run(seed));
      x += len;
    }
  }
}

/**
 * Herringbone parquet: blocks of 100 × 400 mm, each butting the side of the
 * next. One lying block H and one standing block V repeat along (−a, a)
 * and (2b, 0); a 2.4 m square holds a whole number of both.
 */
function herringbone(ctx: Ctx, size: number, c: RGB) {
  const a = size / 24;
  const b = 4 * a;
  for (let m = -1; m <= 3; m++) {
    for (let k = -4; k <= 27; k++) {
      // The same block, a square up or along, must look the same: its looks hang on its place in the repeat.
      const id = (((k % 24) + 24) % 24) * 3 + (((m % 3) + 3) % 3);
      const ox = -k * a + m * 2 * b;
      const oy = k * a;
      if (ox + b > 0 && ox < size && oy + a > 0 && oy < size) wood(ctx, ox, oy, b, a, c, run(id * 2 + 11));
      const vx = ox + b;
      if (vx + a > 0 && vx < size && oy + b > 0 && oy < size) {
        // The standing block: a lying one, turned a quarter.
        ctx.save();
        ctx.translate(vx + a, oy);
        ctx.rotate(Math.PI / 2);
        wood(ctx, 0, 0, b, a, c, run(id * 2 + 12));
        ctx.restore();
      }
    }
  }
}

/** Poured concrete, 3 m of it: clouds, pores and a fine grain. */
function concrete(ctx: Ctx, size: number, c: RGB, rand: () => number) {
  ctx.fillStyle = css(c);
  ctx.fillRect(0, 0, size, size);
  clouds(ctx, size, c, 46, 0.11, rand);
  for (let i = 0; i < size * 0.6; i++) {
    ctx.fillStyle = css(shade(c, -0.45), 0.1 + rand() * 0.18);
    const r = 0.5 + rand() * 1.3;
    ctx.beginPath();
    ctx.arc(rand() * size, rand() * size, r, 0, Math.PI * 2);
    ctx.fill();
  }
  speckle(ctx, size, 0.035, rand);
}

/** Four tiles of 600 mm, each a little different, with their joints. */
function tiles(ctx: Ctx, size: number, c: RGB, rand: () => number) {
  const half = size / 2;
  for (const [tx, ty] of [[0, 0], [half, 0], [0, half], [half, half]] as const) {
    const tone = shade(c, (rand() - 0.5) * 0.07);
    ctx.save();
    ctx.beginPath();
    ctx.rect(tx, ty, half, half);
    ctx.clip();
    ctx.fillStyle = css(tone);
    ctx.fillRect(tx, ty, half, half);
    for (let i = 0; i < 14; i++) {
      const r = half * (0.15 + rand() * 0.4);
      const x = tx + rand() * half;
      const y = ty + rand() * half;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const cloud = shade(tone, (rand() - 0.5) * 0.3);
      g.addColorStop(0, css(cloud, 0.1));
      g.addColorStop(1, css(cloud, 0));
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
    ctx.restore();
  }
  speckle(ctx, size, 0.02, rand);
  // The joints, 4 mm of the 1.2 m: lighter on a dark tile, darker on a light one.
  const joint = Math.max(2, (size * 4) / 1200);
  ctx.fillStyle = css(brightness(c) < 0.45 ? shade(c, 0.3) : shade(c, -0.3));
  for (const at of [0, half]) {
    ctx.fillRect(at - joint / 2, 0, joint, size);
    ctx.fillRect(0, at - joint / 2, size, joint);
  }
  ctx.fillRect(size - joint / 2, 0, joint, size);
  ctx.fillRect(0, size - joint / 2, size, joint);
}

/** Linoleum, 2 m: short soft streaks all running much the same way, as it is rolled out. */
function linoleum(ctx: Ctx, size: number, c: RGB, rand: () => number) {
  ctx.fillStyle = css(c);
  ctx.fillRect(0, 0, size, size);
  clouds(ctx, size, c, 18, 0.06, rand);
  ctx.lineCap = 'round';
  for (let i = 0; i < size * 1.1; i++) {
    const angle = 0.35 + (rand() - 0.5) * 1.3;
    const len = size * (0.012 + rand() * 0.05);
    const dx = (Math.cos(angle) * len) / 2;
    const dy = (Math.sin(angle) * len) / 2;
    ctx.strokeStyle = css(shade(c, rand() < 0.55 ? 0.3 : -0.25), 0.08 + rand() * 0.12);
    ctx.lineWidth = 0.8 + rand() * 2.2;
    wrapped(ctx, size, len, rand() * size, rand() * size, (x, y) => {
      ctx.beginPath();
      ctx.moveTo(x - dx, y - dy);
      ctx.lineTo(x + dx, y + dy);
      ctx.stroke();
    });
  }
  speckle(ctx, size, 0.02, rand);
}

/** Terrazzo, 1.5 m: chips of stone, 6 to 24 mm across, in a ground of the colour. */
function terrazzo(ctx: Ctx, size: number, c: RGB, rand: () => number) {
  ctx.fillStyle = css(c);
  ctx.fillRect(0, 0, size, size);
  const dark = brightness(c) < 0.45;
  const stones: RGB[] = [shade(c, dark ? 0.75 : 0.6), rgb('#8B8B87'), rgb('#C9A26D'), rgb('#A5553D'), dark ? rgb('#C8C6C0') : rgb('#303134')];
  for (let i = 0; i < size * 0.62; i++) {
    const r = size * (0.004 + rand() * rand() * 0.014);
    const stone = stones[Math.floor(rand() * rand() * stones.length)]!;
    const corners = 5 + Math.floor(rand() * 3);
    const shape = Array.from({ length: corners }, (_, k) => {
      const t = ((k + rand() * 0.6) / corners) * Math.PI * 2;
      const d = r * (0.6 + rand() * 0.5);
      return [Math.cos(t) * d, Math.sin(t) * d] as const;
    });
    ctx.fillStyle = css(stone, 0.92);
    wrapped(ctx, size, r, rand() * size, rand() * size, (x, y) => {
      ctx.beginPath();
      shape.forEach(([sx, sy], k) => (k ? ctx.lineTo(x + sx, y + sy) : ctx.moveTo(x + sx, y + sy)));
      ctx.closePath();
      ctx.fill();
    });
  }
  speckle(ctx, size, 0.02, rand);
}

/** Carpet, 0.8 m: the pile as a close grain, in rows. */
function carpet(ctx: Ctx, size: number, c: RGB, rand: () => number) {
  ctx.fillStyle = css(c);
  ctx.fillRect(0, 0, size, size);
  const rows = 64;
  for (let r = 0; r < rows; r += 2) {
    ctx.fillStyle = css(shade(c, -0.25), 0.1);
    ctx.fillRect(0, (r * size) / rows, size, size / rows);
  }
  speckle(ctx, size, 0.11, rand);
}

/** How many pixels a side the painted square is, for the 3D view. */
export const PAINT_SIZE: Record<FloorKind, number> = {
  plain: 8,
  wood: 1024,
  herringbone: 1024,
  concrete: 1024,
  tiles: 512,
  linoleum: 1024,
  terrazzo: 1024,
  carpet: 512,
};

/** Paints one repeat of the floor on the canvas, filling it. */
export function paintFloor(canvas: HTMLCanvasElement, kind: FloorKind, color: string): void {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;
  const size = canvas.width;
  const c = rgb(color);
  const rand = run(1973);
  ctx.fillStyle = css(c);
  ctx.fillRect(0, 0, size, size);
  if (kind === 'wood') planks(ctx, size, c, rand);
  else if (kind === 'herringbone') herringbone(ctx, size, c);
  else if (kind === 'concrete') concrete(ctx, size, c, rand);
  else if (kind === 'tiles') tiles(ctx, size, c, rand);
  else if (kind === 'linoleum') linoleum(ctx, size, c, rand);
  else if (kind === 'terrazzo') terrazzo(ctx, size, c, rand);
  else if (kind === 'carpet') carpet(ctx, size, c, rand);
}

const swatches = new Map<string, string>();

/**
 * The floor as a small picture (a data URL) for a swatch in the panel.
 * Browser only; empty where there is no canvas to paint on.
 */
export function floorSwatch(kind: FloorKind, color: string, size = 160): string {
  const key = `${kind}|${color}|${size}`;
  const made = swatches.get(key);
  if (made !== undefined) return made;
  let url = '';
  if (typeof document !== 'undefined' && kind !== 'plain') {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    paintFloor(canvas, kind, color);
    url = canvas.toDataURL('image/jpeg', 0.82);
  }
  swatches.set(key, url);
  return url;
}
