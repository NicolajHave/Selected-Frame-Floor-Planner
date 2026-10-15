'use client';

import type { jsPDF as JsPdf } from 'jspdf';
import type { Point } from '@/model/geometry';
import type { Project } from '@/model/project';
import type { ElectricalPoint, RoomPolygon } from '@/model/objects';
import type { Mm } from '@/model/units';
import { rectCorners } from '@/geometry/transform';
import { openingSpan, wallFrame } from '@/geometry/openings';
import { polygonArea } from '@/geometry/polygon';
import { wallLengths } from '@/geometry/walls';
import { findAsset } from './assetCatalog';
import { electricalType } from './electricalTypes';
import { electricalAnchor } from '@/geometry/electrical';
import { rackContents } from './racks';
import { wallHeightOf, wallStyle } from '@/geometry/wallStyle';
import { buildPartsList, type PartsList } from './partsList';
import { DEFAULT_MIN_AISLE, innerOutline, layoutIssues } from './layout';
import { elevationShots, overviewShots, type ElevationSpec, type ViewSpec } from './views';
import { INK, MARGIN, MUTED, PAGE_H, PAGE_W, SAGE, fit, font, num, today } from './pdf/style';
import {
  VIEW_BOX,
  drawConceptPage,
  drawCover,
  drawElevationPages,
  drawViewPage,
  elevationLayout,
  numberPages,
  pageFrame,
  type DocInfo,
} from './pdf/pages';

/** Standard architectural scales, finest first. */
const SCALES = [20, 25, 50, 75, 100, 125, 150, 200, 250, 300, 400, 500, 750, 1000];

const COLUMN = 92; // right-hand legend / title block
const GUTTER = 8;
const HEADER = 14;
const FOOTER = 14;
/** Paper space around the plan for wall dimensions. */
const DIM_SPACE = 14;

const WALL: [number, number, number] = [43, 46, 49];
const EL_INK: [number, number, number] = [180, 83, 9];
const ITEM_FILL: [number, number, number] = [233, 235, 227];
const FLOOR: [number, number, number] = [246, 244, 238];

const pt = (x: number, y: number): Point => ({ x: x as Mm, y: y as Mm });

/** Pixels per paper mm for the 3D pictures (≈ 120 dpi). */
const PX_PER_MM = 4.8;

export interface PdfOptions {
  /** Draw the imported plan faintly under the drawing. */
  includeUnderlay: boolean;
  /** The plan's live 3D view, printed on the cover with a QR code. */
  liveUrl?: string | null;
  /** 3D views, an isometric and wall elevations (rendered with WebGL). */
  views?: boolean;
  onProgress?: (message: string) => void;
}

/**
 * Builds the A3 presentation PDF: cover (with the live 3D link), concept
 * and site readiness with the draft's notes, 3D views from four sides, an
 * isometric, the plan to scale, an elevation of every wall with heights,
 * then the parts list and layout check.
 */
