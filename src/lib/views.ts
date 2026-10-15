import type { Project } from '@/model/project';
import type { Point } from '@/model/geometry';
import { rectCorners } from '@/geometry/transform';
import { wallFrame } from '@/geometry/openings';
import { findAsset } from './assetCatalog';
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

/** Depth (mm) of the slice in front of a wall that its elevation shows. */
const SECTION_DEPTH = 1600;

/** How far in front of a wall (mm) fixtures count as standing against it. */
const NEAR_WALL = 600;

/**
 * One orthographic elevation per wall of at least 1 m, seen square-on from
 * inside the room, with the heights worth dimensioning on that wall. It
 * shows a slice of the room in front of the wall, like a section.
 */
export function elevationShots(project: Project, aspect: number): ElevationSpec[] {
  const room = project.room;
  if (!room?.closed) return [];
  const out: ElevationSpec[] = [];
  room.corners.forEach((_, i) => {
    const w = wallFrame(room, i);
    if (!w || w.length < 1000) return;
    const H = wallHeightOf(room, i);
    const mid = { x: (w.a.x + w.b.x) / 2, y: (w.a.y + w.b.y) / 2 };
    // Depth of the room in front of this wall: place the camera just inside the far side.
    const depth = Math.max(...room.corners.map((c) => (c.point.x - mid.x) * w.nx + (c.point.y - mid.y) * w.ny));
    const camDist = Math.max(500, depth - 60);
    const frustumMm = fitAspect(
      { left: -w.length / 2 - 500, right: w.length / 2 + 500, bottom: -250, top: H + 350 },
      aspect,
      1,
    );
    out.push({
      title: `Elevation · wall ${i + 1}`,
      wallIndex: i,
      length: w.length,
      height: H,
      frustumMm,
      heights: wallHeights(project, i),
      transparent: !!wallStyle(room, i).transparent,
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
        // Only the slice next to the wall: what stands in the room is left out.
        near: Math.max(0.01, (camDist - SECTION_DEPTH) * M),
        far: (camDist + 1000) * M,
      },
    });
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
