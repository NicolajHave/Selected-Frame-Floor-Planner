import type { Project } from '@/model/project';
import type { Point } from '@/model/geometry';
import { rectCorners } from '@/geometry/transform';
import { wallFrame } from '@/geometry/openings';
import { findAsset } from './assetCatalog';
import { itemMount } from './racks';
import { tallestWall, wallHeightOf, wallStyle } from '@/geometry/wallStyle';

/** A camera for one picture, in scene metres (x, y up, z). */
export type ShotSpec =
  | {
      id: string;
      kind: 'perspective';
      position: [number, number, number];
      target: [number, number, number];
      fov: number;
    }
  | {
      id: string;
      kind: 'ortho';
      position: [number, number, number];
      target: [number, number, number];
      /** Visible extent around the target, metres (right/up are positive). */
      frustum: { left: number; right: number; top: number; bottom: number };
      near: number;
      far: number;
    };

export interface ViewSpec {
  shot: ShotSpec;
  title: string;
}

export interface ElevationSpec extends ViewSpec {
  wallIndex: number;
  /** Wall length and height, mm. */
  length: number;
  height: number;
  /** Visible area in mm: x along the wall from its centre, y up from the floor. */
  frustumMm: { left: number; right: number; top: number; bottom: number };
  /** Heights (mm) worth dimensioning on this wall, ascending. */
  heights: number[];
  transparent: boolean;
  /** Fixtures and pillars (ids) that stand at this wall: drawn in full. */
  atWall: string[];
  /**
   * Fixtures (ids) mounted on a wall behind the viewer, their backs to the
   * picture: left out, like the wall they are on.
   */
  behindViewer: string[];
  /** The wall's start corner, for anchoring things drawn on top. */
  wallStartCornerId: string;
  /**
   * Picture x (mm from the centre, + to the right) of a point `d` mm along
   * the wall is `sign * (d - length / 2)`: the camera faces the wall from
   * inside, so the wall may run either way across the picture.
   */
  sign: number;
}

const M = 0.001;

/** Everything that has to be in the pictures, in plan mm. */
function extent(project: Project) {
  const pts: Point[] = [
    ...(project.room?.corners.map((c) => c.point) ?? []),
    ...project.inventory.flatMap((i) => rectCorners(i.position, i.size, i.rotation)),
    ...project.pillars.flatMap((p) => rectCorners(p.position, p.size, p.rotation)),
  ];
  if (pts.length === 0) return null;
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const tallest = Math.max(
    project.room ? tallestWall(project.room) : 0,
    ...project.inventory.map((i) => (findAsset(i.assetRef)?.mountHeight ?? 0) + i.size.height),
    ...project.pillars.map((p) => p.size.height),
  );
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
    height: tallest || 2700,
  };
}

/**
 * Four views from outside, one from each side, a little off-axis and from
 * above (the walls nearest the camera are cut away), plus an isometric.
 */
