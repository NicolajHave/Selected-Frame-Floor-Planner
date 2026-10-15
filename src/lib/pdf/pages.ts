import type { jsPDF as JsPdf } from 'jspdf';
import type { Project } from '@/model/project';
import type { ElevationSpec } from '../views';
import { wallFrame } from '@/geometry/openings';
import { wallHeightOf, wallStyle } from '@/geometry/wallStyle';
import {
  CONTACT,
  CONTENT_BOTTOM,
  CONTENT_TOP,
  INK,
  MARGIN,
  MUTED,
  PAGE_H,
  PAGE_W,
  PAPER_GREY,
  RULE,
  SAGE,
  font,
  num,
} from './style';

export interface DocInfo {
  /** Project name. */
  name: string;
  date: string;
  /** The plan's live 3D view, or null. */
  liveUrl: string | null;
}

/** Page title, project and date top right, brand bottom right. Numbers are added last. */
export function pageFrame(doc: JsPdf, info: DocInfo, title: string, opts: { brand?: boolean; liveLink?: boolean } = {}) {
  font(doc, 16);
  doc.text(title, MARGIN, MARGIN + 8);
  font(doc, 8.5, 'normal', MUTED);
  doc.text(`${info.name} | ${info.date}`, PAGE_W - MARGIN, MARGIN + 7, { align: 'right' });
  if (opts.brand !== false) brand(doc, 13);
  if (opts.liveLink && info.liveUrl) {
    font(doc, 8, 'normal', MUTED);
    const label = 'Explore it yourself in 3D: ';
    doc.text(label, MARGIN, PAGE_H - MARGIN);
    font(doc, 8, 'normal', SAGE);
    doc.textWithLink(info.liveUrl, MARGIN + doc.getTextWidth(label) + 0.5, PAGE_H - MARGIN, { url: info.liveUrl });
  }
}

function brand(doc: JsPdf, size: number) {
  font(doc, size);
  doc.text('Selected Frame', PAGE_W - MARGIN, PAGE_H - MARGIN, { align: 'right' });
}

/** "x/N" centred at the foot of every page. */
export function numberPages(doc: JsPdf) {
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    font(doc, 7.5, 'normal', MUTED);
    doc.text(`${i}/${n}`, PAGE_W / 2, PAGE_H - MARGIN + 1, { align: 'center' });
  }
}

// ---------------------------------------------------------------------------
// Cover
// ---------------------------------------------------------------------------

type QrMatrix = { size: number; get(row: number, col: number): number };

export function drawCover(doc: JsPdf, info: DocInfo, qr: QrMatrix | null) {
  font(doc, 8.5, 'normal', MUTED);
  doc.text(`${info.name} | ${info.date}`, PAGE_W - MARGIN, MARGIN + 7, { align: 'right' });

  font(doc, 150);
  doc.text('Selected', MARGIN + 4, 84);

  font(doc, 22);
  doc.text(doc.splitTextToSize(info.name, 220) as string[], MARGIN + 6, 128);
  font(doc, 14, 'normal', MUTED);
  doc.text(info.date, MARGIN + 6, 140);

  font(doc, 10);
  doc.text(`For any enquiries - please reach out to ${CONTACT}`, MARGIN + 6, PAGE_H - 36);

  if (qr && info.liveUrl) {
    const size = 52;
    const x = PAGE_W - MARGIN - 4 - 96;
    const y = 112;
    font(doc, 9, 'bold');
    doc.text('LIVE 3D VIEW', x, y - 6);
    drawQr(doc, qr, x, y, size);
    doc.link(x, y, size, size, { url: info.liveUrl });
    const tx = x + size + 6;
    font(doc, 9.5);
    doc.text(
      doc.splitTextToSize(
        'Scan the code or click the link to walk around the shop in 3D. It always shows the latest version of this plan.',
        96 - size - 6,
      ) as string[],
      tx,
      y + 3,
    );
    // The whole address, broken across lines if it has to be: it may be typed in.
    font(doc, 7.5, 'normal', SAGE);
    breakUrl(doc, info.liveUrl, 96).forEach((line, i) =>
      doc.textWithLink(line, x, y + size + 6 + i * 3.4, { url: info.liveUrl! }),
    );
  }
  brand(doc, 20);
}

/** Splits a URL into lines no wider than `width` at the current font. */
function breakUrl(doc: JsPdf, url: string, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const ch of url) {
    if (line && doc.getTextWidth(line + ch) > width) {
      lines.push(line);
      line = '';
    }
    line += ch;
  }
  return line ? [...lines, line] : lines;
}

