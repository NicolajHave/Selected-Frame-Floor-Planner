import type { Point } from '@/model/geometry';
import type { Project } from '@/model/project';
import type { RoomPolygon } from '@/model/objects';
import type { Mm } from '@/model/units';
import { rectCorners } from '@/geometry/transform';
import { signedArea } from '@/geometry/polygon';
import { openingSpan } from '@/geometry/openings';
import {
  closestOnSegment,
  convexOverlap,
  edges,
  outlineGap,
  pointInPolygon,
  rayHit,
  segmentGap,
  type Gap,
  type Polygon,
} from '@/geometry/footprint';
import { findAsset } from './assetCatalog';

export const DEFAULT_MIN_AISLE = 900;

/** Gaps below this are treated as "pushed together", not as an aisle. */
const TOUCHING = 100;
/** Items lower than this (trays, signs, carpets) sit on furniture or are walked over. */
const MIN_OBSTACLE_HEIGHT = 300;
/** Room to stand in front of a passage or out-swinging door. */
const DOOR_APPROACH = 900;

const pt = (x: number, y: number): Point => ({ x: x as Mm, y: y as Mm });

export interface Obstacle {
  kind: 'pillar' | 'inventory';
  id: string;
  name: string;
  outline: Polygon;
}

/** Things that stand on the floor and block movement. */
export function floorObstacles(project: Project): Obstacle[] {
  const out: Obstacle[] = project.pillars.map((p) => ({
    kind: 'pillar' as const,
    id: p.id,
    name: 'Pillar',
    outline: rectCorners(p.position, p.size, p.rotation),
  }));
  for (const it of project.inventory) {
    const asset = findAsset(it.assetRef);
    if (it.size.height < MIN_OBSTACLE_HEIGHT) continue;
    if (asset?.mountHeight) continue; // hangs on the wall above head height
    out.push({ kind: 'inventory', id: it.id, name: it.name, outline: rectCorners(it.position, it.size, it.rotation) });
  }
  return out;
}

/**
 * The room's inner outline: each wall's inside face, i.e. the polygon edges
 * moved half a wall thickness into the room, mitred at the corners.
 */
export function innerOutline(room: RoomPolygon): Polygon | null {
  const n = room.corners.length;
  if (!room.closed || n < 3) return null;
  const pts = room.corners.map((c) => c.point);
  const sign = signedArea(pts) >= 0 ? 1 : -1;
  const h = room.wallThickness / 2;
  const normal = (a: Point, b: Point) => {
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: (sign * -(b.y - a.y)) / len, y: (sign * (b.x - a.x)) / len };
  };
  return pts.map((p, i) => {
    const prev = pts[(i - 1 + n) % n]!;
    const next = pts[(i + 1) % n]!;
    const n1 = normal(prev, p);
    const n2 = normal(p, next);
    // Mitre: move along the bisector so both adjacent faces sit h inside.
    const bx = n1.x + n2.x;
    const by = n1.y + n2.y;
    const dot = n1.x * n2.x + n1.y * n2.y;
    if (1 + dot < 1e-6) return pt(p.x + n1.x * h, p.y + n1.y * h); // hairpin
    const k = h / (1 + dot);
    return pt(p.x + bx * k, p.y + by * k);
  });
}

export type IssueKind = 'overlap' | 'wall' | 'door' | 'aisle';

export interface LayoutIssue {
  key: string;
  kind: IssueKind;
  message: string;
  /** Objects involved, for highlighting and click-to-select. */
  objectIds: string[];
  /** Where to point at on the plan. */
  at: Point;
  /** For aisles: the narrowest gap. */
  gap?: Gap;
}

const fmt = (mm: number) => `${Math.round(mm).toLocaleString('da-DK')} mm`;

function centroid(poly: Polygon): Point {
  return pt(
    poly.reduce((s, p) => s + p.x, 0) / poly.length,
    poly.reduce((s, p) => s + p.y, 0) / poly.length,
  );
}

/** Clear zone a door or passage needs on the room side. */
export function doorZones(room: RoomPolygon): { id: string; name: string; zone: Polygon }[] {
  const h = room.wallThickness / 2;
  return room.openings.flatMap((o) => {
    if (o.kind === 'window') return [];
    const s = openingSpan(room, o);
    if (!s) return [];
    const swingsIn = (o.kind === 'door' || o.kind === 'double-door') && o.swing === 'in';
    const leaf = o.kind === 'double-door' ? s.width / 2 : s.width;
    const depth = swingsIn ? Math.max(leaf, DOOR_APPROACH) : DOOR_APPROACH;
    const at = (p: Point, d: number) => pt(p.x + s.nx * d, p.y + s.ny * d);
    const name = o.kind === 'opening' ? 'passage' : 'door';
    return [{ id: o.id, name, zone: [at(s.p1, h), at(s.p2, h), at(s.p2, h + depth), at(s.p1, h + depth)] }];
  });
}

/**
 * Checks the layout for overlapping objects, objects in or through walls,
 * blocked doors and aisles narrower than `minAisle`.
 */
