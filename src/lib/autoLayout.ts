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
 *           entrance, fewer fixtures with wider aisles, signs on the racks.
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
const RACK_AREA_BRAND = 18;
const RACK_AREA_VOLUME = 10;
/** How finely a row is searched for the next spot a rack fits (mm). */
const ROW_STEP = 250;
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

/**
 * Wall racks for a stretch of wall `length` mm long, the longest first, so
 * a stretch that cannot take the first gets the next size down rather than
 * staying empty.
 */
function rackOptions(length: number, style: ShopStyle): string[][] {
  const fits = (modules: string[]) => modules.length > 0 && rackSize(modules).width <= length;
  const options: string[][] = [];
  if (style === 'brand') {
    // A short, curated rack: at most three units, a mirror in the middle.
    options.push(
      ['105-99-005', '105-99-007', '105-99-005'],
      ['105-99-005', '105-99-004'],
      ['105-99-005', '105-99-012'],
      ['105-99-007'],
      ['105-99-012'],
    );
  } else {
    // Volume: hanging and shelves in turn, a 700 unit to finish the run.
    for (let n = Math.floor(length / 1400); n >= 0; n--) {
      const run = Array.from({ length: n }, (_, i) => (i % 2 === 0 ? '105-99-005' : '105-99-004'));
      options.push([...run, n % 2 === 0 ? '105-99-012' : '105-99-010'], run);
    }
  }
  return options.filter(fits);
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

/** Where customers come in, and the way into the room from there. */
interface Entrance {
  center: Point;
  /** Unit vector pointing into the room. */
  nx: number;
  ny: number;
}

/**
 * The shop's entrance. A glass (transparent) wall is the shop front and
 * outranks every door, since doors elsewhere usually lead to a stock room:
 * the entrance is the widest door or passage in the glass, or the middle of
 * the longest glass wall when it has none. Without glass, double doors and
 * open passages come before single doors; the widest wins.
 */
export function entrance(room: RoomPolygon): Entrance | null {
  const passages = room.openings
    .filter((o) => o.kind !== 'window')
    .map((o) => ({
      span: openingSpan(room, o),
      wall: room.corners.findIndex((c) => c.id === o.wallStartCornerId),
      wide: o.kind === 'door' ? 0 : 1,
    }))
    .filter((x): x is { span: NonNullable<ReturnType<typeof openingSpan>>; wall: number; wide: number } => !!x.span);
  const glass = room.corners
    .map((_, i) => ({ i, w: wallFrame(room, i) }))
    .filter((x): x is { i: number; w: NonNullable<ReturnType<typeof wallFrame>> } => !!x.w && !!wallStyle(room, x.i).transparent)
    .sort((a, b) => b.w.length - a.w.length);
  if (glass.length) {
    const inGlass = passages
      .filter((x) => glass.some((g) => g.i === x.wall))
      .sort((a, b) => b.span.width - a.span.width)[0];
    if (inGlass) return inGlass.span;
    const w = glass[0]!.w;
    return { center: pt((w.a.x + w.b.x) / 2, (w.a.y + w.b.y) / 2), nx: w.nx, ny: w.ny };
  }
  return passages.sort((a, b) => b.wide - a.wide || b.span.width - a.span.width)[0]?.span ?? null;
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
  //    carpet facing the entrance (there is only ever one Iconic Table), with
  //    a mannequin on the carpet either side of it; a smaller brand shop gets
  //    the table and mannequins without the carpet. The zone goes where all
  //    of it fits: straight in from the entrance if it can, else to a side.
  const impact = area >= IMPACT_ZONE_M2;
  const side = { x: inward.y, y: -inward.x };
  if (door && (impact || brand)) {
    const carpetSize = findAsset(CARPET)!.size;
    const d0 = room.wallThickness / 2 + (impact ? DOOR_CLEAR + carpetSize.depth / 2 + 100 : 1700);
    const zoneAt = (c: Point) => {
      const carpet = impact ? fromAsset(CARPET, c, facing) : null;
      const carpetOutline = carpet ? rectCorners(carpet.position, carpet.size, carpet.rotation) : null;
      if (carpetOutline && !clearOf(carpetOutline, aisle / 2, 100)) return null;
      const table = fromAsset(ICONIC_TABLE, c, facing)!;
      const tableOutline = rectCorners(table.position, table.size, table.rotation);
      if (!clearOf(tableOutline, aisle, aisle)) return null;
      // Standing with the table (50 mm from it); the aisle to everything else.
      const mannequins = ([[-1, '112-18-001'], [1, '112-18-002']] as const).flatMap(([k, id]) => {
        const m = fromAsset(id, c, facing)!;
        const reach = table.size.width / 2 + m.size.width / 2 + MANNEQUIN_GAP;
        m.position = pt(c.x + side.x * reach * k, c.y + side.y * reach * k);
        const outline = rectCorners(m.position, m.size, m.rotation);
        return clearOf(outline, aisle, aisle) ? [{ item: m, outline }] : [];
      });
      return { carpet, carpetOutline, table, tableOutline, mannequins };
    };
    let zone: NonNullable<ReturnType<typeof zoneAt>> | null = null;
    search: for (const shift of [0, 500, -500, 1000, -1000, 1500, -1500, 2000, -2000]) {
      for (let d = d0; d < d0 + 3000; d += 250) {
        const z = zoneAt(pt(door.center.x + inward.x * d + side.x * shift, door.center.y + inward.y * d + side.y * shift));
        if (!z) continue;
        // The first spot with both mannequins wins; else the best seen.
        if (!zone || z.mannequins.length > zone.mannequins.length) zone = z;
        if (z.mannequins.length === 2) break search;
      }
    }
    if (zone) {
      placed.push({ item: zone.table, outline: zone.tableOutline }, ...zone.mannequins);
      if (zone.carpet && zone.carpetOutline) {
        carpets.push(zone.carpet);
        keepOff.push(zone.carpetOutline);
      }
    }
  }

  const xs = inner.map((p) => p.x);
  const ys = inner.map((p) => p.y);
  const box = { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  // Rows run along the longest wall, so they follow the room even when it
  // is drawn at an angle or is not square.
  const longest = room.corners
    .map((_, i) => wallFrame(room, i))
    .filter((w): w is NonNullable<ReturnType<typeof wallFrame>> => !!w)
    .sort((a, b) => b.length - a.length)[0]!;
  const flip = longest.ux < -1e-6 || (Math.abs(longest.ux) <= 1e-6 && longest.uy < 0) ? -1 : 1;
  const rowDir = { x: longest.ux * flip, y: longest.uy * flip };
  const rotation = Math.atan2(rowDir.y, rowDir.x);
  const gap = brand ? Math.round(aisle * 1.35) : aisle;

  // Steps 2–4 are tried with the Volume Tables in a few slightly different
  // spots (nearer the entrance, further in or to a side; turned or not) and the
  // arrangement that leaves room for the most floor racks — without costing
  // wall units — is kept: a table a hand's breadth too far in can otherwise
  // cost a whole row of racks.
  const isRack = (p: Placed) => !!p.item.assetRef?.startsWith('105-06-');
  const rackCap = Math.max(2, Math.floor(area / (brand ? RACK_AREA_BRAND : RACK_AREA_VOLUME)));
  const fixed = placed.length;
  const arrange = (shift: number, across: number, turned: boolean) => {
    placed.length = fixed;
    rackWall.clear();

    // 2. Volume Tables: one from 30 m², two from 60 m², in the middle of the shop.
    const volumeTables = area >= 60 ? 2 : area >= IMPACT_ZONE_M2 ? 1 : 0;
    if (volumeTables) {
      const centre = polygonCentroid(inner) ?? pt((box.minX + box.maxX) / 2, (box.minY + box.maxY) / 2);
      const mid = pt(centre.x + inward.x * shift + side.x * across, centre.y + inward.y * shift + side.y * across);
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
            for (const rot of turned ? [rotation + Math.PI / 2, rotation] : [rotation, rotation + Math.PI / 2]) {
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
    if (opts.wallRacks) {
      for (let i = 0; i < room.corners.length; i++) {
        const w = wallFrame(room, i);
        // Not on glass (transparent) walls, nor walls too low for the units.
        if (!w || wallStyle(room, i).transparent || wallHeightOf(room, i) < WALL_UNIT_HEIGHT + 100) continue;
        for (const [a, b] of freeStretches(room, i)) {
          fit: for (const modules of rackOptions(b - a, opts.style)) {
            // In the middle of the stretch if it fits there, else slid along
            // it (away from a rack round the corner, say) before a unit goes.
            const half = rackSize(modules).width / 2;
            const mid = (a + b) / 2;
            const slack = Math.max(0, (b - a) / 2 - half);
            const tries = [0];
            for (let d = ROW_STEP; d < slack; d += ROW_STEP) tries.push(d, -d);
            if (slack > 0) tries.push(slack, -slack);
            for (const d of tries) {
              const item = wallRack(room, i, mid + d, modules);
              const outline = rectCorners(item.position, item.size, item.rotation);
              // Against its wall; clear of doorways, pillars and the other racks (corners).
              const ok =
                zones.every((z) => !convexOverlap(outline, z)) &&
                pillars.every((p) => !convexOverlap(outline, p) && outlineGap(outline, p).distance >= aisle) &&
                placed.every((o) => !convexOverlap(outline, o.outline) && outlineGap(outline, o.outline).distance >= aisle);
              if (ok) {
                placed.push({ item, outline });
                rackWall.set(item.id, i);
                break fit;
              }
            }
          }
        }
      }
    }

    // 4. The floor: racks (and, in a brand shop, podiums) in rows, every one
    //    the aisle apart — as many as the shop's size calls for, spread over
    //    the floor. Volume shops pair their racks end to end (touching, the
    //    aisle around the pair) and fill up with single racks where a pair
    //    does not fit; brand shops keep them single.
    const runOf = (ids: string[]) => ids.reduce((sum, id) => sum + findAsset(id)!.size.width, 0);
    let groupSeq = 0;
    /**
     * Every spot `groups` (taken in turn) fit, each `between` mm from the
     * next; where the group whose turn it is does not fit, `smaller` may.
     * The floor is combed in fine steps, row by row, along and across the
     * longest wall, and the fuller of the two is returned (not added to
     * `placed`).
     */
    const rows = (groups: string[][], between: number, smaller?: string[]): Placed[][] => {
      const before = placed.length;
      let best: Placed[][] = [];
      for (const f of [rowDir, { x: -rowDir.y, y: rowDir.x }]) {
        const rot = Math.atan2(f.y, f.x);
        const us = inner.map((p) => p.x * f.x + p.y * f.y);
        const vs = inner.map((p) => -p.x * f.y + p.y * f.x);
        const [u0, u1, v0, v1] = [Math.min(...us), Math.max(...us), Math.min(...vs), Math.max(...vs)];
        placed.length = before;
        const found: Placed[][] = [];
        for (let v = v0; v < v1; v += ROW_STEP) {
          let u = u0;
          while (u < u1) {
            const turn = groups[found.length % groups.length]!;
            let step = ROW_STEP;
            for (const ids of smaller ? [turn, smaller] : [turn]) {
              let at = u;
              const group = groupSeq++;
              const items = ids.map((id) => {
                const w = findAsset(id)!.size.width;
                const mid = at + w / 2;
                at += w;
                const item = fromAsset(id, pt(mid * f.x - v * f.y, mid * f.y + v * f.x), rot)!;
                return { item, outline: rectCorners(item.position, item.size, item.rotation), group };
              });
              if (items.every((x) => clearOf(x.outline, between, aisle))) {
                placed.push(...items);
                found.push(items);
                step = runOf(ids) + between;
                break;
              }
            }
            u += step;
          }
        }
        if (found.length > best.length) best = found;
      }
      placed.length = before;
      return best;
    };
    /** `n` of `list`, evenly through it, so the floor is used from front to back. */
    const evenly = <T,>(list: T[], n: number): T[] =>
      list.length <= n ? list : Array.from({ length: n }, (_, i) => list[Math.floor(((i + 0.5) * list.length) / n)]!);

    if (brand) {
      // Racks first, then podiums where there is still room. Wider than the
      // aisle between fixtures if the shop has the room for it.
      const kinds = [['105-06-014']];
      const small = ['105-06-014-700'];
      let found = rows(kinds, gap, small);
      if (found.length < rackCap && gap > aisle) {
        const tighter = rows(kinds, aisle, small);
        if (tighter.length > found.length) found = tighter;
      }
      const racks = evenly(found, rackCap);
      for (const g of racks) g[0]!.item.accessories = [{ id: newId('acc'), assetRef: RACK_SIGN }];
      placed.push(...racks.flat());
      let podiums = rows([['105-09-001']], gap);
      if (!podiums.length && gap > aisle) podiums = rows([['105-09-001']], aisle);
      placed.push(...evenly(podiums, Math.max(1, Math.floor(area / 40))).flat());
    } else {
      const pairs = evenly(rows([['105-06-001', '105-06-011'], ['105-06-001', '105-06-013']], gap), Math.floor(rackCap / 2));
      placed.push(...pairs.flat());
      const singles = evenly(rows([['105-06-001'], ['105-06-011']], gap, ['105-06-002']), rackCap - pairs.length * 2);
      placed.push(...singles.flat());
    }

    const now = placed.slice(fixed);
    const racks = now.filter(isRack).length;
    // A floor rack is worth giving up one wall unit for, not more.
    return { racks, score: racks * 2 + now.reduce((sum, p) => sum + (p.item.modules?.length ?? 0), 0) };
  };
  let kept: { racks: number; score: number; placed: Placed[]; walls: Map<string, number> } | null = null;
  const nudges: [number, number][] = [[0, 0], [-400, 0], [400, 0], [-800, 0], [800, 0], [0, -600], [0, 600], [0, -1200], [0, 1200]];
  for (const [shift, across] of nudges) {
    for (const turned of [false, true]) {
      if (kept && kept.racks >= rackCap) break;
      const r = arrange(shift, across, turned);
      if (!kept || r.score > kept.score) kept = { ...r, placed: placed.slice(fixed), walls: new Map(rackWall) };
    }
  }
  placed.length = fixed;
  placed.push(...kept!.placed);
  rackWall.clear();
  kept!.walls.forEach((wall, id) => rackWall.set(id, wall));

  // 5. The logo, in every proposal with a solid wall to hang it on: the LED
  //    logo from 30 m², the stainless steel one below. It hangs over a wall
  //    rack of two or more units when there is one — the one the entrance
  //    looks at most directly — centred over that rack's leftmost unit (as
  //    seen from inside the shop). With only single units, over the one the
  //    entrance looks at. Without wall racks, centred on the longest stretch
  //    clear of doors and windows of the wall facing the entrance.
  const logo = findAsset(area >= IMPACT_ZONE_M2 ? LED_LOGO : STEEL_LOGO);
  if (logo) {
    const fits = (i: number) => !wallStyle(room, i).transparent && wallHeightOf(room, i) >= (logo.minWallHeight ?? 0);
    const ahead = (p: Point) => (door ? (p.x - door.center.x) * door.nx + (p.y - door.center.y) * door.ny : 0);
    const rack = placed
      .filter((p) => p.item.modules?.length && fits(rackWall.get(p.item.id) ?? -1))
      .sort(
        (p, q) =>
          Number(q.item.modules!.length >= 2) - Number(p.item.modules!.length >= 2) ||
          ahead(q.item.position) - ahead(p.item.position),
      )[0];
    let index = -1;
    let along = 0;
    if (rack) {
      index = rackWall.get(rack.item.id)!;
      const w = wallFrame(room, index)!;
      const r = rack.item.rotation;
      // The rack's local +x is to the right of someone facing it.
      const rx = { x: Math.cos(r), y: Math.sin(r) };
      let leftmost = Infinity;
      for (const slot of rackSlots(rack.item.modules!)) {
        const cx = rack.item.position.x + rx.x * slot.x - rx.y * slot.y;
        const cy = rack.item.position.y + rx.y * slot.x + rx.x * slot.y;
        const left = cx * rx.x + cy * rx.y;
        if (left < leftmost) {
          leftmost = left;
          along = (cx - w.a.x) * w.ux + (cy - w.a.y) * w.uy;
        }
      }
    } else {
      const facingScore = (i: number) => {
        const w = wallFrame(room, i)!;
        return door ? ahead(pt((w.a.x + w.b.x) / 2, (w.a.y + w.b.y) / 2)) : w.length;
      };
      for (let i = 0; i < room.corners.length; i++) {
        if (wallFrame(room, i) && fits(i) && freeStretches(room, i).length && (index < 0 || facingScore(i) > facingScore(index))) index = i;
      }
      if (index >= 0) {
        const longestFree = freeStretches(room, index).sort((p, q) => q[1] - q[0] - (p[1] - p[0]))[0]!;
        along = (longestFree[0] + longestFree[1]) / 2;
      }
    }
    const w = index >= 0 ? wallFrame(room, index) : null;
    if (w) {
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
