'use client';

import type { PlanUnderlay } from '@/model/project';
import type { Point } from '@/model/geometry';
import type { Mm } from '@/model/units';
import { traceRoom, type GreyImage } from './wallTrace';

/** Longest side the plan picture is traced at, px: fine enough, and quick. */
const TRACE_SIDE = 2000;
/** Outline accuracy, mm (or 1.5 px, whichever is more). */
const TOLERANCE_MM = 40;

const cache = new Map<string, Promise<GreyImage>>();

/** The underlay picture as greys, at tracing size (cached per picture). */
function grey(src: string): Promise<GreyImage> {
  let p = cache.get(src);
  if (!p) {
    p = new Promise<GreyImage>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, TRACE_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(1, Math.round(img.naturalWidth * k));
        const h = Math.max(1, Math.round(img.naturalHeight * k));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        const rgba = ctx.getImageData(0, 0, w, h).data;
        const lum = new Uint8Array(w * h);
        for (let i = 0; i < w * h; i++) {
          lum[i] = (rgba[i * 4]! * 299 + rgba[i * 4 + 1]! * 587 + rgba[i * 4 + 2]! * 114) / 1000;
        }
        resolve({ lum, w, h });
      };
      img.onerror = () => reject(new Error('The plan picture could not be read.'));
      img.src = src;
    });
    // Keep only the latest plan.
    cache.clear();
    cache.set(src, p);
  }
  return p;
}

export interface UnderlayTrace {
  /** The room's inside outline, world mm; null when the click found no room. */
  points: Point[] | null;
  leaked: boolean;
  areaM2: number;
}

/** Traces the room around `world` on the underlay, closing openings up to `gapMm`. */
export async function traceUnderlayAt(u: PlanUnderlay, world: Point[], gapMm: number): Promise<UnderlayTrace> {
  const img = await grey(u.src);
  const mmPerPx = u.width / img.w;
  const seeds = world.map((p) => ({
    x: ((p.x - u.position.x) / u.width) * img.w,
    y: ((p.y - u.position.y) / (u.width * u.aspect)) * img.h,
  }));
  // Let the browser paint "working…" before the (synchronous) fill.
  await new Promise((r) => setTimeout(r, 0));
  const r = traceRoom(img, seeds, {
    closePx: gapMm / mmPerPx,
    tolerancePx: Math.max(1.5, TOLERANCE_MM / mmPerPx),
  });
  if (!r) return { points: null, leaked: false, areaM2: 0 };
  return {
    points: r.polygon.map((p) => ({
      x: (u.position.x + p.x * mmPerPx) as Mm,
      y: (u.position.y + p.y * mmPerPx) as Mm,
    })),
    leaked: r.leaked,
    areaM2: (r.areaPx * mmPerPx * mmPerPx) / 1e6,
  };
}

/** Openings closed by default: enough for most doorways, little enough to keep furniture apart from the walls. */
export const DEFAULT_GAP_MM = 600;

/** Traces around `seeds` and puts the result in the store as the wall draft (newest request wins). */
export async function runWallTrace(seeds: Point[], gapMm: number) {
  const { usePlannerStore } = await import('@/store/plannerStore');
  const store = usePlannerStore.getState();
  const u = store.project.underlay;
  if (!u) return;
  const base = { seeds, gapMm, leaked: false, areaM2: 0 };
  store.setWallDraft({ ...base, points: store.wallDraft?.points ?? null, busy: true });
  const current = () => {
    const d = usePlannerStore.getState().wallDraft;
    return !!d && d.gapMm === gapMm && d.seeds.length === seeds.length && d.seeds.every((p, i) => p.x === seeds[i]!.x && p.y === seeds[i]!.y);
  };
  try {
    const r = await traceUnderlayAt(u, seeds, gapMm);
    if (!current()) return;
    usePlannerStore.getState().setWallDraft({
      ...base,
      ...r,
      busy: false,
      error: r.points ? undefined : 'No room found there. Click inside a room, away from the lines.',
    });
  } catch (e) {
    if (!current()) return;
    usePlannerStore.getState().setWallDraft({
      ...base,
      points: null,
      busy: false,
      error: e instanceof Error ? e.message : 'The plan could not be traced.',
    });
  }
}