export async function buildPlanPdf(project: Project, opts: PdfOptions): Promise<JsPdf> {
  const progress = opts.onProgress ?? (() => {});
  const { jsPDF, GState } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3', compress: true });
  doc.setProperties({ title: `${project.name} — shop plan`, creator: 'Selected Frame Shop Planner' });
  const info: DocInfo = { name: project.name || 'Untitled plan', date: today(), liveUrl: opts.liveUrl ?? null };

  const parts = buildPartsList(project.inventory);
  // Fixtures are numbered by parts-list row; wall racks are R1, R2, …
  const numberOf = new Map<string, string>();
  const racks = project.inventory.filter((it) => it.modules?.length);
  racks.forEach((it, k) => numberOf.set(it.id, `R${k + 1}`));
  parts.rows.forEach((r, i) => r.itemIds.forEach((id) => numberOf.has(id) || numberOf.set(id, String(i + 1))));

  // Pictures first: the slow part, and it can fail without WebGL.
  const extraNotes: string[] = [];
  let overview: ViewSpec[] = [];
  let elevations: ElevationSpec[] = [];
  let images: Record<string, string> = {};
  const layout = elevationLayout(project);
  if (opts.views !== false) {
    overview = overviewShots(project, VIEW_BOX.w / VIEW_BOX.h);
    elevations = elevationShots(project, layout.imgW / layout.imgH);
    if (overview.length + elevations.length > 0) {
      progress('Rendering 3D views…');
      try {
        const { renderShots } = await import('@/render/three/offscreen');
        images = await renderShots(project, [
          ...overview.map((v) => ({ spec: v.shot, width: px(VIEW_BOX.w), height: px(VIEW_BOX.h) })),
          ...elevations.map((v) => ({ spec: v.shot, width: px(layout.imgW), height: px(layout.imgH) })),
        ]);
      } catch (e) {
        console.warn('3D pictures failed', e);
        extraNotes.push('The 3D pictures could not be rendered in this browser; open the live link to see the shop in 3D.');
        overview = [];
        elevations = [];
      }
    }
  }

  progress('Building PDF…');
  let qr = null;
  if (info.liveUrl) {
    const QR = await import('qrcode');
    qr = QR.create(info.liveUrl, { errorCorrectionLevel: 'M' }).modules;
  }
  drawCover(doc, info, qr);
  doc.addPage('a3', 'landscape');
  drawConceptPage(doc, info, project, extraNotes);

  for (const v of overview) {
    doc.addPage('a3', 'landscape');
    drawViewPage(doc, info, v.shot.kind === 'ortho' ? 'Isometric View' : '3D View', images[v.shot.id]);
  }

  doc.addPage('a3', 'landscape');
  drawPlanPage(doc, info, project, parts, numberOf, opts, GState);
  const elLabels = electricalLabels(project);
  if (elLabels.size > 0) {
    doc.addPage('a3', 'landscape');
    drawPlanPage(doc, info, project, parts, numberOf, opts, GState, elLabels);
  }
  drawElevationPages(doc, info, elevations, images, layout, (spec) =>
    (project.electrical ?? [])
      .filter((e) => e.wallStartCornerId === spec.wallStartCornerId && !e.position)
      .map((e) => ({
        x: spec.sign * ((e.offset ?? 0) - spec.length / 2),
        height: e.height,
        label: elLabels.get(e.id) ?? '',
      })),
  );
  drawListPages(doc, info, project, parts);
  numberPages(doc);
  return doc;
}

const px = (paperMm: number) => Math.round(paperMm * PX_PER_MM);

export async function downloadPlanPdf(project: Project, opts: PdfOptions): Promise<void> {
  const doc = await buildPlanPdf(project, opts);
  const base = (project.name || 'plan').trim().replace(/\s+/g, '-').toLowerCase();
  doc.save(`${base}-plan.pdf`);
}

// ---------------------------------------------------------------------------
// Page 1: the drawing
// ---------------------------------------------------------------------------

type GStateCtor = typeof import('jspdf').GState;

