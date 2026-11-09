import type { Point, Size3D } from '@/model/geometry';
import type { InventoryItem, RoomPolygon } from '@/model/objects';
import type { Project } from '@/model/project';
import type { Mm, Radians } from '@/model/units';
import { rectCorners } from '@/geometry/transform';
import { convexOverlap, edges, outlineGap, pointInPolygon, type Polygon } from '@/geometry/footprint';
import { openingSpan, wallFrame } from '@/geometry/openings';
import { normalizeAngle, pushToWalls } from '@/geometry/wallSnap';
import { wallHeightOf, wallStyle } from '@/geometry/wallStyle';
import { polygonArea, polygonCentroid } from '@/geometry/polygon';
import { findAsset } from './assetCatalog';
import { RACK_CATEGORY, rackSize, rackSlots } from './racks';
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
const ICONIC_TABLE = '105-17-007';
const VOLUME_TABLE = '105-17-001';
const CARPET = '105-19-001';
const LED_LOGO = '105-13-LED';
const STEEL_LOGO = '105-13-015';
/** From this floor area (m²) a shop gets an entrance / impact zone and a Volume Table. */
export const IMPACT_ZONE_M2 = 30;
/** Floor area (m²) per floor rack: brand shops show less, volume shops more. */
const RACK_AREA_BRAND = 25;
const RACK_AREA_VOLUME = 12;
/** Between the Iconic Table and the mannequins beside it (mm): standing together. */
const MANNEQUIN_GAP = 50;
/** Kept clear in front of a door before the impact zone starts (mm). */
const DOOR_CLEAR = 900;
/** Free space kept beside doors and windows along the wall. */
const OPENING_MARGIN = 200;
/** Space kept clear at each end of a wall, past the corner, for the neighbouring wall's racks. */
const CORNER_ROOM = 650;

const pt = (x: number, y: number): Point => ({ x: x as Mm, y: y as Mm });

interface Placed {
  item: InventoryItem;
  outline: Polygon;
  /** Fixtures placed together (racks end to end) share a group. */
  group?: number;
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
  /** Carpets: the other fixtures stay off them. */
  const keepOff: Polygon[] = [];
  const carpets: InventoryItem[] = [];
  /** Which wall each wall rack stands against. */
  const rackWall = new Map<string, number>();
  const area = polygonArea(room.corners.map((c) => c.point)) / 1e6;

  /** Room for `outline`: `gapWalls` from every wall (or, with `touchOk`, flush against it). */
  const clearOf = (outline: Polygon, gapItems: number, gapWalls: number, againstWall = false, touchOk = false) => {
    if (!outline.every((p) => pointInPolygon(p, inner) || againstWall)) return false;
    if (!againstWall) {
      for (const [a, b] of faces) {
        const d = outlineGap(outline, [a, b]).distance;
        if (d < gapWalls && !(touchOk && d <= 2)) return false;
      }
    }
    for (const z of zones) if (convexOverlap(outline, z) || outlineGap(outline, z).distance < 100) return false;
    for (const z of keepOff) if (convexOverlap(outline, z) || outlineGap(outline, z).distance < 300) return false;
    for (const p of pillars) if (convexOverlap(outline, p) || outlineGap(outline, p).distance < gapItems) return false;
    for (const o of placed) if (convexOverlap(outline, o.outline) || outlineGap(outline, o.outline).distance < gapItems) return false;
    return true;
  };
  const add = (item: InventoryItem | null, gapItems: number, gapWalls: number, againstWall = false, touchOk = false) => {
    if (!item) return false;
    const outline = rectCorners(item.position, item.size, item.rotation);
    if (!clearOf(outline, gapItems, gapWalls, againstWall, touchOk)) return false;
    placed.push({ item, outline });
    return true;
  };

  const door = entrance(room);
  // Facing into the shop from the entrance (or along the room without one).
  const inward = door ? { x: door.nx, y: door.ny } : { x: 0, y: 1 };
  // Local front (+y) towards the entrance: the back faces into the shop.
  const facing = Math.atan2(-inward.x, inward.y) + Math.PI;

