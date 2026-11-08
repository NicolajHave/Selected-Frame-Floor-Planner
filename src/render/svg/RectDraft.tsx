'use client';

import type { Point } from '@/model/geometry';
import type { ViewState } from '@/model/project';
import { formatLength } from '@/model/units';
import { pxStroke } from './viewport';

/** The rectangle being dragged out, with its width and depth. */
export function RectDraft({ a, b, view }: { a: Point; b: Point; view: ViewState }) {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const w = Math.abs(b.x - a.x);
  const h = Math.abs(b.y - a.y);
  const font = pxStroke(view, 12);
  const gap = pxStroke(view, 8);
  return (
    <g pointerEvents="none" data-testid="rect-draft">
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        fill="var(--floor, rgba(0,0,0,0.04))"
        stroke="var(--wall-stroke)"
        strokeWidth={pxStroke(view, 2)}
        strokeDasharray={`${pxStroke(view, 6)} ${pxStroke(view, 4)}`}
      />
      {w > 0 && (
        <text x={x + w / 2} y={y - gap} textAnchor="middle" fontSize={font} fontFamily="var(--font-sans)" fill="var(--wall-stroke)">
          {formatLength(w)}
        </text>
      )}
      {h > 0 && (
        <text
          x={x + w + gap}
          y={y + h / 2}
          dominantBaseline="middle"
          fontSize={font}
          fontFamily="var(--font-sans)"
          fill="var(--wall-stroke)"
        >
          {formatLength(h)}
        </text>
      )}
    </g>
  );
}