function drawPlanPage(
  doc: JsPdf,
  info: DocInfo,
  project: Project,
  parts: PartsList,
  numberOf: Map<string, string>,
  opts: PdfOptions,
  GState: GStateCtor,
  /** The electrical plan: fixtures faint, outlets numbered E1…, their legend in the column. */
  electrical: Map<string, string> | null = null,
) {
  const room = project.room;
  const area = {
    x: MARGIN,
    y: MARGIN + HEADER,
    w: PAGE_W - 2 * MARGIN - COLUMN - GUTTER,
    h: PAGE_H - 2 * MARGIN - HEADER - FOOTER,
  };

  // The title block in the column carries the brand.
  pageFrame(doc, info, electrical ? 'Electrical Plan' : 'Plan View', { brand: false });
  const column = (scale: number | null) =>
    electrical
      ? drawColumn(doc, project, parts, scale, {
          heading: 'ELECTRICAL',
          rows: electricalLegend(project, electrical),
          empty: 'No electrical points.',
          more: 'see the elevations',
        })
      : drawColumn(doc, project, parts, scale);

  // World extent of everything that gets drawn
  const pts: Point[] = [];
  if (room) {
    const h = room.wallThickness;
    for (const { point: c } of room.corners) {
      pts.push(pt(c.x - h, c.y), pt(c.x + h, c.y), pt(c.x, c.y - h), pt(c.x, c.y + h));
    }
  }
  for (const it of project.inventory) pts.push(...rectCorners(it.position, it.size, it.rotation));
  for (const p of project.pillars) pts.push(...rectCorners(p.position, p.size, p.rotation));
  // The plan sets the scale; an underlay only fills in around it (clipped
  // below), unless it is the only thing there is.
  const u = opts.includeUnderlay ? project.underlay : null;
  if (u && pts.length === 0) {
    pts.push(u.position, pt(u.position.x + u.width, u.position.y + u.width * u.aspect));
  }

  if (pts.length === 0) {
    doc.setFontSize(12);
    doc.text('Nothing to draw yet — draw the room and place fixtures first.', area.x, area.y + 20);
    column(null);
    return;
  }

  const minX = Math.min(...pts.map((p) => p.x));
  const minY = Math.min(...pts.map((p) => p.y));
  const worldW = Math.max(...pts.map((p) => p.x)) - minX;
  const worldH = Math.max(...pts.map((p) => p.y)) - minY;
  const availW = area.w - 2 * DIM_SPACE;
  const availH = area.h - 2 * DIM_SPACE;
  const scale =
    SCALES.find((s) => worldW / s <= availW && worldH / s <= availH) ??
    Math.ceil(Math.max(worldW / availW, worldH / availH) / 100) * 100;

  const ox = area.x + (area.w - worldW / scale) / 2;
  const oy = area.y + (area.h - worldH / scale) / 2;
  const X = (x: number) => ox + (x - minX) / scale;
  const Y = (y: number) => oy + (y - minY) / scale;
  const P = (p: Point) => [X(p.x), Y(p.y)] as const;

  // Underlay, faint and clipped to the drawing area
  if (u) {
    doc.saveGraphicsState();
    doc.rect(area.x, area.y, area.w, area.h, null);
    doc.clip();
    doc.discardPath();
    doc.setGState(new GState({ opacity: 0.22 }));
    doc.addImage(u.src, 'JPEG', X(u.position.x), Y(u.position.y), u.width / scale, (u.width * u.aspect) / scale);
    doc.restoreGraphicsState();
  }

  if (room?.closed) {
    const inner = innerOutline(room);
    if (inner) polygon(doc, inner.map(P), FLOOR, null);
    drawWalls(doc, room, P);
    drawOpenings(doc, room, P, scale);
    drawWallDimensions(doc, room, P, scale);
    drawWallNumbers(doc, room, P);
  } else if (room) {
    doc.setDrawColor(...WALL);
    doc.setLineWidth(0.5);
    for (let i = 0; i + 1 < room.corners.length; i++) {
      doc.line(...P(room.corners[i]!.point), ...P(room.corners[i + 1]!.point));
    }
  }

  for (const p of project.pillars) {
    polygon(doc, rectCorners(p.position, p.size, p.rotation).map(P), [85, 88, 92], null);
  }

  for (const it of project.inventory) {
    const corners = rectCorners(it.position, it.size, it.rotation).map(P);
    // On the electrical plan fixtures are only there for orientation.
    polygon(doc, corners, electrical ? [250, 250, 248] : ITEM_FILL, electrical ? [190, 192, 186] : SAGE, 0.2);
    if (electrical) continue;
    // Back edge: the side that goes against a wall.
    doc.setDrawColor(...SAGE);
    doc.setLineWidth(0.6);
    doc.line(...corners[0]!, ...corners[1]!);
  }
  if (electrical) {
    drawElectricalPoints(doc, project, electrical, P);
  } else {
    // Numbers last so they sit on top of everything.
    for (const it of project.inventory) {
      const n = numberOf.get(it.id);
      if (n !== undefined) badge(doc, X(it.position.x), Y(it.position.y), n);
    }
    drawPlanNotes(doc, project, P);
  }

  drawScaleBar(doc, scale, area.x, PAGE_H - MARGIN - 4);
  column(scale);
}

/** Electrical points numbered along the walls (wall 1 first, from its start), floor boxes last. */
export function electricalLabels(project: Project): Map<string, string> {
  const room = project.room;
  const order = (e: ElectricalPoint) => {
    const i = room && e.wallStartCornerId ? room.corners.findIndex((c) => c.id === e.wallStartCornerId) : -1;
    return i < 0 ? 1e9 : i * 1e6 + (e.offset ?? 0);
  };
  const sorted = [...(project.electrical ?? [])].sort((a, b) => order(a) - order(b));
  return new Map(sorted.map((e, k) => [e.id, `E${k + 1}`]));
}