/** Vector QR code: one filled square per dark module, inside a white quiet zone. */
export function drawQr(doc: JsPdf, qr: QrMatrix, x: number, y: number, size: number) {
  const m = size / (qr.size + 4);
  doc.setFillColor(255, 255, 255);
  doc.rect(x, y, size, size, 'F');
  doc.setFillColor(...INK);
  for (let r = 0; r < qr.size; r++) {
    // Merge runs of dark modules in a row into one rectangle.
    let c = 0;
    while (c < qr.size) {
      if (!qr.get(r, c)) {
        c++;
        continue;
      }
      const start = c;
      while (c < qr.size && qr.get(r, c)) c++;
      doc.rect(x + (start + 2) * m, y + (r + 2) * m, (c - start) * m + 0.02, m + 0.02, 'F');
    }
  }
}

// ---------------------------------------------------------------------------
// Concept and site readiness
// ---------------------------------------------------------------------------

const INTRO =
  'This draft shows the proposed Selected Frame layout. Nothing on these pages is final — design, scope and dates are confirmed together in the Final Installation Alignment before anything is ordered. The points below describe what a Selected Frame installation asks of the site, so they can be planned for early.';

const HOW_IT_RUNS = [
  'The installation area needs to be ready and accessible at the time agreed in the Final Alignment.',
  'Delays from unfinished site preparation affect the installation timeline.',
  'On-site work beyond the Selected Frame scope is aligned separately.',
  'Local requirements, restrictions or changes need to reach us before installation is planned.',
];

const SITE_READINESS = [
  'The space is fully cleared of existing fixtures, stock and materials.',
  'Walls are finished and painted in the concept colour: NCS S 1005-G30Y (gloss 10).',
  'Flooring is completed and protected where required.',
  'Electrical work is completed to the electrical plan, which follows with the final drawings. LED logos are fitted on the installation days, so a local electrician will need to be booked once dates are set.',
  'Power outlets are installed, tested and ready for use.',
  'Internet access is available for digital screens, where applicable.',
  'Permissions, access approvals and mall or store regulations are handled locally.',
];

export function drawConceptPage(doc: JsPdf, info: DocInfo, project: Project, extraNotes: string[]) {
  pageFrame(doc, info, 'What the concept involves');
  const left = MARGIN;
  const leftW = 250;
  const right = MARGIN + leftW + 22;
  const rightW = PAGE_W - MARGIN - right;
  const lh = 5.9;

  let y = CONTENT_TOP + 2;
  font(doc, 7.5, 'bold', MUTED);
  doc.text('SELECTED FRAME · DRAFT', left, y);
  y += 8;
  font(doc, 12);
  const intro = doc.splitTextToSize(INTRO, leftW) as string[];
  doc.text(intro, left, y, { lineHeightFactor: 1.4 });
  y += intro.length * lh + 8;

  const section = (title: string, lead: string | null, bullets: string[]) => {
    font(doc, 9.5, 'bold');
    doc.text(title, left, y);
    y += 6;
    if (lead) {
      font(doc, 12);
      doc.text(lead, left, y);
      y += lh + 1;
    }
    font(doc, 12);
    for (const b of bullets) {
      const lines = doc.splitTextToSize(b, leftW - 5) as string[];
      doc.text('•', left, y);
      doc.text(lines, left + 5, y, { lineHeightFactor: 1.4 });
      y += lines.length * lh + 1.6;
    }
    y += 7;
  };
  section('HOW AN INSTALLATION RUNS', null, HOW_IT_RUNS);
  section(
    'SITE READINESS',
    'Before installation the site will need to be at this point — it is confirmed in the Final Alignment:',
    SITE_READINESS,
  );

  // Notes for this draft
  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.2);
  doc.line(right - 11, CONTENT_TOP, right - 11, CONTENT_BOTTOM);
  let ny = CONTENT_TOP + 2;
  font(doc, 8.5, 'bold');
  doc.text('NOTES FOR THIS DRAFT', right, ny);
  ny += 8;
  const paragraphs = [
    ...(project.notes ?? '')
      .split(/\n\s*\n|\r?\n/)
      .map((p) => p.trim())
      .filter(Boolean),
    ...extraNotes,
  ];
  if (paragraphs.length === 0) {
    font(doc, 10, 'normal', MUTED);
    doc.text('No notes for this draft.', right, ny);
    return;
  }
  font(doc, 11.5);
  for (const p of paragraphs) {
    const lines = doc.splitTextToSize(p, rightW) as string[];
    if (ny + lines.length * 5.7 > CONTENT_BOTTOM) break;
    doc.text(lines, right, ny, { lineHeightFactor: 1.4 });
    ny += lines.length * 5.7 + 5;
  }
}

// ---------------------------------------------------------------------------
// 3D pictures
// ---------------------------------------------------------------------------

/** Area a full-page picture fills. */
export const VIEW_BOX = { x: MARGIN, y: CONTENT_TOP, w: PAGE_W - 2 * MARGIN, h: CONTENT_BOTTOM - CONTENT_TOP };

export function drawViewPage(doc: JsPdf, info: DocInfo, title: string, image: string | undefined) {
  pageFrame(doc, info, title, { liveLink: true });
  const b = VIEW_BOX;
  if (image) doc.addImage(image, 'JPEG', b.x, b.y, b.w, b.h, undefined, 'FAST');
  else missingPicture(doc, b.x, b.y, b.w, b.h);
}

