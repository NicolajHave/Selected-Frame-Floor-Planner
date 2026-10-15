import type { jsPDF as JsPdf } from 'jspdf';

// A3 landscape, mm
export const PAGE_W = 420;
export const PAGE_H = 297;
export const MARGIN = 12;
/** Top of the content below a page's title. */
export const CONTENT_TOP = MARGIN + 16;
/** Bottom of the content above a page's footer. */
export const CONTENT_BOTTOM = PAGE_H - MARGIN - 12;

export type Rgb = [number, number, number];
export const INK: Rgb = [22, 24, 26];
export const MUTED: Rgb = [107, 112, 119];
export const RULE: Rgb = [210, 208, 200];
export const SAGE: Rgb = [115, 126, 98];
export const PAPER_GREY: Rgb = [236, 236, 236];

export const CONTACT = 'SELECTEDSIS@bestseller.com';

/** Danish number formatting; `fixed` always shows `digits` decimals. */
export const num = (n: number, digits = 0, fixed = false) =>
  n.toLocaleString('da-DK', { maximumFractionDigits: digits, minimumFractionDigits: fixed ? digits : 0 });

export const today = () => new Date().toLocaleDateString('da-DK');

/** Truncate text with an ellipsis to fit `width` mm at the current font. */
export function fit(doc: JsPdf, text: string, width: number): string {
  if (doc.getTextWidth(text) <= width) return text;
  let t = text;
  while (t.length > 1 && doc.getTextWidth(`${t}…`) > width) t = t.slice(0, -1);
  return `${t}…`;
}

export function font(doc: JsPdf, size: number, style: 'normal' | 'bold' = 'normal', color: Rgb = INK) {
  doc.setFont('helvetica', style);
  doc.setFontSize(size);
  doc.setTextColor(...color);
}