export function overviewShots(project: Project, aspect: number): ViewSpec[] {
  const e = extent(project);
  if (!e) return [];
  const cx = ((e.minX + e.maxX) / 2) * M;
  const cz = ((e.minY + e.maxY) / 2) * M;
  const w = (e.maxX - e.minX) * M;
  const d = (e.maxY - e.minY) * M;
  const h = e.height * M;
  const target: [number, number, number] = [cx, h * 0.38, cz];

  const fov = 34;
  const radius = Math.hypot(w, d, h) / 2;
  const box: [number, number, number][] = [];
  for (const x of [e.minX * M, e.maxX * M]) {
    for (const z of [e.minY * M, e.maxY * M]) {
      for (const y of [0, h]) box.push([x, y, z]);
    }
  }

  const elevation = (24 * Math.PI) / 180;
  const sides: { title: string; azimuth: number }[] = [
    { title: '3D view · front', azimuth: 0 },
    { title: '3D view · right', azimuth: 90 },
    { title: '3D view · back', azimuth: 180 },
    { title: '3D view · left', azimuth: 270 },
  ];
  const views: ViewSpec[] = sides.map(({ title, azimuth }, i) => {
    // Azimuth 0 looks at the front (plan bottom, +z) side; nudge 18° for depth.
    const a = ((azimuth + 18) * Math.PI) / 180;
    const dir: [number, number, number] = [
      Math.sin(a) * Math.cos(elevation),
      Math.sin(elevation),
      Math.cos(a) * Math.cos(elevation),
    ];
    const dist = fitDistance(box, target, dir, fov, aspect, radius);
    return {
      title,
      shot: {
        id: `view-${i}`,
        kind: 'perspective',
        fov,
        target,
        position: [target[0] + dir[0] * dist, target[1] + dir[1] * dist, target[2] + dir[2] * dist],
      },
    };
  });

  // Isometric: orthographic, looking down the (1, 1, 1) diagonal.
  const dir = [1, Math.SQRT2 * 0.82, 1].map((v, _, arr) => v / Math.hypot(...arr)) as [number, number, number];
  const right = [dir[2], 0, -dir[0]].map((v, _, arr) => v / Math.hypot(...arr)) as [number, number, number];
  const up = cross(right, dir).map((v) => -v) as [number, number, number];
  const corners = box.map(([x, y, z]) => [x - target[0], y - target[1], z - target[2]]);
  const rs = corners.map((c) => dot(c, right));
  const us = corners.map((c) => dot(c, up));
  const frustum = fitAspect(
    { left: Math.min(...rs), right: Math.max(...rs), bottom: Math.min(...us), top: Math.max(...us) },
    aspect,
    1.08,
  );
  const isoDist = radius * 4;
  views.push({
    title: 'Isometric view',
    shot: {
      id: 'iso',
      kind: 'ortho',
      target,
      position: [target[0] + dir[0] * isoDist, target[1] + dir[1] * isoDist, target[2] + dir[2] * isoDist],
      frustum,
      near: 0.01,
      far: isoDist * 3,
    },
  });
  return views;
}

/** How far in front of a wall (mm) fixtures count as standing against it. */
const NEAR_WALL = 600;

/**
 * One orthographic elevation per wall of at least 1 m, seen square-on from
 * the shop: the wall alone as the backdrop, at its height, with everything
 * that stands in front of it. No other wall is in the picture — whatever
 * side one looks in from is open — and nothing mounted on a wall behind the
 * viewer. What stands at the wall itself (`atWall`) is meant to be drawn in
 * full and the rest of the shop faintly over it, so the wall stays readable.
 */
export function elevationShots(project: Project, aspect: number): ElevationSpec[] {
  const room = project.room;
  if (!room?.closed) return [];
  const things = [
    ...project.inventory.map((it) => ({
      id: it.id,
      outline: rectCorners(it.position, it.size, it.rotation),
      // The way a wall-mounted fixture faces (its back is to its wall).
      front: itemMount(it) === 'wall' || findAsset(it.assetRef)?.mountHeight ? { x: -Math.sin(it.rotation), y: Math.cos(it.rotation) } : null,
    })),
    ...project.pillars.map((p) => ({ id: p.id, outline: rectCorners(p.position, p.size, p.rotation), front: null })),
  ];
  const out: ElevationSpec[] = [];
  room.corners.forEach((_, i) => {
    const w = wallFrame(room, i);
    if (!w || w.length < 1000) return;
    const H = wallHeightOf(room, i);
    const mid = { x: (w.a.x + w.b.x) / 2, y: (w.a.y + w.b.y) / 2 };
    const depthOf = (p: Point) => (p.x - mid.x) * w.nx + (p.y - mid.y) * w.ny;
    // The viewer stands beyond everything in front of the wall, so nothing is cut through.
    const depth = Math.max(...room.corners.map((c) => depthOf(c.point)), ...things.flatMap((t) => t.outline.map(depthOf)));
    const camDist = Math.max(2000, depth + 1000);
    const frustumMm = fitAspect(
      { left: -w.length / 2 - 500, right: w.length / 2 + 500, bottom: -250, top: H + 350 },
      aspect,
      1,
    );
    const atWall: string[] = [];
    const behindViewer: string[] = [];
    for (const t of things) {
      const dists = t.outline.map((p) => (p.x - w.a.x) * w.nx + (p.y - w.a.y) * w.ny);
      const alongs = t.outline.map((p) => (p.x - w.a.x) * w.ux + (p.y - w.a.y) * w.uy);
      const close = Math.min(...dists) <= room.wallThickness / 2 + NEAR_WALL && Math.max(...dists) >= 0;
      const overlaps = Math.max(...alongs) > 0 && Math.min(...alongs) < w.length;
      if (close && overlaps) atWall.push(t.id);
      // Facing the same way the viewer looks (towards this wall): seen from behind.
      else if (t.front && t.front.x * -w.nx + t.front.y * -w.ny > 0.5) behindViewer.push(t.id);
    }
    out.push({
      title: `Elevation · wall ${i + 1}`,
      wallIndex: i,
      length: w.length,
      height: H,
      frustumMm,
      heights: wallHeights(project, i),
      transparent: !!wallStyle(room, i).transparent,
      atWall,
      behindViewer,
      wallStartCornerId: room.corners[i]!.id,
      sign: Math.sign(w.ny * w.ux - w.nx * w.uy) || 1,
      shot: {
        id: `elev-${i}`,
        kind: 'ortho',
        target: [mid.x * M, 0, mid.y * M],
        position: [(mid.x + w.nx * camDist) * M, 0, (mid.y + w.ny * camDist) * M],
        frustum: {
          left: frustumMm.left * M,
          right: frustumMm.right * M,
          top: frustumMm.top * M,
          bottom: frustumMm.bottom * M,
        },
        near: 0.05,
        // Through the wall itself and what hangs on it.
        far: (camDist + 1000) * M,
      },
    });
  });
  return out;
}

