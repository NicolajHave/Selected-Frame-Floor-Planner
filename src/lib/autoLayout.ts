import type { Point, Size3D } from '@/model/geometry';
import type { InventoryItem, RoomPolygon } from '@/model/objects';
import type { Project } from '@/model/project';
import type { Mm, Radians } from '@/model/units';
import { rectCorners } from '@/geometry/transform';
import { convexOverlap, edges, outlineGap, pointInPolygon, type Polygon } from '@/geometry/footprint';
import { openingSpan, wallFrame } from '@/geometry/openings';
import { normalizeAngle } from '@/geometry/wallSnap';
import { wallHeightOf } from '@/geometry/wallStyle';
import { findAsset } from './assetCatalog';
import { RACK_CATEGORY, rackSize } from './racks';
import { RACK_SIGN } from './accessories';
import { doorZones, innerOutline, layoutIssues } from './layout';
import { newId } from './id';

/**
 * An automatic first layout for the shop, to start from and adjust.
 *
 *  brand  — room to breathe: a welcome table with mannequins facing the
 *           entrance, fewer fixtures with wider aisles, signs on the racks,
 *           a logo on the wall opposite the entrance.
 *  volume — as much product as fits: wall racks along every free wall and
 *           rows of floor racks, every one the minimum aisle apart.
 *
 * Every fixture keeps at least `aisle` mm to the next one and to the walls,
 * and doorways stay clear; the result is checked with the layout check.
 */
export type ShopStyle = 'brand' | 'volume';

export interface AutoLayoutOptions {
  style: ShopStyle;
  /** Minimum free space between fixtures, and between fixtures and walls (mm). */
  aisle: number;
  /** Line the free walls with wall racks. */
  wallRacks: boolean;
}

export interface AutoLayoutResult {
  inventory: InventoryItem[];
  /** Why the proposal could not be made, if it couldn't. */
  problem?: string;
}

const WALL_UNIT_HEIGHT = 2288;
/** Free space kept beside doors and windows along the wall. */
const OPENING_MARGIN = 200;
/** Space kept clear at each end of a wall, past the corner, for the neighbouring wall's racks. */
const CORNER_ROOM = 650;

const pt = (x: number, y: number): Point => ({ x: x as Mm, y: y as Mm });

interface Placed {
  item: InventoryItem;
  outline: Polygon;
}

function fromAsset(assetId: string, centre: Point, rotation: number): InventoryItem | null {
  const a = findAsset(assetId);
  if (!a) return null;
  return {
    id: newId('inv'),
    type: 'inventory',
    name: a.name,
    category: a.category,
    assetRef: a.id,
    position: { x: centre.x, y: centre.y },
    size: { ...a.size },
    rotation: normalizeAngle(rotation) as Radians,
  };
}

/** Units for a stretch of wall `length` mm long. */
function rackModules(length: number, style: ShopStyle): string[] {
  const n1400 = Math.floor(length / 1496);
  const rest = length - n1400 * 1496;
  if (style === 'brand') {
    // A short, curated rack: at most three units, a mirror in the middle.
    if (n1400 >= 3) return ['105-99-005', '105-99-007', '105-99-005'];
    if (n1400 === 2) return ['105-99-005', '105-99-004'];
    if (n1400 === 1) return ['105-99-007'];
    return rest >= 810 ? ['105-99-012'] : [];
  }
  // Volume: hanging and shelves in turn, a 700 unit to finish the run.
  const out: string[] = [];
  for (let i = 0; i < n1400; i++) out.push(i % 2 === 0 ? '105-99-005' : '105-99-004');
  if (rest >= 810) out.push(out.length % 2 === 0 ? '105-99-012' : '105-99-010');
  return out;
}