function missingPicture(doc: JsPdf, x: number, y: number, w: number, h: number) {
  doc.setFillColor(...PAPER_GREY);
  doc.rect(x, y, w, h, 'F');
  font(doc, 9, 'normal', MUTED);
  doc.text('Picture not available', x + w / 2, y + h / 2, { align: 'center' });
}

// ---------------------------------------------------------------------------
// Elevations
// ---------------------------------------------------------------------------

const CELL_GAP = 9;
const CAPTION = 7;
const LADDER = 26;

export interface ElevationLayout {
  cols: number;
  rows: number;
  cellW: number;
  cellH: number;
  imgW: number;
  imgH: number;
}

/** Two per page across the full width for long walls, otherwise four (2 × 2). */
export function elevationLayout(project: Project): ElevationLayout {
  const room = project.room;
  let widest = 0;
  if (room) {
    room.corners.forEach((_, i) => {
      const w = wallFrame(room, i);
      if (w) widest = Math.max(widest, (w.length + 1000) / (wallHeightOf(room, i) + 600));
    });
  }
  const cols = widest > 2.4 ? 1 : 2;
  const rows = 2;
  const cellW = (VIEW_BOX.w - (cols - 1) * CELL_GAP) / cols;
  const cellH = (VIEW_BOX.h - (rows - 1) * CELL_GAP) / rows;
  return { cols, rows, cellW, cellH, imgW: cellW - LADDER, imgH: cellH - CAPTION };
}

export function drawElevationPages(
  doc: JsPdf,
  info: DocInfo,
  specs: ElevationSpec[],
  images: Record<string, string>,
  layout: ElevationLayout,
) {
  const perPage = layout.cols * layout.rows;
  specs.forEach((spec, k) => {
    if (k % perPage === 0) {
      doc.addPage('a3', 'landscape');
      pageFrame(doc, info, 'Elevations', { liveLink: true });
    }
    const slot = k % perPage;
    const x = VIEW_BOX.x + (slot % layout.cols) * (layout.cellW + CELL_GAP);
    const y = VIEW_BOX.y + Math.floor(slot / layout.cols) * (layout.cellH + CELL_GAP);
    drawElevation(doc, spec, images[spec.shot.id], x, y, layout);
  });
}

function drawElevation(
  doc: JsPdf,
  spec: ElevationSpec,
  image: string | undefined,
  x: number,
  y: number,
  layout: ElevationLayout,
) {
  font(doc, 9, 'bold');
  doc.text(`Wall ${spec.wallIndex + 1}`, x, y + 4);
  const label = `Wall ${spec.wallIndex + 1}`;
  font(doc, 8, 'normal', MUTED);
  doc.text(
    `${num(spec.length / 1000, 2, true)} m long · ${num(spec.height / 1000, 2, true)} m high${spec.transparent ? ' · transparent' : ''} · seen from inside`,
    x + doc.getTextWidth(label) + 9,
    y + 4,
  );

  const ix = x;
  const iy = y + CAPTION;
  const { imgW, imgH } = layout;
  if (image) doc.addImage(image, 'JPEG', ix, iy, imgW, imgH, undefined, 'FAST');
  else missingPicture(doc, ix, iy, imgW, imgH);

  // Height ladder: floor to wall top, a tick per height, labels nudged apart.
  const f = spec.frustumMm;
  const Y = (h: number) => iy + ((f.top - h) / (f.top - f.bottom)) * imgH;
  const lx = ix + imgW + 4;
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.25);
  doc.line(lx, Y(0), lx, Y(spec.height));
  doc.line(lx - 1.5, Y(0), lx + 1.5, Y(0));

  const ticks = [...spec.heights].sort((a, b) => b - a);
  let lastLabelY = -Infinity;
  const MIN_GAP = 3.1;
  for (const h of ticks) {
    const ty = Y(h);
    // Faint guide across the picture so the height can be matched to the fixture.
    doc.setDrawColor(...SAGE);
    doc.setLineWidth(0.12);
    doc.setLineDashPattern([0.8, 0.8], 0);
    doc.line(ix, ty, ix + imgW, ty);
    doc.setLineDashPattern([], 0);
    doc.setDrawColor(...INK);
    doc.setLineWidth(0.25);
    doc.line(lx - 1.5, ty, lx + 1.5, ty);
    const labelY = Math.max(ty + 1, lastLabelY + MIN_GAP);
    if (labelY - 1 - ty > 0.6) {
      doc.setLineWidth(0.12);
      doc.line(lx + 1.5, ty, lx + 3.5, labelY - 1);
    }
    font(doc, 7, h === spec.height ? 'bold' : 'normal');
    doc.text(num(h), lx + 4, labelY);
    lastLabelY = labelY;
  }
  font(doc, 6, 'normal', MUTED);
  doc.text('mm', lx + 4, Math.max(Y(0) + 1, lastLabelY + MIN_GAP));
}