/** Where a label goes in a picture: fractions of its width and height from the top-left. */
export interface PictureLabel {
  text: string;
  u: number;
  v: number;
}

/**
 * Where scene point `p` (metres) lands in a picture of `shot` with the
 * given width-to-height ratio; null when it is behind the camera.
 */
export function projectToPicture(shot: ShotSpec, aspect: number, p: [number, number, number]): { u: number; v: number } | null {
  const forward = normalize(shot.target.map((t, i) => t - shot.position[i]!));
  const right = normalize(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  const rel = p.map((v, i) => v - shot.position[i]!);
  const x = dot(rel, right);
  const y = dot(rel, up);
  if (shot.kind === 'ortho') {
    const f = shot.frustum;
    return { u: (x - f.left) / (f.right - f.left), v: (f.top - y) / (f.top - f.bottom) };
  }
  const z = dot(rel, forward);
  if (z <= 0.01) return null;
  const tanV = Math.tan((shot.fov * Math.PI) / 360);
  return { u: (x / (z * tanV * aspect) + 1) / 2, v: (1 - y / (z * tanV)) / 2 };
}

/**
 * "W1", "W2" … for a 3D picture, the same numbers as on the plan: above the
 * top of a wall that shows, and on the floor line just outside a wall that
 * is cut away towards the camera.
 */
export function wallLabels(project: Project, shot: ShotSpec, aspect: number): PictureLabel[] {
  const room = project.room;
  if (!room?.closed) return [];
  const out: PictureLabel[] = [];
  room.corners.forEach((_, i) => {
    const w = wallFrame(room, i);
    if (!w || w.length < 1000) return;
    const mid = { x: (w.a.x + w.b.x) / 2, y: (w.a.y + w.b.y) / 2 };
    // Cut away (or an open side): the camera is on the wall's outside.
    const outside = (shot.position[0] / M - mid.x) * -w.nx + (shot.position[2] / M - mid.y) * -w.ny > 0;
    const shown = !outside && !wallStyle(room, i).transparent;
    const at: [number, number, number] = shown
      ? [mid.x * M, (wallHeightOf(room, i) + 220) * M, mid.y * M]
      : [(mid.x - w.nx * 420) * M, 0, (mid.y - w.ny * 420) * M];
    const spot = projectToPicture(shot, aspect, at);
    if (!spot || spot.u < 0.02 || spot.u > 0.98 || spot.v < 0.03 || spot.v > 0.97) return;
    out.push({ text: `W${i + 1}`, ...spot });
  });
  return out;
}

/** Top (and, for wall-hung items, bottom) heights of fixtures against wall `i`, plus the wall itself. */
export function wallHeights(project: Project, i: number): number[] {
  const room = project.room;
  const w = room ? wallFrame(room, i) : null;
  if (!room || !w) return [];
  const heights: number[] = [wallHeightOf(room, i)];
  const consider = (outline: Point[], bottom: number, top: number, hung: boolean) => {
    const dists = outline.map((p) => (p.x - w.a.x) * w.nx + (p.y - w.a.y) * w.ny);
    const alongs = outline.map((p) => (p.x - w.a.x) * w.ux + (p.y - w.a.y) * w.uy);
    const close = Math.min(...dists) <= room.wallThickness / 2 + NEAR_WALL && Math.max(...dists) >= 0;
    const overlaps = Math.max(...alongs) > 0 && Math.min(...alongs) < w.length;
    if (!close || !overlaps) return;
    heights.push(top);
    if (hung) heights.push(bottom);
  };
  for (const it of project.inventory) {
    const asset = findAsset(it.assetRef);
    const bottom = asset?.mountHeight ?? 0;
    consider(rectCorners(it.position, it.size, it.rotation), bottom, bottom + it.size.height, bottom > 0);
  }
  for (const p of project.pillars) consider(rectCorners(p.position, p.size, p.rotation), 0, p.size.height, false);
  for (const e of project.electrical ?? []) {
    if (e.wallStartCornerId === room.corners[i]!.id && !e.position) heights.push(e.height);
  }
  for (const o of room.openings) {
    if (o.wallStartCornerId !== room.corners[i]!.id) continue;
    heights.push(o.height);
    if (o.sillHeight > 0) heights.push(o.sillHeight);
  }
  const sorted = heights.filter((h) => h > 0).sort((a, b) => a - b);
  return sorted.filter((h, k) => k === 0 || h - sorted[k - 1]! >= 30);
}

/**
 * Camera distance along `dir` (unit, from the target) at which every point
 * of `box` fits in the frame with a small margin.
 */
function fitDistance(
  box: [number, number, number][],
  target: [number, number, number],
  dir: [number, number, number],
  fov: number,
  aspect: number,
  radius: number,
): number {
  const tanV = Math.tan((fov * Math.PI) / 360);
  const tanH = tanV * aspect;
  const forward = dir.map((v) => -v);
  const right = normalize(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  let dist = radius * 3;
  // Perspective size shrinks roughly with distance; a few rounds converge.
  for (let k = 0; k < 6; k++) {
    const cam = target.map((t, i) => t + dir[i]! * dist);
    let worst = 0;
    for (const p of box) {
      const rel = p.map((v, i) => v - cam[i]!);
      const z = dot(rel, forward);
      if (z <= 0.01) {
        worst = Infinity;
        break;
      }
      worst = Math.max(worst, Math.abs(dot(rel, right)) / (z * tanH), Math.abs(dot(rel, up)) / (z * tanV));
    }
    if (!Number.isFinite(worst)) {
      dist *= 1.5;
      continue;
    }
    dist *= worst / 0.92;
  }
  return Math.max(dist, radius * 0.6);
}

function normalize(v: number[]) {
  const l = Math.hypot(...v);
  return v.map((x) => x / l);
}

/** Grow the box so its width/height ratio equals `aspect`, then add `pad` as a factor. */
function fitAspect(
  b: { left: number; right: number; top: number; bottom: number },
  aspect: number,
  pad: number,
) {
  const cx = (b.left + b.right) / 2;
  const cy = (b.top + b.bottom) / 2;
  let w = (b.right - b.left) * pad;
  let h = (b.top - b.bottom) * pad;
  if (w / h > aspect) h = w / aspect;
  else w = h * aspect;
  return { left: cx - w / 2, right: cx + w / 2, bottom: cy - h / 2, top: cy + h / 2 };
}

function dot(a: number[], b: number[]) {
  return a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
}

function cross(a: number[], b: number[]) {
  return [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
}
