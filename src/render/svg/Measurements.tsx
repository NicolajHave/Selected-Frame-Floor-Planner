'use client';

import type { RoomPolygon } from '@/model/objects';
import type { ViewState, DerivedMetrics } from '@/model/project';
import { formatAngle, formatArea, formatLength } from '@/model/units';
import { pxStroke } from './viewport';
import { polygonCentroid } from '@/geometry/polygon';

interface Props {
  room: RoomPolygon;
  view: ViewState;
  metrics: DerivedMetrics;
}

export function Measurements({ room, view, metrics }: Props) {
  const fontMain = pxStroke(view, 11);
  const fontSub = pxStroke(view, 10);

  const { corners, closed } = room;
  const last = closed ? corners.length : corners.length - 1;

  const labels: React.ReactNode[] = [];

  // Wall length labels — placed at edge midpoints, offset perpendicular.
  for (let i = 0; i < last; i++) {
    const a = corners[i]!.point;
    const b = corners[(i + 1) % corners.length]!.point;
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    // perpendicular offset, outward-ish
    const off = pxStroke(view, 14);
    const nx = -dy / len;
    const ny = dx / len;

    labels.push(
      <text
        key={`L-${i}`}
        x={mx + nx * off}
        y={my + ny * off}
        fontSize={fontMain}
        fontFamily="var(--font-sans)"
        textAnchor="middle"
        dominantBaseline="middle"
        fill="var(--wall-stroke)"
        pointerEvents="none"
      >
        {formatLength(metrics.wallLengths[i] ?? 0)}
      </text>,
    );
  }

  // Corner angles — only when closed and >= 3 corners.
  if (closed && corners.length >= 3) {
    for (let i = 0; i < corners.length; i++) {
      const angle = metrics.cornerAngles[i] ?? 0;
      if (angle === 0) continue;
      const c = corners[i]!.point;
      // pull label slightly toward centroid
      const centroid = polygonCentroid(corners.map((cc) => cc.point));
      let lx: number = c.x;
      let ly: number = c.y;
      if (centroid) {
        const ux = centroid.x - c.x;
        const uy = centroid.y - c.y;
        const m = Math.hypot(ux, uy) || 1;
        const off = pxStroke(view, 22);
        lx = c.x + (ux / m) * off;
        ly = c.y + (uy / m) * off;
      }
      labels.push(
        <text
          key={`A-${i}`}
          x={lx}
          y={ly}
          fontSize={fontSub}
          fontFamily="var(--font-sans)"
          textAnchor="middle"
          dominantBaseline="middle"
          fill="var(--inv-stroke)"
          pointerEvents="none"
          letterSpacing="0.04em"
        >
          {formatAngle(angle)}
        </text>,
      );
    }
  }

  // Area label at centroid
  if (closed && metrics.area > 0) {
    const centroid = polygonCentroid(corners.map((c) => c.point));
    if (centroid) {
      labels.push(
        <text
          key="area"
          x={centroid.x}
          y={centroid.y}
          fontSize={pxStroke(view, 14)}
          fontFamily="var(--font-display)"
          textAnchor="middle"
          dominantBaseline="middle"
          fill="var(--wall-stroke)"
          pointerEvents="none"
          fontStyle="italic"
        >
          {formatArea(metrics.area)}
        </text>,
      );
    }
  }

  return <g>{labels}</g>;
}