/** Free stretches of wall `index` (along its inner face, mm from its start), between corners and openings. */
function freeStretches(room: RoomPolygon, index: number): [number, number][] {
  const w = wallFrame(room, index)!;
  const half = room.wallThickness / 2;
  const blocked: [number, number][] = room.openings
    .map((o) => (o.wallStartCornerId === room.corners[index]!.id ? openingSpan(room, o) : null))
    .filter((s): s is NonNullable<typeof s> => !!s)
    .map((s) => [s.offset - s.width / 2 - OPENING_MARGIN, s.offset + s.width / 2 + OPENING_MARGIN] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  let from = half + CORNER_ROOM;
  for (const [a, b] of blocked) {
    if (a > from) out.push([from, a]);
    from = Math.max(from, b);
  }
  if (w.length - half - CORNER_ROOM > from) out.push([from, w.length - half - CORNER_ROOM]);
  return out.filter(([a, b]) => b - a >= 810);
}

/** A wall rack of `modules` centred on `along` of wall `index`, back to the wall. */
function wallRack(room: RoomPolygon, index: number, along: number, modules: string[]): InventoryItem {
  const w = wallFrame(room, index)!;
  const size: Size3D = rackSize(modules);
  const off = room.wallThickness / 2 + size.depth / 2;
  const centre = pt(w.a.x + w.ux * along + w.nx * off, w.a.y + w.uy * along + w.ny * off);
  return {
    id: newId('inv'),
    type: 'inventory',
    name: `Wall rack (${modules.length} unit${modules.length === 1 ? '' : 's'})`,
    category: RACK_CATEGORY,
    modules,
    position: centre,
    size,
    // Back (local −y) to the wall: the same turn as snapping to it.
    rotation: normalizeAngle(Math.atan2(-w.nx, w.ny)) as Radians,
  };
}

/** The main entrance: the widest door or passage, and the way into the room from it. */
function entrance(room: RoomPolygon) {
  const doors = room.openings
    .filter((o) => o.kind !== 'window')
    .map((o) => openingSpan(room, o))
    .filter((s): s is NonNullable<typeof s> => !!s)
    .sort((a, b) => b.width - a.width);
  return doors[0] ?? null;
}

export function proposeLayout(project: Project, opts: AutoLayoutOptions): AutoLayoutResult {
  const room = project.room;
  if (!room?.closed || room.corners.length < 3) return { inventory: [], problem: 'Draw and close the room first.' };
  const inner = innerOutline(room);
  if (!inner) return { inventory: [], problem: 'Draw and close the room first.' };
  const aisle = Math.max(600, opts.aisle);
  const brand = opts.style === 'brand';
  const faces = edges(inner);
  const zones = doorZones(room).map((z) => z.zone);
  const pillars = project.pillars.map((p) => rectCorners(p.position, p.size, p.rotation));
  const placed: Placed[] = [];

  const clearOf = (outline: Polygon, gapItems: number, gapWalls: number, againstWall = false) => {
    if (!outline.every((p) => pointInPolygon(p, inner) || againstWall)) return false;
    if (!againstWall && faces.some(([a, b]) => outlineGap(outline, [a, b]).distance < gapWalls)) return false;
    for (const z of zones) if (convexOverlap(outline, z) || outlineGap(outline, z).distance < 100) return false;
    for (const p of pillars) if (convexOverlap(outline, p) || outlineGap(outline, p).distance < gapItems) return false;
    for (const o of placed) if (convexOverlap(outline, o.outline) || outlineGap(outline, o.outline).distance < gapItems) return false;
    return true;
  };
  const add = (item: InventoryItem | null, gapItems: number, gapWalls: number, againstWall = false) => {
    if (!item) return false;
    const outline = rectCorners(item.position, item.size, item.rotation);
    if (!clearOf(outline, gapItems, gapWalls, againstWall)) return false;
    placed.push({ item, outline });
    return true;
  };

  const door = entrance(room);
  // Facing into the shop from the entrance (or along the room without one).
  const inward = door ? { x: door.nx, y: door.ny } : { x: 0, y: 1 };
  // Local front (+y) towards the entrance: the back faces into the shop.
  const facing = Math.atan2(-inward.x, inward.y) + Math.PI;

  // 1. Wall racks along the free walls tall enough for them.
  let farWall: { index: number; along: number; length: number } | null = null;
  if (opts.wallRacks) {
    for (let i = 0; i < room.corners.length; i++) {
      const w = wallFrame(room, i);
      if (!w || wallHeightOf(room, i) < WALL_UNIT_HEIGHT + 100) continue;
      for (const [a, b] of freeStretches(room, i)) {
        let modules = rackModules(b - a, opts.style);
        while (modules.length) {
          const item = wallRack(room, i, (a + b) / 2, modules);
          const outline = rectCorners(item.position, item.size, item.rotation);
          // Against its wall; clear of doorways, pillars and the other racks (corners).
          const ok =
            zones.every((z) => !convexOverlap(outline, z)) &&
            pillars.every((p) => !convexOverlap(outline, p) && outlineGap(outline, p).distance >= aisle) &&
            placed.every((o) => !convexOverlap(outline, o.outline) && outlineGap(outline, o.outline).distance >= aisle);
          if (ok) {
            placed.push({ item, outline });
            // The wall the entrance looks at, for the logo.
            const mid = item.position;
            const ahead = door ? (mid.x - door.center.x) * door.nx + (mid.y - door.center.y) * door.ny : 0;
            if (!farWall || ahead > farWall.length) farWall = { index: i, along: (a + b) / 2, length: ahead };
            break;
          }
          modules = modules.slice(0, -1);
        }
      }
    }
  }

  // 2. Brand: a welcome table facing the entrance, a mannequin either side.
  if (brand && door) {
    const d0 = room.wallThickness / 2 + 1700;
    for (let d = d0; d < d0 + 3000; d += 250) {
      const c = pt(door.center.x + inward.x * d, door.center.y + inward.y * d);
      const table = fromAsset('105-17-007', c, facing);
      if (!add(table, aisle, aisle)) continue;
      const side = { x: inward.y, y: -inward.x };
      for (const [k, id] of [[-1, '112-18-001'], [1, '112-18-002']] as const) {
        // Beside the table, the full aisle away from it.
        const first = (table!.size.width + 450) / 2 + aisle;
        for (const reach of [first, first + 200, first + 400]) {
          const m = fromAsset(id, pt(c.x + side.x * reach * k, c.y + side.y * reach * k), facing);
          if (add(m, aisle, aisle)) break;
        }
      }
      break;
    }
  }

  // 3. The floor: a grid of fixtures, every one the aisle apart.
  const gap = brand ? Math.round(aisle * 1.35) : aisle;
  const cycle = brand ? ['105-06-014', '105-17-001', '105-06-014', '105-09-001'] : ['105-06-001', '105-06-011', '105-06-001', '105-06-013'];
  const xs = inner.map((p) => p.x);
  const ys = inner.map((p) => p.y);
  const box = { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  // Rows run along the longer side of the room.
  const alongX = box.maxX - box.minX >= box.maxY - box.minY;
  const cellW = Math.max(...cycle.map((id) => findAsset(id)!.size.width)) + gap;
  const cellD = Math.max(...cycle.map((id) => findAsset(id)!.size.depth)) + gap;
  const rotation = alongX ? 0 : Math.PI / 2;
  // Try a few grid offsets and keep the one that fits the most.
  let best: Placed[] = [];
  const before = placed.length;
  for (const fu of [0, 0.25, 0.5, 0.75]) {
    for (const fv of [0, 0.5]) {
      placed.length = before;
      let k = 0;
      const [u0, u1, v0, v1] = alongX ? [box.minX, box.maxX, box.minY, box.maxY] : [box.minY, box.maxY, box.minX, box.maxX];
      for (let v = v0 + cellD * (0.5 + fv); v < v1; v += cellD) {
        for (let u = u0 + cellW * (0.5 + fu); u < u1; u += cellW) {
          const c = alongX ? pt(u, v) : pt(v, u);
          const item = fromAsset(cycle[k % cycle.length]!, c, rotation);
          if (add(item, gap, aisle)) {
            k++;
            if (brand && item?.assetRef?.startsWith('105-06-')) item.accessories = [{ id: newId('acc'), assetRef: RACK_SIGN }];
          }
        }
      }
      if (placed.length - before > best.length) best = placed.slice(before);
    }
  }
  placed.length = before;
  placed.push(...best);

  // 4. Brand: the logo on the wall the entrance looks at, above its rack.
  const far = farWall as { index: number; along: number } | null;
  if (brand && far) {
    const logo = findAsset('105-13-001');
    const w = wallFrame(room, far.index);
    if (logo && w && wallHeightOf(room, far.index) >= (logo.minWallHeight ?? 0)) {
      const off = room.wallThickness / 2 + logo.size.depth / 2;
      const item = fromAsset(logo.id, pt(w.a.x + w.ux * far.along + w.nx * off, w.a.y + w.uy * far.along + w.ny * off), Math.atan2(-w.nx, w.ny));
      if (item) placed.push({ item, outline: rectCorners(item.position, item.size, item.rotation) });
    }
  }

  // 5. Check with the layout check and drop what it still objects to.
  let inventory = placed.map((p) => p.item);
  for (let round = 0; round < 20; round++) {
    const issues = layoutIssues({ ...project, inventory }, aisle).filter((i) => i.objectIds.some((id) => inventory.some((x) => x.id === id)));
    if (!issues.length) break;
    const worst = issues[0]!.objectIds.find((id) => inventory.some((x) => x.id === id && !x.modules))
      ?? issues[0]!.objectIds.find((id) => inventory.some((x) => x.id === id));
    inventory = inventory.filter((x) => x.id !== worst);
  }
  if (!inventory.length) return { inventory, problem: 'There is no room for fixtures with that aisle. Try a smaller minimum aisle.' };
  return { inventory };
}