export function layoutIssues(project: Project, minAisle = DEFAULT_MIN_AISLE): LayoutIssue[] {
  const issues: LayoutIssue[] = [];
  const obstacles = floorObstacles(project);
  const room = project.room;
  const inner = room ? innerOutline(room) : null;
  const faces = inner ? edges(inner) : [];

  // Objects in or through walls / outside the room
  if (inner) {
    for (const o of obstacles) {
      const outside = o.outline.some(
        (p) => !pointInPolygon(p, inner) && faces.every(([a, b]) => dist(p, closestOnSegment(p, a, b)) > 2),
      );
      if (outside) {
        issues.push({
          key: `wall:${o.id}`,
          kind: 'wall',
          message: `${o.name} sticks into a wall or out of the room.`,
          objectIds: [o.id],
          at: centroid(o.outline),
        });
      }
    }
  }

  // Overlaps and narrow gaps between objects
  for (let i = 0; i < obstacles.length; i++) {
    for (let j = i + 1; j < obstacles.length; j++) {
      const a = obstacles[i]!;
      const b = obstacles[j]!;
      if (convexOverlap(a.outline, b.outline)) {
        issues.push({
          key: `overlap:${a.id}:${b.id}`,
          kind: 'overlap',
          message: `${a.name} and ${b.name} overlap.`,
          objectIds: [a.id, b.id],
          at: centroid([...a.outline, ...b.outline]),
        });
        continue;
      }
      const gap = outlineGap(a.outline, b.outline);
      if (gap.distance > TOUCHING && gap.distance < minAisle) {
        issues.push({
          key: `aisle:${a.id}:${b.id}`,
          kind: 'aisle',
          message: `Only ${fmt(gap.distance)} between ${a.name} and ${b.name}.`,
          objectIds: [a.id, b.id],
          at: mid(gap.from, gap.to),
          gap,
        });
      }
    }
  }

  // Narrow gaps between objects and walls (narrowest per object)
  for (const o of obstacles) {
    if (issues.some((x) => x.kind === 'wall' && x.objectIds[0] === o.id)) continue;
    let best: Gap | null = null;
    for (const [a, b] of faces) {
      const g = segmentGap(o.outline, a, b);
      if (!best || g.distance < best.distance) best = g;
    }
    if (best && best.distance > TOUCHING && best.distance < minAisle) {
      issues.push({
        key: `aisle:${o.id}:wall`,
        kind: 'aisle',
        message: `Only ${fmt(best.distance)} between ${o.name} and the wall.`,
        objectIds: [o.id],
        at: mid(best.from, best.to),
        gap: best,
      });
    }
  }

  // Blocked doors and passages
  if (room) {
    for (const d of doorZones(room)) {
      for (const o of obstacles) {
        if (convexOverlap(d.zone, o.outline)) {
          issues.push({
            key: `door:${d.id}:${o.id}`,
            kind: 'door',
            message: `${o.name} blocks a ${d.name}.`,
            objectIds: [o.id, d.id],
            at: centroid(d.zone),
          });
        }
      }
    }
  }

  return issues;
}

export interface Guide {
  from: Point;
  to: Point;
  distance: number;
}

const DIRECTIONS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/** Guides longer than this are clutter, not information. */
const MAX_GUIDE = 15000;

/**
 * Distance from an object's outline to the nearest wall face or other floor
 * object straight left, right, up and down on the plan. Rays start at the
 * outline's corners and edge midpoints that face each direction; the
 * shortest hit per direction becomes a guide.
 */
export function clearanceGuides(project: Project, outline: Polygon, excludeId: string): Guide[] {
  const room = project.room;
  const inner = room ? innerOutline(room) : null;
  const segments: [Point, Point][] = [
    ...(inner ? edges(inner) : []),
    ...floorObstacles(project)
      .filter((o) => o.id !== excludeId)
      .flatMap((o) => edges(o.outline)),
  ];
  if (segments.length === 0) return [];

  const sides = edges(outline);
  const guides: Guide[] = [];
  for (const [dx, dy] of DIRECTIONS) {
    const extreme = Math.max(...outline.map((p) => p.x * dx + p.y * dy));
    // Origins: points on the outline's leading face in this direction.
    const origins: Point[] = [];
    for (const [a, b] of sides) {
      const m = mid(a, b);
      for (const p of [a, m, b]) {
        if (extreme - (p.x * dx + p.y * dy) < 1) origins.push(p);
      }
    }
    let best: Guide | null = null;
    for (const o of origins) {
      const t = rayHit(o, dx, dy, segments);
      if (t < MAX_GUIDE && (!best || t < best.distance)) {
        best = { from: o, to: pt(o.x + dx * t, o.y + dy * t), distance: t };
      }
    }
    if (best && best.distance >= 1) guides.push(best);
  }
  return guides;
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function mid(a: Point, b: Point): Point {
  return pt((a.x + b.x) / 2, (a.y + b.y) / 2);
}