function electricalLegend(project: Project, labels: Map<string, string>): LegendRow[] {
  const room = project.room;
  return [...(project.electrical ?? [])]
    .sort((a, b) => Number(labels.get(a.id)!.slice(1)) - Number(labels.get(b.id)!.slice(1)))
    .map((e) => {
      const t = electricalType(e.kind);
      const a = electricalAnchor(room, e);
      const where = a?.index != null ? `wall ${a.index + 1} · ${num(e.height)} mm up` : 'in the floor';
      return { badge: labels.get(e.id)!, title: t.name, sub: e.note ? `${where} · ${e.note}` : where };
    });
}

function drawElectricalPoints(
  doc: JsPdf,
  project: Project,
  labels: Map<string, string>,
  P: (p: Point) => readonly [number, number],
) {
  for (const e of project.electrical ?? []) {
    const a = electricalAnchor(project.room, e);
    if (!a) continue;
    const [x, y] = P(a.point);
    // Badge just inside the room, a tick to the wall.
    const bx = x + a.nx * 4;
    const by = y + a.ny * 4;
    doc.setDrawColor(...EL_INK);
    doc.setLineWidth(0.3);
    if (a.index !== null) doc.line(x, y, bx, by);
    doc.setFillColor(255, 248, 238);
    doc.circle(bx, by, 2.6, 'FD');
    font(doc, 6, 'bold', EL_INK);
    doc.text(labels.get(e.id) ?? '', bx, by, { align: 'center', baseline: 'middle' });
  }
}

/** Notes written on the plan: a boxed text and an arrow. */
function drawPlanNotes(doc: JsPdf, project: Project, P: (p: Point) => readonly [number, number]) {
  for (const n of project.annotations ?? []) {
    if (!n.text.trim()) continue;
    const [x, y] = P(n.position);
    font(doc, 7);
    const lines = n.text.split('\n').flatMap((l) => doc.splitTextToSize(l, 48) as string[]);
    const w = Math.max(...lines.map((l) => doc.getTextWidth(l))) + 4;
    const h = lines.length * 3.1 + 2.4;
    if (n.target) {
      const [tx, ty] = P(n.target);
      const len = Math.hypot(tx - x, ty - y) || 1;
      const ux = (tx - x) / len;
      const uy = (ty - y) / len;
      doc.setDrawColor(...INK);
      doc.setFillColor(...INK);
      doc.setLineWidth(0.25);
      doc.line(x, y, tx - ux * 1.8, ty - uy * 1.8);
      doc.triangle(tx, ty, tx - ux * 1.8 - uy * 0.8, ty - uy * 1.8 + ux * 0.8, tx - ux * 1.8 + uy * 0.8, ty - uy * 1.8 - ux * 0.8, 'F');
    }
    doc.setFillColor(255, 253, 247);
    doc.setDrawColor(...INK);
    doc.setLineWidth(0.25);
    doc.rect(x - w / 2, y - h / 2, w, h, 'FD');
    font(doc, 7);
    lines.forEach((l, i) => doc.text(l, x, y - h / 2 + 3.4 + i * 3.1, { align: 'center' }));
  }
}

function polygon(
  doc: JsPdf,
  pts: (readonly [number, number])[],
  fill: [number, number, number] | null,
  stroke: [number, number, number] | null,
  lineWidth = 0.2,
) {
  if (pts.length < 3) return;
  const [x0, y0] = pts[0]!;
  const deltas = pts.slice(1).map(([x, y], i) => [x - pts[i]![0], y - pts[i]![1]]);
  if (fill) doc.setFillColor(...fill);
  if (stroke) {
    doc.setDrawColor(...stroke);
    doc.setLineWidth(lineWidth);
  }
  doc.lines(deltas, x0, y0, [1, 1], fill && stroke ? 'FD' : fill ? 'F' : 'S', true);
}

function badge(doc: JsPdf, x: number, y: number, label: string) {
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.25);
  doc.circle(x, y, 2.4, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...INK);
  doc.text(label, x, y, { align: 'center', baseline: 'middle' });
}