  // 1. The entrance / impact zone. From 30 m², always the Iconic Table on a
  //    carpet facing the entrance (there is only ever one Iconic Table); a
  //    smaller brand shop gets the table without the carpet. Brand shops
  //    put a mannequin either side of it.
  const impact = area >= IMPACT_ZONE_M2;
  const side = { x: inward.y, y: -inward.x };
  if (door && (impact || brand)) {
    const carpetSize = findAsset(CARPET)!.size;
    const d0 = room.wallThickness / 2 + (impact ? DOOR_CLEAR + carpetSize.depth / 2 + 100 : 1700);
    for (let d = d0; d < d0 + 3000; d += 250) {
      const c = pt(door.center.x + inward.x * d, door.center.y + inward.y * d);
      const carpet = impact ? fromAsset(CARPET, c, facing) : null;
      const carpetOutline = carpet ? rectCorners(carpet.position, carpet.size, carpet.rotation) : null;
      if (carpetOutline && !clearOf(carpetOutline, aisle / 2, 100)) continue;
      const table = fromAsset(ICONIC_TABLE, c, facing);
      if (!add(table, aisle, aisle)) continue;
      // Two mannequins beside the table, on the carpet, standing with it.
      for (const [k, id] of [[-1, '112-18-001'], [1, '112-18-002']] as const) {
        const m = fromAsset(id, c, facing)!;
        const reach = table!.size.width / 2 + m.size.width / 2 + MANNEQUIN_GAP;
        m.position = pt(c.x + side.x * reach * k, c.y + side.y * reach * k);
        const o = rectCorners(m.position, m.size, m.rotation);
        const fits =
          o.every((p) => pointInPolygon(p, inner)) &&
          zones.every((z) => !convexOverlap(o, z)) &&
          placed.every((x) => x.item === table || (!convexOverlap(o, x.outline) && outlineGap(o, x.outline).distance >= aisle));
        if (fits) placed.push({ item: m, outline: o });
      }
      if (carpet && carpetOutline) {
        carpets.push(carpet);
        keepOff.push(carpetOutline);
      }
      break;
    }
  }

