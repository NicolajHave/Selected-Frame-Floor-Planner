import type { Point, Size3D } from '@/model/geometry';
import type { InventoryItem, RoomPolygon } from '@/model/objects';
import type { Project } from '@/model/project';
import type { Mm, Radians } from '@/model/units';
import { rectCorners } from '@/geometry/transform';
import { convexOverlap, edges, outlineGap, pointInPolygon, segmentCrosses, type Polygon } from '@/geometry/footprint';
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
/** How finely the floor is searched for a free spot for a Volume Table (mm). */
const TABLE_STEP = 150;
/** Fixtures this close (mm) stand together: no aisle is expected between them (as in the layout check). */
const TOUCHING = 100;
/** Between the Iconic Table and the mannequins beside it (mm): standing together. */
const MANNEQUIN_GAP = 50;
/** Kept clear in front of a door before the impact zone starts (mm). */
const DOOR_CLEAR = 900;
/** The same in from an open side, where no door swings (mm). */
const OPEN_SIDE_CLEAR = 300;
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
  /** The interior wall it stands against, if any. */
  host?: Polygon;
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

/**
 * Floor racks to stand end to end along an interior wall `length` mm long,
 * the longest run first; never more than `max` racks.
 */
function floorRuns(length: number, brand: boolean, max: number): string[][] {
  const [big, small] = brand ? ['105-06-014', '105-06-014-700'] : ['105-06-001', '105-06-002'];
  const w = (id: string) => findAsset(id)!.size.width;
  const out: string[][] = [];
  for (let n = Math.floor(length / w(big)); n >= 0; n--) {
    const run = Array.from({ length: n }, () => big);
    out.push([...run, small], run);
  }
  return out.filter((ids) => ids.length > 0 && ids.length <= max && ids.reduce((sum, id) => sum + w(id), 0) <= length);
}

/** Where customers come in, and the way into the room from there. */
interface Entrance {
  center: Point;
  /** Unit vector pointing into the room. */
  nx: number;
  ny: number;
  /** How far the entrance zone may slide along the wall either way (mm). */
  reach: number;
  /** An open side rather than a door: nothing swings there, so the zone can start nearer the edge. */
  open?: boolean;
}

/**
 * The ways into the shop, the main one first. An open side (a wall marked
 * open: there is no wall there) is where customers walk in and outranks
 * every door, since doors elsewhere usually lead to a stock room: the
 * longest open side first, at its middle (or at a door or passage drawn in
 * it). Then double doors and open passages, then single doors; the widest
 * first.
 */
export function entrances(room: RoomPolygon): Entrance[] {
  const passages = room.openings
    .filter((o) => o.kind !== 'window')
    .map((o) => ({
      span: openingSpan(room, o),
      wall: room.corners.findIndex((c) => c.id === o.wallStartCornerId),
      wide: o.kind === 'door' ? 0 : 1,
    }))
    .filter((x): x is { span: NonNullable<ReturnType<typeof openingSpan>>; wall: number; wide: number } => !!x.span)
    .sort((a, b) => b.wide - a.wide || b.span.width - a.span.width);
  const open = room.corners
    .map((_, i) => ({ i, w: wallFrame(room, i) }))
    .filter((x): x is { i: number; w: NonNullable<ReturnType<typeof wallFrame>> } => !!x.w && !!wallStyle(room, x.i).transparent)
    .sort((a, b) => b.w.length - a.w.length);
  const out: Entrance[] = [];
  for (const { i, w } of open) {
    const inIt = passages.filter((x) => x.wall === i).sort((a, b) => b.span.width - a.span.width)[0];
    if (inIt) out.push({ center: inIt.span.center, nx: w.nx, ny: w.ny, reach: 2000 });
    else out.push({ center: pt((w.a.x + w.b.x) / 2, (w.a.y + w.b.y) / 2), nx: w.nx, ny: w.ny, reach: Math.max(0, w.length / 2 - 1300), open: true });
  }
  for (const x of passages) {
    if (open.some((o) => o.i === x.wall)) continue;
    out.push({ center: x.span.center, nx: x.span.nx, ny: x.span.ny, reach: 2000 });
  }
  return out;
}