/** Walls as solid bands, interrupted by their openings. */
function drawWalls(doc: JsPdf, room: RoomPolygon, P: (p: Point) => readonly [number, number]) {
  const half = room.wallThickness / 2;
  for (let i = 0; i < room.corners.length; i++) {
    const w = wallFrame(room, i);
    if (!w) continue;
    const holes = room.openings
      .filter((o) => o.wallStartCornerId === room.corners[i]!.id)
      .map((o) => openingSpan(room, o))
      .filter((s): s is NonNullable<typeof s> => !!s)
      .sort((a, b) => a.offset - b.offset);
    const clear = !!wallStyle(room, i).transparent;
    const piece = (from: number, to: number) => {
      if (to - from < 1) return;
      const at = (d: number, side: number) =>
        pt(w.a.x + w.ux * d + w.nx * half * side, w.a.y + w.uy * d + w.ny * half * side);
      if (!clear) {
        polygon(doc, [at(from, -1), at(to, -1), at(to, 1), at(from, 1)].map(P), WALL, null);
        return;
      }
      // See-through wall: outline only, dashed.
      doc.setDrawColor(...WALL);
      doc.setLineWidth(0.2);
      doc.setLineDashPattern([1.2, 0.8], 0);
      doc.line(...P(at(from, -1)), ...P(at(to, -1)));
      doc.line(...P(at(from, 1)), ...P(at(to, 1)));
      doc.setLineDashPattern([], 0);
    };
    let cursor = -half;
    for (const s of holes) {
      piece(cursor, s.offset - s.width / 2);
      cursor = Math.max(cursor, s.offset + s.width / 2);
    }
    piece(cursor, w.length + half);
  }
}

function drawOpenings(doc: JsPdf, room: RoomPolygon, P: (p: Point) => readonly [number, number], scale: number) {
  const half = room.wallThickness / 2;
  doc.setDrawColor(...INK);
  for (const o of room.openings) {
    const s = openingSpan(room, o);
    if (!s) continue;
    const at = (p: Point, d: number) => pt(p.x + s.nx * d, p.y + s.ny * d);
    doc.setLineWidth(0.3);
    doc.setLineDashPattern([], 0);
    for (const p of [s.p1, s.p2]) doc.line(...P(at(p, -half)), ...P(at(p, half)));

    const side = o.swing === 'in' ? 1 : -1;
    const leaf = (hinge: Point, free: Point, len: number) => {
      const tip = at(hinge, side * len);
      doc.setLineWidth(0.35);
      doc.line(...P(hinge), ...P(tip));
      // Quarter arc from the open leaf tip back to the closed position.
      const a0 = Math.atan2(tip.y - hinge.y, tip.x - hinge.x);
      let a1 = Math.atan2(free.y - hinge.y, free.x - hinge.x);
      if (a1 - a0 > Math.PI) a1 -= 2 * Math.PI;
      if (a0 - a1 > Math.PI) a1 += 2 * Math.PI;
      const steps = 16;
      const arc = Array.from({ length: steps + 1 }, (_, k) => {
        const a = a0 + ((a1 - a0) * k) / steps;
        return P(pt(hinge.x + Math.cos(a) * len, hinge.y + Math.sin(a) * len));
      });
      doc.setLineWidth(0.15);
      doc.setLineDashPattern([0.8, 0.6], 0);
      doc.lines(arc.slice(1).map(([x, y], k) => [x - arc[k]![0], y - arc[k]![1]]), arc[0]![0], arc[0]![1]);
      doc.setLineDashPattern([], 0);
    };
    if (o.kind === 'door') {
      if (o.hinge === 'start') leaf(s.p1, s.p2, s.width);
      else leaf(s.p2, s.p1, s.width);
    } else if (o.kind === 'double-door') {
      leaf(s.p1, s.center, s.width / 2);
      leaf(s.p2, s.center, s.width / 2);
    } else if (o.kind === 'opening') {
      doc.setLineWidth(0.15);
      doc.setLineDashPattern([1.5, 1], 0);
      doc.line(...P(s.p1), ...P(s.p2));
      doc.setLineDashPattern([], 0);
    } else {
      doc.setLineWidth(0.15);
      for (const k of [-0.5, 0, 0.5]) doc.line(...P(at(s.p1, half * k)), ...P(at(s.p2, half * k)));
    }
    // Opening width, inside the room
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(...MUTED);
    const label = at(s.center, half + 4 * scale);
    doc.text(num(s.width), ...P(label), { align: 'center', baseline: 'middle' });
  }
}

