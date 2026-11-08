import type { Point } from '@/model/geometry';
import type { InventoryItem, Pillar, PlanNote } from '@/model/objects';
import type { Mm } from '@/model/units';
import { newId } from './id';

/**
 * The planner's clipboard: fixtures (with their accessories), pillars and
 * notes copied from one plan or layout and pasted into another. It lives in
 * this browser's storage, so it works across plans and tabs.
 */
const KEY = 'sf-planner:clipboard';

export interface Clip {
  version: 1;
  inventory: InventoryItem[];
  pillars: Pillar[];
  notes: PlanNote[];
  /** The middle of what was copied: pasting puts this point under the pointer. */
  centre: Point;
}

export function clipCount(c: Clip): number {
  return c.inventory.length + c.pillars.length + c.notes.length;
}

export function makeClip(inventory: readonly InventoryItem[], pillars: readonly Pillar[], notes: readonly PlanNote[]): Clip | null {
  const points = [...inventory.map((x) => x.position), ...pillars.map((x) => x.position), ...notes.map((x) => x.position)];
  if (!points.length) return null;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const copy = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
  return {
    version: 1,
    inventory: copy([...inventory]),
    pillars: copy([...pillars]),
    notes: copy([...notes]),
    centre: { x: ((Math.min(...xs) + Math.max(...xs)) / 2) as Mm, y: ((Math.min(...ys) + Math.max(...ys)) / 2) as Mm },
  };
}

export function writeClip(c: Clip): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(c));
    return true;
  } catch {
    return false;
  }
}

export function readClip(): Clip | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as Clip;
    return c?.version === 1 && Array.isArray(c.inventory) ? c : null;
  } catch {
    return null;
  }
}

/** The clip's contents with fresh ids, moved so its centre lands on `at`. */
export function placeClip(c: Clip, at: Point): { inventory: InventoryItem[]; pillars: Pillar[]; notes: PlanNote[] } {
  const dx = at.x - c.centre.x;
  const dy = at.y - c.centre.y;
  const move = (p: Point): Point => ({ x: (p.x + dx) as Mm, y: (p.y + dy) as Mm });
  return {
    inventory: c.inventory.map((it) => ({
      ...it,
      id: newId('inv'),
      position: move(it.position),
      locked: undefined,
      ...(it.accessories ? { accessories: it.accessories.map((a) => ({ ...a, id: newId('acc') })) } : {}),
    })),
    pillars: c.pillars.map((p) => ({ ...p, id: newId('pil'), position: move(p.position) })),
    notes: c.notes.map((n) => ({ ...n, id: newId('note'), position: move(n.position), ...(n.target ? { target: move(n.target) } : {}) })),
  };
}
