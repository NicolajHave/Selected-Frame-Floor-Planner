'use client';

import { useMemo, useRef } from 'react';
import type { RoomPolygon } from '@/model/objects';
import type { Mm } from '@/model/units';
import type { Polygon } from '@/geometry/footprint';
import { innerOutline } from '@/lib/layout';
import { allowed, type WalkPose } from '@/lib/walk';

/** Longest side of the map, px. */
const SIZE = 180;
const PAD = 8;
/** Length of the view cone on the map, mm. */
const CONE = 2200;
const HALF_ANGLE = 0.5;

const pathOf = (poly: Polygon, s: (x: number, y: number) => string) =>
  poly.map((p, i) => `${i ? 'L' : 'M'}${s(p.x, p.y)}`).join('') + 'Z';

/**
 * A small plan in the corner while walking: where you are and which way you
 * look. Click a spot to jump there.
 */
export function WalkMap({
  room,
  obstacles,
  pose,
  onJump,
}: {
  room: RoomPolygon;
  obstacles: Polygon[];
  pose: WalkPose;
  onJump: (p: { x: number; y: number }) => void;
}) {
  const svg = useRef<SVGSVGElement | null>(null);
  const outline = useMemo(() => innerOutline(room) ?? room.corners.map((c) => c.point), [room]);
  const frame = useMemo(() => {
    const pts = room.corners.map((c) => c.point);
    const minX = Math.min(...pts.map((p) => p.x));
    const minY = Math.min(...pts.map((p) => p.y));
    const w = Math.max(...pts.map((p) => p.x)) - minX || 1;
    const h = Math.max(...pts.map((p) => p.y)) - minY || 1;
    const k = (SIZE - 2 * PAD) / Math.max(w, h);
    return { minX, minY, k, width: w * k + 2 * PAD, height: h * k + 2 * PAD };
  }, [room]);

  const sx = (x: number) => (x - frame.minX) * frame.k + PAD;
  const sy = (y: number) => (y - frame.minY) * frame.k + PAD;
  const s = (x: number, y: number) => `${sx(x).toFixed(1)},${sy(y).toFixed(1)}`;
  const at = (a: number) => s(pose.x + Math.cos(a) * CONE, pose.y + Math.sin(a) * CONE);

  const jump = (e: React.MouseEvent) => {
    const r = svg.current!.getBoundingClientRect();
    const p = {
      x: ((e.clientX - r.left - PAD) / frame.k + frame.minX) as Mm,
      y: ((e.clientY - r.top - PAD) / frame.k + frame.minY) as Mm,
    };
    if (allowed(room, p, obstacles)) onJump(p);
  };

  return (
    <div className="absolute bottom-3 right-3 rounded-[2px] border border-wall-200 bg-wall-50/95 p-1 shadow-panel backdrop-blur-sm">
      <svg
        ref={svg}
        width={frame.width}
        height={frame.height}
        onClick={jump}
        className="block cursor-pointer"
        data-testid="walk-map"
        aria-label="Map: click to jump there"
      >
        <path d={pathOf(outline, s)} fill="#F6F5F1" stroke="#16181A" strokeWidth={1.5} />
        {obstacles.map((o, i) => (
          <path key={i} d={pathOf(o, s)} fill="#C9C5BB" stroke="none" />
        ))}
        <path d={`M${s(pose.x, pose.y)}L${at(pose.yaw - HALF_ANGLE)}L${at(pose.yaw + HALF_ANGLE)}Z`} fill="rgba(22,24,26,0.18)" />
        <circle
          cx={sx(pose.x)}
          cy={sy(pose.y)}
          r={4}
          fill="#16181A"
          stroke="#fff"
          strokeWidth={1.5}
          data-testid="walk-me"
          data-x={Math.round(pose.x)}
          data-y={Math.round(pose.y)}
          data-yaw={pose.yaw.toFixed(3)}
        />
      </svg>
    </div>
  );
}