/** Each wall's length on a dimension line just outside the room. */
function drawWallDimensions(doc: JsPdf, room: RoomPolygon, P: (p: Point) => readonly [number, number], scale: number) {
  const lengths = wallLengths(room.corners, room.closed);
  const offset = room.wallThickness / 2 + 6 * scale;
  doc.setDrawColor(...MUTED);
  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  lengths.forEach((len, i) => {
    const w = wallFrame(room, i);
    if (!w || len < 1) return;
    const out = (p: Point, d: number) => pt(p.x - w.nx * d, p.y - w.ny * d);
    const a = P(out(w.a, offset));
    const b = P(out(w.b, offset));
    doc.setLineWidth(0.15);
    doc.line(...a, ...b);
    for (const p of [w.a, w.b]) doc.line(...P(out(p, offset - 2 * scale)), ...P(out(p, offset + 2 * scale)));
    // Readable from the bottom or the right: angle in (−90°, 90°].
    let angle = (-Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
    if (angle > 90) angle -= 180;
    if (angle <= -90) angle += 180;
    // Sit the text 1 mm off the line on the side its "up" points to.
    const rad = (angle * Math.PI) / 180;
    const upX = -Math.sin(rad);
    const upY = -Math.cos(rad);
    const tx = (a[0] + b[0]) / 2 + upX * 1;
    const ty = (a[1] + b[1]) / 2 + upY * 1;
    doc.text(num(len), tx, ty, { align: 'center', angle });
  });
}

/** The room's wall height, or the range when walls differ. */
function wallHeightLabel(room: RoomPolygon): string {
  const hs = room.corners.map((_, i) => wallHeightOf(room, i));
  const lo = Math.min(...hs);
  const hi = Math.max(...hs);
  return lo === hi ? `${num(lo)} mm` : `${num(lo)}–${num(hi)} mm`;
}

/** "Wall n" just inside each wall, matching the elevation pages. */
function drawWallNumbers(doc: JsPdf, room: RoomPolygon, P: (p: Point) => readonly [number, number]) {
  room.corners.forEach((_, i) => {
    const w = wallFrame(room, i);
    if (!w || w.length < 1000) return;
    const a = P(w.a);
    const b = P(w.b);
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 1e-6) return;
    // Paper-space inward normal from the paper-space wall direction.
    const n = P(pt(w.a.x + w.nx * 1000, w.a.y + w.ny * 1000));
    const nl = Math.hypot(n[0] - a[0], n[1] - a[1]);
    const nx = (n[0] - a[0]) / nl;
    const ny = (n[1] - a[1]) / nl;
    const t = (room.wallThickness / 2) * (nl / 1000) + 3.2;
    font(doc, 6.5, 'bold', SAGE);
    doc.text(`W${i + 1}`, (a[0] + b[0]) / 2 + nx * t, (a[1] + b[1]) / 2 + ny * t, { align: 'center', baseline: 'middle' });
  });
}

function drawScaleBar(doc: JsPdf, scale: number, x: number, y: number) {
  // Longest round length that stays under ~70 mm of paper.
  const candidates = [500, 1000, 2000, 5000, 10000, 20000, 50000];
  const len = [...candidates].reverse().find((l) => l / scale <= 70) ?? candidates[0]!;
  const paper = len / scale;
  const segments = 5;
  doc.setLineWidth(0.2);
  doc.setDrawColor(...INK);
  for (let i = 0; i < segments; i++) {
    doc.setFillColor(...(i % 2 === 0 ? INK : ([255, 255, 255] as [number, number, number])));
    doc.rect(x + (paper / segments) * i, y - 1.5, paper / segments, 1.5, 'FD');
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...INK);
  doc.text('0', x, y - 2.5, { align: 'center' });
  doc.text(`${num(len / 1000, 1)} m`, x + paper, y - 2.5, { align: 'center' });
  doc.text(`Scale 1:${scale} on A3`, x + paper + 6, y);
}

