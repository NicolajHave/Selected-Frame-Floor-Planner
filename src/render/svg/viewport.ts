'use client';

import type { ViewState } from '@/model/project';
import type { Point } from '@/model/geometry';
import type { Mm } from '@/model/units';

/**
 * The SVG canvas wraps content in:
 *
 *   <g transform="translate(pan.x, pan.y) scale(zoom)">
 *
 * world.x mm * zoom + pan.x = screen.x  px (relative to svg origin)
 *
 * Children draw in mm; only this module knows about pixels.
 */
export interface ScreenPoint { x: number; y: number; }

export function worldToScreen(view: ViewState, p: Point): ScreenPoint {
  return {
    x: p.x * view.zoom + view.pan.x,
    y: p.y * view.zoom + view.pan.y,
  };
}

export function screenToWorld(view: ViewState, screen: ScreenPoint): Point {
  return {
    x: ((screen.x - view.pan.x) / view.zoom) as Mm,
    y: ((screen.y - view.pan.y) / view.zoom) as Mm,
  };
}

/**
 * Convert a DOM event's clientX/clientY into world coords, given the
 * bounding rect of the <svg> element.
 */
export function eventToWorld(
  view: ViewState,
  rect: DOMRect,
  clientX: number,
  clientY: number,
): Point {
  return screenToWorld(view, {
    x: clientX - rect.left,
    y: clientY - rect.top,
  });
}

/** Stroke widths divided by zoom keep visual lines at constant pixel size. */
export function pxStroke(view: ViewState, px: number): number {
  return px / view.zoom;
}

/** Compute pan/zoom that fits a world-space bounding box into a viewport. */
export function fitToBounds(
  bounds: { min: Point; max: Point },
  viewport: { width: number; height: number },
  padding = 80,
): Pick<ViewState, 'zoom' | 'pan'> {
  const w = bounds.max.x - bounds.min.x;
  const h = bounds.max.y - bounds.min.y;
  if (w <= 0 || h <= 0) return { zoom: 0.05, pan: { x: viewport.width / 2, y: viewport.height / 2 } };

  const innerW = Math.max(50, viewport.width - padding * 2);
  const innerH = Math.max(50, viewport.height - padding * 2);
  const zoom = Math.min(innerW / w, innerH / h);

  // Centre the bounds in the viewport
  const cx = (bounds.min.x + bounds.max.x) / 2;
  const cy = (bounds.min.y + bounds.max.y) / 2;
  return {
    zoom,
    pan: {
      x: viewport.width / 2 - cx * zoom,
      y: viewport.height / 2 - cy * zoom,
    },
  };
}
