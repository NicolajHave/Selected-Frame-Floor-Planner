'use client';

import type { Point } from '@/model/geometry';
import type { PlanDimension, ViewState } from '@/model/project';
import { pxStroke } from './viewport';
import { Dimension } from './LayoutMarks';

const KEPT = '#3A3D40';
const LIVE = '#2563EB';

const length = (a: Point, b: Point) => Math.round(Math.hypot(b.x - a.x, b.y - a.y));

/**
 * Kept dimension lines, and the measurement in progress. While measuring,
 * each kept line gets a × to remove it.
 */
export function MeasureMarks({
  dimensions,
  live,
  view,
  editable,
  onRemove,
}: {
  dimensions: readonly PlanDimension[];
  live: { a: Point; b: Point } | null;
  view: ViewState;
  editable: boolean;
  onRemove: (id: string) => void;
}) {
  const r = pxStroke(view, 7);
  const dot = pxStroke(view, 3);
  return (
    <g data-layer="dimensions">
      {dimensions.map((d) => (
        <g key={d.id} data-kept-dimension={length(d.a, d.b)} pointerEvents="none">
          <Dimension from={d.a} to={d.b} label={`${length(d.a, d.b)}`} color={KEPT} view={view} />
        </g>
      ))}
      {editable &&
        dimensions.map((d) => {
          const mx = (d.a.x + d.b.x) / 2;
          const my = (d.a.y + d.b.y) / 2;
          return (
            <g
              key={`x-${d.id}`}
              role="button"
              data-remove-dimension
              aria-label={`Remove the ${length(d.a, d.b)} mm dimension`}
              className="cursor-pointer"
              onPointerDown={(e) => {
                e.stopPropagation();
                onRemove(d.id);
              }}
            >
              <circle cx={mx} cy={my} r={r} fill="#F6F5F1" stroke={KEPT} strokeWidth={pxStroke(view, 1)} />
              <path
                d={`M${mx - r * 0.4},${my - r * 0.4}L${mx + r * 0.4},${my + r * 0.4}M${mx + r * 0.4},${my - r * 0.4}L${mx - r * 0.4},${my + r * 0.4}`}
                stroke={KEPT}
                strokeWidth={pxStroke(view, 1.3)}
              />
            </g>
          );
        })}
      {live && (
        <g data-live-measure={length(live.a, live.b)} pointerEvents="none">
          {length(live.a, live.b) > 0 && <Dimension from={live.a} to={live.b} label={`${length(live.a, live.b)}`} color={LIVE} view={view} />}
          <circle cx={live.a.x} cy={live.a.y} r={dot} fill={LIVE} />
          <circle cx={live.b.x} cy={live.b.y} r={dot} fill={LIVE} />
        </g>
      )}
    </g>
  );
}