interface LegendRow {
  badge: string;
  title: string;
  sub: string;
}

/** Wall racks (R1…) then fixtures by parts-list row. */
function fixtureLegend(project: Project, parts: PartsList): LegendRow[] {
  return [
    ...project.inventory
      .filter((it) => it.modules?.length)
      .map((it, k) => ({ badge: `R${k + 1}`, title: it.name, sub: rackContents(it.modules!) })),
    ...parts.rows.map((r, i) => ({
      badge: String(i + 1),
      title: `${r.quantity}× ${r.name}`,
      sub: r.catalog ? r.itemNumber || 'no item number' : 'not in catalog',
    })),
  ];
}

/** A numbered legend (fixtures, or electrical points) and the title block. */
function drawColumn(
  doc: JsPdf,
  project: Project,
  parts: PartsList,
  scale: number | null,
  legend: { heading: string; rows: LegendRow[]; empty: string; more: string } = {
    heading: 'FIXTURES',
    rows: fixtureLegend(project, parts),
    empty: 'No fixtures placed.',
    more: 'see the parts list',
  },
) {
  const x = PAGE_W - MARGIN - COLUMN;
  let y = MARGIN + HEADER;
  doc.setDrawColor(...MUTED);
  doc.setLineWidth(0.2);
  doc.line(x - GUTTER / 2, MARGIN, x - GUTTER / 2, PAGE_H - MARGIN);

  font(doc, 9, 'bold');
  doc.text(legend.heading, x, y);
  y += 6;

  const titleTop = PAGE_H - MARGIN - 62;
  const rowH = 6.2;
  const entries = legend.rows;
  const fits = Math.max(0, Math.floor((titleTop - y - 8) / rowH));
  const shown = entries.length > fits ? fits - 1 : entries.length;
  entries.slice(0, Math.max(0, shown)).forEach((r) => {
    badge(doc, x + 2.4, y - 1, r.badge);
    font(doc, 8);
    doc.text(fit(doc, r.title, COLUMN - 8), x + 7, y - 1.6);
    font(doc, 6, 'normal', MUTED);
    doc.text(fit(doc, r.sub, COLUMN - 8), x + 7, y + 1.2);
    y += rowH;
  });
  if (entries.length === 0) {
    font(doc, 8, 'normal', MUTED);
    doc.text(legend.empty, x, y);
  } else if (shown < entries.length) {
    font(doc, 7, 'normal', MUTED);
    doc.text(`+ ${entries.length - shown} more — ${legend.more}`, x, y);
  }

  // Title block
  const room = project.room;
  const areaM2 = room?.closed ? polygonArea(room.corners.map((c) => c.point)) / 1e6 : 0;
  const walls = room ? wallLengths(room.corners, room.closed).reduce((a, b) => a + b, 0) : 0;
  const rows: [string, string][] = [
    ['Project', project.name || 'Untitled plan'],
    ['Date', new Date().toLocaleDateString('da-DK')],
    ['Scale', scale ? `1:${scale} (A3)` : '—'],
    ['Floor area', room?.closed ? `${num(areaM2, 2, true)} m²` : '—'],
    ['Wall length', room ? `${num(walls / 1000, 2, true)} m` : '—'],
    ['Wall height', room ? wallHeightLabel(room) : '—'],
    ['Fixtures', `${parts.totalUnits} units · ${num(parts.totalWeightKg, 1)} kg`],
    ['Hanger capacity', parts.totalHangers ? num(parts.totalHangers) : '—'],
  ];
  let ty = titleTop;
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.3);
  doc.rect(x, ty - 5, COLUMN, PAGE_H - MARGIN - ty + 5);
  for (const [k, v] of rows) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(k.toUpperCase(), x + 3, ty);
    doc.setFontSize(8);
    doc.setTextColor(...INK);
    doc.text(fit(doc, v, COLUMN - 36), x + 33, ty);
    ty += 6;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('Selected Frame · Shop Planner', x + 3, PAGE_H - MARGIN - 2.5);
}

// ---------------------------------------------------------------------------
// Page 2+: parts list, layout check, notes
// ---------------------------------------------------------------------------

