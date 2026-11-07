'use client';

import { flatten, type FlatDrawing } from './flatten';
import type { Crop } from '../planImport';

export type { FlatDrawing } from './flatten';

export const isCad = (file: File) => /\.(dwg|dxf)$/i.test(file.name);

/** Reads a DWG (LibreDWG) or DXF (dxf-parser) and flattens it for drawing. */
export async function readCadFile(file: File): Promise<FlatDrawing> {
  if (/\.dxf$/i.test(file.name)) {
    const { readDxf } = await import('./fromDxf');
    return flatten(await readDxf(await file.text()));
  }
  const { readWithLibreDwg } = await import('./fromDwg');
  return flatten(await readWithLibreDwg(await file.arrayBuffer(), 'dwg'));
}

/** Longest side of a rendered CAD underlay, px: lines stay crisp at shop scale. */
export const CAD_MAX_SIDE = 3200;

/**
 * Draws the drawing's `crop` (fractions of its bounds, from the top left)
 * as dark lines on white. Returns a JPEG, its aspect (height / width) and
 * the real width it covers, in mm (at `unitMm` millimetres per drawing unit).
 */
export function renderCad(d: FlatDrawing, crop: Crop | null, maxSide = CAD_MAX_SIDE, unitMm = d.unitMm) {
  const b = d.bounds;
  const c = crop ?? { x: 0, y: 0, w: 1, h: 1 };
  const W = b.maxX - b.minX;
  const H = b.maxY - b.minY;
  // The window in drawing units (y up), from the crop (y down).
  const x0 = b.minX + c.x * W;
  const x1 = x0 + c.w * W;
  const y1 = b.maxY - c.y * H;
  const y0 = y1 - c.h * H;
  const s = maxSide / Math.max(x1 - x0, y1 - y0);
  const w = Math.max(1, Math.round((x1 - x0) * s));
  const h = Math.max(1, Math.round((y1 - y0) * s));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#1b1d1f';
  ctx.lineWidth = Math.max(1, maxSide / 2400);
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (const p of d.paths) {
    // Skip what is wholly outside the window.
    let inside = false;
    for (let i = 0; i < p.length && !inside; i += 2) {
      if (p[i]! >= x0 && p[i]! <= x1 && p[i + 1]! >= y0 && p[i + 1]! <= y1) inside = true;
    }
    if (!inside && p.length > 4) {
      // Long lines can cross the window with both ends outside: check the box.
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (let i = 0; i < p.length; i += 2) {
        minX = Math.min(minX, p[i]!); maxX = Math.max(maxX, p[i]!);
        minY = Math.min(minY, p[i + 1]!); maxY = Math.max(maxY, p[i + 1]!);
      }
      if (maxX < x0 || minX > x1 || maxY < y0 || minY > y1) continue;
    } else if (!inside) {
      const [ax, ay, bx, by] = [p[0]!, p[1]!, p[2]!, p[3]!];
      if (Math.max(ax, bx) < x0 || Math.min(ax, bx) > x1 || Math.max(ay, by) < y0 || Math.min(ay, by) > y1) continue;
    }
    ctx.moveTo((p[0]! - x0) * s, (y1 - p[1]!) * s);
    for (let i = 2; i < p.length; i += 2) ctx.lineTo((p[i]! - x0) * s, (y1 - p[i + 1]!) * s);
  }
  ctx.stroke();
  ctx.fillStyle = '#3a3d40';
  ctx.textBaseline = 'alphabetic';
  for (const t of d.texts) {
    const px = t.h * s;
    if (px < 3 || t.x < x0 || t.x > x1 || t.y < y0 || t.y > y1) continue;
    ctx.save();
    ctx.translate((t.x - x0) * s, (y1 - t.y) * s);
    ctx.rotate(-t.rot);
    ctx.font = `${px}px sans-serif`;
    ctx.fillText(t.text, 0, 0);
    ctx.restore();
  }
  return {
    src: canvas.toDataURL('image/jpeg', 0.85),
    aspect: h / w,
    widthMm: (x1 - x0) * unitMm,
  };
}