/** The shop's main entrance (see `entrances`), or null without one. */
export const entrance = (room: RoomPolygon): Entrance | null => entrances(room)[0] ?? null;

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
  /** Which wall of the room each wall rack stands against. */
  const rackWall = new Map<string, number>();
  const area = polygonArea(room.corners.map((c) => c.point)) / 1e6;
  const apart = (a: Polygon, b: Polygon, by: number) => !convexOverlap(a, b) && outlineGap(a, b).distance >= by;

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
    for (const p of pillars) if (!apart(outline, p, gapItems)) return false;
    for (const o of placed) if (!apart(outline, o.outline, gapItems)) return false;
    return true;
  };
  /**
   * Room for something standing against an interior wall or another
   * fixture (`host`, which it may touch): the aisle to everything else, and
   * to the room's walls either the aisle or right up against them.
   */
  const clearBeside = (outline: Polygon, host: Polygon) => {
    if (!outline.every((p) => pointInPolygon(p, inner))) return false;
    for (const [a, b] of faces) {
      const d = outlineGap(outline, [a, b]).distance;
      if (d > TOUCHING && d < aisle) return false;
    }
    for (const z of zones) if (convexOverlap(outline, z) || outlineGap(outline, z).distance < 100) return false;
    for (const z of keepOff) if (convexOverlap(outline, z) || outlineGap(outline, z).distance < 300) return false;
    for (const p of pillars) if (p !== host && !apart(outline, p, aisle)) return false;
    for (const o of placed) {
      if (o.outline === host) continue;
      // What stands on the other side of the same wall has the wall in between, not an aisle.
      if (o.host === host ? convexOverlap(outline, o.outline) : !apart(outline, o.outline, aisle)) return false;
    }
    return !convexOverlap(outline, host);
  };

  // 1. The entrance / impact zone. From 30 m², always the Iconic Table on a
  //    carpet facing the entrance (there is only ever one Iconic Table), with
  //    a mannequin on the carpet either side of it; a smaller brand shop gets
  //    the table and mannequins without the carpet. The zone goes where all
  //    of it fits: straight in from the main entrance if it can, else slid
  //    along it, else at the next way in.
  const impact = area >= IMPACT_ZONE_M2;
  const ways = entrances(room);
  let door: Entrance | null = ways[0] ?? null;
  if (ways.length && (impact || brand)) {
    const carpetSize = findAsset(CARPET)!.size;
    const depthIn = (way: Entrance) =>
      room.wallThickness / 2 + (impact ? (way.open ? OPEN_SIDE_CLEAR : DOOR_CLEAR) + carpetSize.depth / 2 + 100 : 1700);
    /** A carpet is walked on: it only has to lie inside the room, clear of doorways, pillars and interior walls. */
    const carpetFits = (outline: Polygon) =>
      outline.every((p) => pointInPolygon(p, inner)) &&
      faces.every(([a, b]) => outlineGap(outline, [a, b]).distance >= 100) &&
      zones.every((z) => apart(outline, z, 100)) &&
      pillars.every((p) => apart(outline, p, 100));
    const zoneAt = (c: Point, way: Entrance) => {
      // In sight of the entrance: not behind a pillar or an interior wall.
      if (pillars.some((p) => segmentCrosses(way.center, c, p))) return null;
      // Local front (+y) towards the entrance: the back faces into the shop.
      const facing = Math.atan2(-way.nx, way.ny) + Math.PI;
      const along = { x: way.ny, y: -way.nx };
      const carpet = impact ? fromAsset(CARPET, c, facing) : null;
      const carpetOutline = carpet ? rectCorners(carpet.position, carpet.size, carpet.rotation) : null;
      if (carpetOutline && !carpetFits(carpetOutline)) return null;
      const table = fromAsset(ICONIC_TABLE, c, facing)!;
      const tableOutline = rectCorners(table.position, table.size, table.rotation);
      if (!clearOf(tableOutline, aisle, aisle)) return null;
      // Standing with the table (50 mm from it); the aisle to everything else.
      const mannequins = ([[-1, '112-18-001'], [1, '112-18-002']] as const).flatMap(([k, id]) => {
        const m = fromAsset(id, c, facing)!;
        const reach = table.size.width / 2 + m.size.width / 2 + MANNEQUIN_GAP;
        m.position = pt(c.x + along.x * reach * k, c.y + along.y * reach * k);
        const outline = rectCorners(m.position, m.size, m.rotation);
        return clearOf(outline, aisle, aisle) ? [{ item: m, outline }] : [];
      });
      return { way, carpet, carpetOutline, table, tableOutline, mannequins };
    };
    let zone: NonNullable<ReturnType<typeof zoneAt>> | null = null;
    search: for (const way of ways) {
      const shifts = [0];
      for (let s = ROW_STEP; s <= Math.min(way.reach, 4000); s += ROW_STEP) shifts.push(s, -s);
      const d0 = depthIn(way);
      for (const shift of shifts) {
        for (let d = d0; d < d0 + 3000; d += ROW_STEP) {
          const z = zoneAt(pt(way.center.x + way.nx * d + way.ny * shift, way.center.y + way.ny * d - way.nx * shift), way);
          if (!z) continue;
          // The first spot with both mannequins wins; else the best seen.
          if (!zone || z.mannequins.length > zone.mannequins.length) zone = z;
          if (z.mannequins.length === 2) break search;
        }
      }
    }
    if (zone) {
      door = zone.way;
      placed.push({ item: zone.table, outline: zone.tableOutline }, ...zone.mannequins);
      if (zone.carpet && zone.carpetOutline) {
        carpets.push(zone.carpet);
        keepOff.push(zone.carpetOutline);
      }
    }
  }
  // Into the shop from the entrance (or along the room without one).
  const inward = door ? { x: door.nx, y: door.ny } : { x: 0, y: 1 };
  const side = { x: inward.y, y: -inward.x };

  const xs = inner.map((p) => p.x);
  const ys = inner.map((p) => p.y);
  const box = { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  const middle = polygonCentroid(inner) ?? pt((box.minX + box.maxX) / 2, (box.minY + box.maxY) / 2);
  // The floor is laid out along the longest wall, so it follows the room
  // even when it is drawn at an angle or is not square.
  const longest = room.corners
    .map((_, i) => wallFrame(room, i))
    .filter((w): w is NonNullable<ReturnType<typeof wallFrame>> => !!w)
    .sort((a, b) => b.length - a.length)[0]!;
  const flip = longest.ux < -1e-6 || (Math.abs(longest.ux) <= 1e-6 && longest.uy < 0) ? -1 : 1;
  const rowDir = { x: longest.ux * flip, y: longest.uy * flip };
  const rotation = Math.atan2(rowDir.y, rowDir.x);
  const gap = brand ? Math.round(aisle * 1.35) : aisle;

  // Every spot a Volume Table can stand free on the floor, with the aisle
  // all the way round it. Found once: only the entrance zone is in place.
  const volumeTables = area >= 60 ? 2 : area >= IMPACT_ZONE_M2 ? 1 : 0;
  const tableSpots: { item: InventoryItem; outline: Polygon }[] = [];
  if (volumeTables) {
    for (let x = box.minX; x <= box.maxX; x += TABLE_STEP) {
      for (let y = box.minY; y <= box.maxY; y += TABLE_STEP) {
        if (!pointInPolygon(pt(x, y), inner)) continue;
        for (const rot of [rotation, rotation + Math.PI / 2]) {
          const item = fromAsset(VOLUME_TABLE, pt(x, y), rot)!;
          const outline = rectCorners(item.position, item.size, item.rotation);
          if (clearOf(outline, aisle, aisle)) tableSpots.push({ item, outline });
        }
      }
    }
  }

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

    // 2. Volume Tables: one from 30 m², two from 60 m², in the middle of
    //    the shop and free on the floor: the aisle all the way round.
    if (volumeTables) {
      const mid = pt(middle.x + inward.x * shift + side.x * across, middle.y + inward.y * shift + side.y * across);
      const spread = Math.abs((box.maxX - box.minX) * side.x) + Math.abs((box.maxY - box.minY) * side.y);
      const targets =
        volumeTables === 1
          ? [mid]
          : [-1, 1].map((k) => pt(mid.x + side.x * (spread / 4) * k, mid.y + side.y * (spread / 4) * k));
      const preferred = normalizeAngle(turned ? rotation + Math.PI / 2 : rotation);
      const tables: Placed[] = [];
      for (const t of targets) {
        let best: (typeof tableSpots)[number] | null = null;
        let bestD = Infinity;
        for (const spot of tableSpots) {
          // Nearest the target; the preferred turn wins among near-equals.
          const d =
            Math.hypot(spot.item.position.x - t.x, spot.item.position.y - t.y) +
            (Math.abs(normalizeAngle(spot.item.rotation) - preferred) < 0.01 ? 0 : 400);
          if (d >= bestD) continue;
          if (tables.some((o) => !apart(spot.outline, o.outline, aisle))) continue;
          best = spot;
          bestD = d;
        }
        if (best) {
          const item = { ...best.item, id: newId('inv') };
          tables.push({ item, outline: best.outline });
          placed.push({ item, outline: best.outline });
          continue;
        }
        // No free spot anywhere (a very small shop): as a last resort, flush against a wall.
        flush: for (let r = 0; r <= 6000; r += 250) {
          const steps = r === 0 ? 1 : Math.max(8, Math.round((2 * Math.PI * r) / 500));
          for (let i = 0; i < steps; i++) {
            const a = (2 * Math.PI * i) / steps;
            for (const rot of [preferred, preferred + Math.PI / 2]) {
              const table = fromAsset(VOLUME_TABLE, pt(t.x + Math.cos(a) * r, t.y + Math.sin(a) * r), rot)!;
              table.position = pushToWalls(inner, table.position, table.size, table.rotation, aisle).position;
              const outline = rectCorners(table.position, table.size, table.rotation);
              if (!clearOf(outline, aisle, aisle, false, true)) continue;
              tables.push({ item: table, outline });
              placed.push({ item: table, outline });
              break flush;
            }
          }
        }
      }
    }

    // 3. Wall racks along the free walls tall enough for them (after the
    //    must-haves, so they shorten around them rather than the other way).
    if (opts.wallRacks) {
      for (let i = 0; i < room.corners.length; i++) {
        const w = wallFrame(room, i);
        // Not on open sides (no wall there), nor walls too low for the units.
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
                pillars.every((p) => apart(outline, p, aisle)) &&
                placed.every((o) => apart(outline, o.outline, aisle));
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

    // Interior walls take fixtures too, on either side: wall racks where the
    // wall is tall enough for them, else floor racks standing along it, end
    // to end.
    let besideWalls = 0;
    project.pillars.forEach((p, k) => {
      if (p.kind !== 'wall') return;
      const host = pillars[k]!;
      const dir = { x: Math.cos(p.rotation), y: Math.sin(p.rotation) };
      const length = p.size.width;
      for (const sign of [1, -1]) {
        // The way the fixtures face: out from this side of the wall.
        const front = { x: -dir.y * sign, y: dir.x * sign };
        const turn = Math.atan2(-front.x, front.y);
        /** `ids` (catalog items or one wall rack) end to end along the wall, centred `slide` mm off its middle. */
        const run = (ids: string[], modules: string[] | null, slide: number): Placed[] => {
          const sizes = modules ? [rackSize(modules)] : ids.map((id) => findAsset(id)!.size);
          const total = sizes.reduce((sum, z) => sum + z.width, 0);
          let at = slide - total / 2;
          return sizes.map((size, n) => {
            const along = at + size.width / 2;
            at += size.width;
            const off = p.size.depth / 2 + size.depth / 2;
            const centre = pt(p.position.x + dir.x * along * sign + front.x * off, p.position.y + dir.y * along * sign + front.y * off);
            const item: InventoryItem = modules
              ? {
                  id: newId('inv'),
                  type: 'inventory',
                  name: `Wall rack (${modules.length} unit${modules.length === 1 ? '' : 's'})`,
                  category: RACK_CATEGORY,
                  modules,
                  position: centre,
                  size,
                  rotation: normalizeAngle(turn) as Radians,
                }
              : fromAsset(ids[n]!, centre, turn)!;
            return { item, outline: rectCorners(item.position, item.size, item.rotation), host };
          });
        };
        const tall = p.size.height >= WALL_UNIT_HEIGHT + 100;
        const options: { ids: string[]; modules: string[] | null }[] =
          tall && opts.wallRacks
            ? rackOptions(length, opts.style).map((modules) => ({ ids: [], modules }))
            : floorRuns(length, brand, rackCap - besideWalls).map((ids) => ({ ids, modules: null }));
        fit: for (const o of options) {
          const width = o.modules ? rackSize(o.modules).width : o.ids.reduce((sum, id) => sum + findAsset(id)!.size.width, 0);
          const slack = Math.max(0, (length - width) / 2);
          const slides = [0];
          for (let d = ROW_STEP; d < slack; d += ROW_STEP) slides.push(d, -d);
          for (const slide of slides) {
            const items = run(o.ids, o.modules, slide);
            if (!items.every((x) => clearBeside(x.outline, host))) continue;
            placed.push(...items);
            if (!o.modules) besideWalls += items.length;
            break fit;
          }
        }
      }
    });

    // 4. The floor: racks standing parallel to each other, in line (the same
    //    height on the plan) and evenly spaced, so the aisles between them
    //    lead into the shop; as many as the shop's size calls for. Volume
    //    shops stand them two and two, back to back (touching, the aisle
    //    round the pair) and fill up with single racks; brand shops keep
    //    them single, then add podiums where there is still room.
    let standSeq = 0;
    /**
     * `want` stands from `stands` (taken in turn; `smaller` where the one
     * whose turn it is does not fit), each `between` mm from the next. A
     * stand is one rack, or racks back to back; the racks' length runs
     * across the row. The stands go on a grid — straight rows and straight
     * columns — tried both ways round the room and shifted in small steps;
     * from the grid that takes the most, whole rows are picked before part
     * rows, the same number from each and one above the other (not added to
     * `placed`).
     */
    const bays = (stands: string[][], between: number, want: number, smaller?: string[]): Placed[][] => {
      if (want <= 0) return [];
      const before = placed.length;
      const depthOf = (ids: string[]) => ids.reduce((sum, id) => sum + findAsset(id)!.size.depth, 0);
      const long = Math.max(...stands.flat().map((id) => findAsset(id)!.size.width));
      const across = Math.max(...stands.map(depthOf));
      const pitchU = across + between;
      const pitchV = long + between;
      // Racks pointing into the shop first: on a tie, the aisles lead in from the entrance.
      const frames = [rowDir, { x: -rowDir.y, y: rowDir.x }].sort(
        (f, g) => Math.abs(-g.y * inward.x + g.x * inward.y) - Math.abs(-f.y * inward.x + f.x * inward.y),
      );
      let best: { stands: Placed[][]; rows: number; spread: number } | null = null;
      for (const f of frames) {
        const turn = Math.atan2(f.y, f.x) + Math.PI / 2;
        const us = inner.map((p) => p.x * f.x + p.y * f.y);
        const vs = inner.map((p) => -p.x * f.y + p.y * f.x);
        const [u0, u1, v0, v1] = [Math.min(...us), Math.max(...us), Math.min(...vs), Math.max(...vs)];
        for (let offV = 0; offV < pitchV; offV += 2 * ROW_STEP) {
          for (let offU = 0; offU < pitchU; offU += ROW_STEP) {
            placed.length = before;
            const rows: { col: number; items: Placed[] }[][] = [];
            let count = 0;
            for (let v = v0 + offV + long / 2; v < v1; v += pitchV) {
              const row: { col: number; items: Placed[] }[] = [];
              for (let u = u0 + offU, col = 0; u + across <= u1; u += pitchU, col++) {
                for (const ids of smaller ? [stands[count % stands.length]!, smaller] : [stands[count % stands.length]!]) {
                  // The stand in the middle of its place on the grid.
                  let at = u + (across - depthOf(ids)) / 2;
                  const group = standSeq++;
                  const items = ids.map((id) => {
                    const depth = findAsset(id)!.size.depth;
                    const mid = at + depth / 2;
                    at += depth;
                    const item = fromAsset(id, pt(mid * f.x - v * f.y, mid * f.y + v * f.x), turn)!;
                    return { item, outline: rectCorners(item.position, item.size, item.rotation), group };
                  });
                  if (items.every((x) => clearOf(x.outline, between, aisle))) {
                    placed.push(...items);
                    row.push({ col, items });
                    count++;
                    break;
                  }
                }
              }
              if (row.length) rows.push(row);
            }
            if (!count) continue;
            const centre = (st: { items: Placed[] }) => st.items[0]!.item.position;
            const off = (row: { items: Placed[] }[]) =>
              Math.hypot(
                row.reduce((sum, st) => sum + centre(st).x, 0) / row.length - middle.x,
                row.reduce((sum, st) => sum + centre(st).y, 0) / row.length - middle.y,
              );
            const order = [...rows].sort((a, b) => b.length - a.length || off(a) - off(b));
            const total = Math.min(want, count);
            const each = Math.ceil(total / Math.ceil(total / order[0]!.length));
            const picked: { col: number; items: Placed[] }[] = [];
            let used = 0;
            let column: number | null = null;
            for (const row of order) {
              if (picked.length >= total) break;
              const take = Math.min(row.length, each, total - picked.length);
              // The first row from its middle; the next rows right above or below it.
              let from = Math.floor((row.length - take) / 2);
              if (column !== null) {
                let bestOff = Infinity;
                for (let i = 0; i + take <= row.length; i++) {
                  const mean = row.slice(i, i + take).reduce((sum, st) => sum + st.col, 0) / take;
                  if (Math.abs(mean - column) < bestOff) {
                    bestOff = Math.abs(mean - column);
                    from = i;
                  }
                }
              }
              const run = row.slice(from, from + take);
              column ??= run.reduce((sum, st) => sum + st.col, 0) / take;
              picked.push(...run);
              used++;
            }
            const spread = picked.reduce((sum, st) => sum + Math.hypot(centre(st).x - middle.x, centre(st).y - middle.y), 0);
            if (
              !best ||
              picked.length > best.stands.length ||
              (picked.length === best.stands.length && (used < best.rows || (used === best.rows && spread < best.spread - 1)))
            ) {
              best = { stands: picked.map((st) => st.items), rows: used, spread };
            }
          }
        }
      }
      placed.length = before;
      return best?.stands ?? [];
    };

    const left = () => rackCap - placed.slice(fixed).filter(isRack).length;
    if (brand) {
      // Wider than the aisle between fixtures if the shop has the room for it.
      const kinds = [['105-06-014']];
      const small = ['105-06-014-700'];
      // Full-size racks; the smaller size, then the plain aisle, only where that gets more racks in.
      let racks = bays(kinds, gap, left());
      for (const [between, fallback] of [[gap, small], [aisle, undefined], [aisle, small]] as const) {
        if (racks.length >= left()) break;
        if (between === gap && !fallback) continue;
        const more = bays(kinds, between, left(), fallback ? [...fallback] : undefined);
        if (more.length > racks.length) racks = more;
      }
      placed.push(...racks.flat());
    } else {
      placed.push(...bays([['105-06-001', '105-06-011'], ['105-06-001', '105-06-013']], gap, Math.floor(left() / 2)).flat());
      let singles = bays([['105-06-001'], ['105-06-011']], gap, left());
      if (singles.length < left()) {
        const more = bays([['105-06-001'], ['105-06-011']], gap, left(), ['105-06-002']);
        if (more.length > singles.length) singles = more;
      }
      placed.push(...singles.flat());
    }
    // The Volume Tables keep the aisle all the way round. Only at a pinch —
    // a floor with room for hardly a rack anywhere else — one rack stands
    // right beside a table, along its side.
    const racksNow = () => placed.slice(fixed).filter(isRack).length;
    for (const table of placed.slice(fixed).filter((o) => o.item.assetRef === VOLUME_TABLE)) {
      if (left() <= 0 || racksNow() >= 2) break;
      const id = brand ? '105-06-014' : '105-06-001';
      const rack = findAsset(id)!.size;
      const r = table.item.rotation;
      const ax = { x: Math.cos(r), y: Math.sin(r) };
      const ay = { x: -ax.y, y: ax.x };
      for (const [n, reach, turn] of [
        [ay, table.item.size.depth / 2, r],
        [{ x: -ay.x, y: -ay.y }, table.item.size.depth / 2, r],
        [ax, table.item.size.width / 2, r + Math.PI / 2],
        [{ x: -ax.x, y: -ax.y }, table.item.size.width / 2, r + Math.PI / 2],
      ] as const) {
        const off = reach + rack.depth / 2;
        const item = fromAsset(id, pt(table.item.position.x + n.x * off, table.item.position.y + n.y * off), turn)!;
        const outline = rectCorners(item.position, item.size, item.rotation);
        if (!clearBeside(outline, table.outline)) continue;
        placed.push({ item, outline });
        break;
      }
    }
    if (brand) {
      for (const o of placed.slice(fixed)) {
        if (isRack(o)) o.item.accessories = [{ id: newId('acc'), assetRef: RACK_SIGN }];
      }
      const want = Math.max(1, Math.floor(area / 40));
      let podiums = bays([['105-09-001']], gap, want);
      if (!podiums.length && gap > aisle) podiums = bays([['105-09-001']], aisle, want);
      placed.push(...podiums.flat());
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
      // Racks on the room's own walls (those at interior walls have no wall above them to hang it on).
      .filter((p) => p.item.modules?.length && rackWall.has(p.item.id) && fits(rackWall.get(p.item.id)!))
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