function drawListPages(doc: JsPdf, info: DocInfo, project: Project, parts: PartsList) {
  const TOP = MARGIN + 24;
  const BOTTOM = PAGE_H - MARGIN - 10;
  const page = () => {
    doc.addPage('a3', 'landscape');
    pageFrame(doc, info, 'Parts list & checks');
  };
  page();
  let y = TOP;
  const newPageIfNeeded = (need: number) => {
    if (y + need > BOTTOM) {
      page();
      y = TOP;
    }
  };
  const heading = (text: string) => {
    newPageIfNeeded(14);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(...INK);
    doc.text(text, MARGIN, y);
    y += 8;
  };

  heading('Parts list');
  const cols = [
    { title: 'No.', w: 12, align: 'left' as const },
    { title: 'Item number', w: 34, align: 'left' as const },
    { title: 'Name', w: 92, align: 'left' as const },
    { title: 'Category', w: 34, align: 'left' as const },
    { title: 'Qty', w: 14, align: 'right' as const },
    { title: 'W × D × H (mm)', w: 50, align: 'left' as const },
    { title: 'Material', w: 50, align: 'left' as const },
    { title: 'Unit kg', w: 22, align: 'right' as const },
    { title: 'Total kg', w: 24, align: 'right' as const },
    { title: 'Hangers', w: 20, align: 'right' as const },
    { title: 'HS codes', w: 44, align: 'left' as const },
  ];
  const row = (cells: string[], bold = false) => {
    newPageIfNeeded(7);
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...INK);
    let x = MARGIN;
    cells.forEach((c, i) => {
      const col = cols[i]!;
      const text = fit(doc, c, col.w - 2);
      if (col.align === 'right') doc.text(text, x + col.w - 2, y, { align: 'right' });
      else doc.text(text, x, y);
      x += col.w;
    });
    doc.setDrawColor(220, 218, 210);
    doc.setLineWidth(0.15);
    doc.line(MARGIN, y + 2, x, y + 2);
    y += 6;
  };
  row(cols.map((c) => c.title), true);
  parts.rows.forEach((r, i) =>
    row([
      String(i + 1),
      r.itemNumber,
      r.name,
      r.category,
      String(r.quantity),
      `${num(r.width)} × ${num(r.depth)} × ${num(r.height)}`,
      r.material,
      r.unitWeightKg !== undefined ? num(r.unitWeightKg, 1) : '',
      r.totalWeightKg !== undefined ? num(r.totalWeightKg, 1) : '',
      r.totalHangers !== undefined ? num(r.totalHangers) : '',
      r.hsCodes.join(' / '),
    ]),
  );
  row(
    ['', '', 'Total', '', String(parts.totalUnits), '', '', '', num(parts.totalWeightKg, 1),
      parts.totalHangers ? num(parts.totalHangers) : '', ''],
    true,
  );
  if (parts.unitsWithoutWeight) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(`${parts.unitsWithoutWeight} unit(s) have no weight in the catalog and are not included in the total.`, MARGIN, y);
    y += 6;
  }

  y += 6;
  const minAisle = project.minAisle ?? DEFAULT_MIN_AISLE;
  heading('Layout check');
  const issues = layoutIssues(project, minAisle);
  const line = (text: string, color: [number, number, number] = INK) => {
    newPageIfNeeded(6);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...color);
    doc.text(text, MARGIN, y);
    y += 5.5;
  };
  line(`Minimum aisle width: ${num(minAisle)} mm.`, MUTED);
  if (issues.length === 0) line('No overlaps, blocked doors or narrow aisles.');
  for (const i of issues) line(`• ${i.message}`, i.kind === 'aisle' ? [180, 83, 9] : [185, 28, 28]);

  const notes: string[] = [];
  const minWall = Math.max(
    0,
    ...project.inventory.map((it) => findAsset(it.assetRef)?.minWallHeight ?? 0),
  );
  if (minWall > 0) {
    notes.push(`Wall-hung logos hang with their bottom edge at 2.4 m: walls must be at least ${num(minWall / 1000, 1)} m high.`);
  }
  if (project.underlay && !project.underlay.calibrated) {
    notes.push(`The imported plan (${project.underlay.fileName}) was not scaled from a known distance.`);
  }
  if (notes.length) {
    y += 6;
    heading('Notes');
    for (const n of notes) line(`• ${n}`);
  }
}