  const xs = inner.map((p) => p.x);
  const ys = inner.map((p) => p.y);
  const box = { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  // Rows run along the longer side of the room.
  const alongX = box.maxX - box.minX >= box.maxY - box.minY;
  const rotation = alongX ? 0 : Math.PI / 2;
  const gap = brand ? Math.round(aisle * 1.35) : aisle;

  // 2. Volume Tables: one from 30 m², two from 60 m², in the middle of the shop.
  const volumeTables = area >= 60 ? 2 : area >= IMPACT_ZONE_M2 ? 1 : 0;
  if (volumeTables) {
    const mid = polygonCentroid(inner) ?? pt((box.minX + box.maxX) / 2, (box.minY + box.maxY) / 2);
    const spread = Math.abs((box.maxX - box.minX) * side.x) + Math.abs((box.maxY - box.minY) * side.y);
    const targets =
      volumeTables === 1
        ? [mid]
        : [-1, 1].map((k) => pt(mid.x + side.x * (spread / 4) * k, mid.y + side.y * (spread / 4) * k));
    // Free on the floor if it fits; in a smaller shop, flush against a wall.
    const place = (t: Point, flush: boolean) => {
      for (let r = 0; r <= 6000; r += 250) {
        const steps = r === 0 ? 1 : Math.max(8, Math.round((2 * Math.PI * r) / 500));
        for (let i = 0; i < steps; i++) {
          const a = (2 * Math.PI * i) / steps;
          for (const rot of [rotation, rotation + Math.PI / 2]) {
            const table = fromAsset(VOLUME_TABLE, pt(t.x + Math.cos(a) * r, t.y + Math.sin(a) * r), rot);
            if (!table) return false;
            if (flush) table.position = pushToWalls(inner, table.position, table.size, table.rotation, aisle).position;
            if (add(table, gap, aisle, false, flush)) return true;
          }
        }
      }
      return false;
    };
    for (const t of targets) if (!place(t, false)) place(t, true);
  }

  // 3. Wall racks along the free walls tall enough for them (after the
  //    must-haves, so they shorten around them rather than the other way).
  let farWall: { index: number; along: number; length: number } | null = null;
  if (opts.wallRacks) {
    for (let i = 0; i < room.corners.length; i++) {
      const w = wallFrame(room, i);
      // Not on glass (transparent) walls, nor walls too low for the units.
      if (!w || wallStyle(room, i).transparent || wallHeightOf(room, i) < WALL_UNIT_HEIGHT + 100) continue;
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
            rackWall.set(item.id, i);
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

  // 4. The floor: racks (and, in a brand shop, podiums) in a grid, every one
  //    the aisle apart — no more racks than the shop's size calls for, spread
  //    out over the floor.
  // Volume shops pair their racks end to end (touching, the aisle around
  // the pair); brand shops keep them single.
  const cycle: string[][] = brand
    ? [['105-06-014'], ['105-09-001']]
    : [['105-06-001', '105-06-011'], ['105-06-001', '105-06-013']];
  const runOf = (ids: string[]) => ids.reduce((sum, id) => sum + findAsset(id)!.size.width, 0);
  const cellW = Math.max(...cycle.map(runOf)) + gap;
  const cellD = Math.max(...cycle.flat().map((id) => findAsset(id)!.size.depth)) + gap;
  const axis = alongX ? { x: 1, y: 0 } : { x: 0, y: 1 };
  /** A group side by side along the row, centred on `c`; all of it or nothing. */
  const addGroup = (ids: string[], c: Point, group: number) => {
    const total = runOf(ids);
    let at = -total / 2;
    const items = ids.map((id) => {
      const w = findAsset(id)!.size.width;
      const item = fromAsset(id, pt(c.x + axis.x * (at + w / 2), c.y + axis.y * (at + w / 2)), rotation)!;
      at += w;
      return { item, outline: rectCorners(item.position, item.size, item.rotation), group };
    });
    if (!items.every((x) => clearOf(x.outline, gap, aisle))) return false;
    placed.push(...items);
    return true;
  };
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
          if (addGroup(cycle[k % cycle.length]!, alongX ? pt(u, v) : pt(v, u), k)) k++;
        }
      }
      if (placed.length - before > best.length) best = placed.slice(before);
    }
  }
  placed.length = before;
  const isRack = (p: Placed) => !!p.item.assetRef?.startsWith('105-06-');
  const rackGroups = [...new Set(best.filter(isRack).map((p) => p.group))];
  const others = best.filter((p) => !isRack(p)).slice(0, brand ? Math.max(1, Math.floor(area / 40)) : 0);
  const rackCap = Math.max(brand ? 1 : 2, Math.floor(area / (brand ? RACK_AREA_BRAND : RACK_AREA_VOLUME)));
  const perGroup = brand ? 1 : 2;
  const groupCap = Math.max(1, Math.floor(rackCap / perGroup));
  // Evenly through the grid, so the floor is used from front to back.
  const keepGroups = new Set(
    rackGroups.length <= groupCap
      ? rackGroups
      : Array.from({ length: groupCap }, (_, i) => rackGroups[Math.floor(((i + 0.5) * rackGroups.length) / groupCap)]!),
  );
  const keep = best.filter((p) => isRack(p) && keepGroups.has(p.group));
  for (const r of keep) {
    if (brand) r.item.accessories = [{ id: newId('acc'), assetRef: RACK_SIGN }];
  }
  placed.push(...keep, ...others);

  // 5. The logo, in every proposal with a solid wall to hang it on: the LED
  //    logo from 30 m², the stainless steel one below. On the wall the
  //    entrance looks at, centred over its leftmost wall unit (as seen from
  //    inside the shop); without units there, centred on the wall's longest
  //    stretch clear of doors and windows.
  const logo = findAsset(area >= IMPACT_ZONE_M2 ? LED_LOGO : STEEL_LOGO);
  if (logo) {
    const fits = (i: number) => !wallStyle(room, i).transparent && wallHeightOf(room, i) >= (logo.minWallHeight ?? 0);
    const ahead = (i: number) => {
      const w = wallFrame(room, i)!;
      const mx = (w.a.x + w.b.x) / 2;
      const my = (w.a.y + w.b.y) / 2;
      return door ? (mx - door.center.x) * door.nx + (my - door.center.y) * door.ny : w.length;
    };
    const far = farWall as { index: number; along: number } | null;
    let index = far && fits(far.index) ? far.index : -1;
    if (index < 0) {
      for (let i = 0; i < room.corners.length; i++) {
        if (wallFrame(room, i) && fits(i) && freeStretches(room, i).length && (index < 0 || ahead(i) > ahead(index))) index = i;
      }
    }
    const w = index >= 0 ? wallFrame(room, index) : null;
    if (w) {
      let leftmost: { along: number; left: number } | null = null;
      for (const p of placed) {
        if (!p.item.modules || rackWall.get(p.item.id) !== index) continue;
        const r = p.item.rotation;
        // The rack's local +x is to the right of someone facing it.
        const rx = { x: Math.cos(r), y: Math.sin(r) };
        for (const slot of rackSlots(p.item.modules)) {
          const cx = p.item.position.x + rx.x * slot.x - rx.y * slot.y;
          const cy = p.item.position.y + rx.y * slot.x + rx.x * slot.y;
          const left = cx * rx.x + cy * rx.y;
          if (!leftmost || left < leftmost.left) leftmost = { along: (cx - w.a.x) * w.ux + (cy - w.a.y) * w.uy, left };
        }
      }
      const stretches = freeStretches(room, index).sort((p, q) => q[1] - q[0] - (p[1] - p[0]));
      const along = leftmost?.along ?? (stretches[0] ? (stretches[0][0] + stretches[0][1]) / 2 : w.length / 2);
      const off = room.wallThickness / 2 + logo.size.depth / 2;
      const item = fromAsset(logo.id, pt(w.a.x + w.ux * along + w.nx * off, w.a.y + w.uy * along + w.ny * off), Math.atan2(-w.nx, w.ny));
      if (item) placed.push({ item, outline: rectCorners(item.position, item.size, item.rotation) });
    }
  }

  // 6. Check with the layout check and drop what it still objects to.
  let inventory = [...carpets, ...placed.map((p) => p.item)];
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
