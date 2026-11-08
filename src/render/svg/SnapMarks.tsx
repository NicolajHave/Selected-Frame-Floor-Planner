'use client';

import type { ViewState } from '@/model/project';
import type { Mm } from '@/model/units';
import type { SnapGuide } from '@/geometry/objectSnap';
import { pxStroke } from './viewport';
import { Dimension } from './LayoutMarks';

const ALIGN = '#C2410C';

/** What a dragged fixture snapped to: alignment lines and kept aisles. */
export function SnapMarks({ guides, view }: { guides: SnapGuide[]; view: ViewState }) {
  if (!guides.length) return null;
  const w = pxStroke(view, 1);
  const pad = pxStroke(view, 12);
  return (
    <g data-layer="snap-guides" pointerEvents="none">
      {guides.map((g, i) =>
        g.kind === 'align' ? (
          <line
            key={i}
            data-snap="align"
            x1={g.axis === 'x' ? g.at : g.from - pad}
            x2={g.axis === 'x' ? g.at : g.to + pad}
            y1={g.axis === 'x' ? g.from - pad : g.at}
            y2={g.axis === 'x' ? g.to + pad : g.at}
            stroke={ALIGN}
            strokeWidth={w}
            strokeDasharray={`${pxStroke(view, 4)} ${pxStroke(view, 3)}`}
          />
        ) : (
          <g key={i} data-snap="gap">
            <Dimension
              from={{ x: g.from.x as Mm, y: g.from.y as Mm }}
              to={{ x: g.to.x as Mm, y: g.to.y as Mm }}
              label={`${Math.round(g.distance)}`}
              color={ALIGN}
              view={view}
            />
          </g>
        ),
      )}
    </g>
  );
}
