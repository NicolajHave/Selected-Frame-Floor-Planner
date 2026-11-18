'use client';

import type { PlanUnderlay, ViewState } from '@/model/project';
import type { Point } from '@/model/geometry';
import type { Calibration } from '@/store/plannerStore';
import { formatLength } from '@/model/units';
import { pxStroke } from './viewport';
import { useAssetSrc, useAssetState } from '@/lib/assets';

interface UnderlayProps {
  underlay: PlanUnderlay;
  view: ViewState;
  onPointerDown: (e: React.PointerEvent<SVGElement>) => void;
}

/** The imported plan, drawn beneath the room. Ignores the pointer while locked. */
export function Underlay({ underlay: u, view, onPointerDown }: UnderlayProps) {
  const height = u.width * u.aspect;
  // The picture is kept outside the plan; it may still be on its way.
  const href = useAssetSrc(u.src);
  const waiting = useAssetState(u.src);
  if (!href) {
    return (
      <g data-layer="underlay" data-underlay-state={waiting ?? 'loading'} pointerEvents="none">
        <rect
          x={u.position.x}
          y={u.position.y}
          width={u.width}
          height={height}
          fill="rgba(22, 24, 26, 0.03)"
          stroke="var(--wall-stroke)"
          strokeOpacity={0.35}
          strokeWidth={pxStroke(view, 1)}
          strokeDasharray={`${pxStroke(view, 6)} ${pxStroke(view, 4)}`}
        />
        <text
          x={u.position.x + u.width / 2}
          y={u.position.y + height / 2}
          fontSize={13 / view.zoom}
          textAnchor="middle"
          fill="var(--wall-stroke)"
          fillOpacity={0.6}
        >
          {waiting === 'missing' ? `The drawing "${u.fileName}" is not on this device` : 'Loading the drawing…'}
        </text>
      </g>
    );
  }
  return (
    <g data-layer="underlay">
      <image
        href={href}
        x={u.position.x}
        y={u.position.y}
        width={u.width}
        height={height}
        preserveAspectRatio="none"
        opacity={u.opacity}
        pointerEvents={u.locked ? 'none' : 'all'}
        style={{ cursor: u.locked ? undefined : 'move' }}
        onPointerDown={u.locked ? undefined : onPointerDown}
      />
      {!u.locked && (
        <rect
          x={u.position.x}
          y={u.position.y}
          width={u.width}
          height={height}
          fill="none"
          stroke="var(--selection)"
          strokeWidth={pxStroke(view, 1)}
          strokeDasharray={`${pxStroke(view, 6)} ${pxStroke(view, 4)}`}
          pointerEvents="none"
        />
      )}
    </g>
  );
}

interface CalibrationProps {
  calibration: Calibration;
  hover: Point | null;
  view: ViewState;
}

/** Points and measuring line for the scale calibration tool. */
export function CalibrationMarks({ calibration: c, hover, view }: CalibrationProps) {
  const end = c.b ?? hover;
  const stroke = pxStroke(view, 1.5);
  const r = pxStroke(view, 5);
  const fontSize = pxStroke(view, 11);
  const measured = c.a && end ? Math.hypot(end.x - c.a.x, end.y - c.a.y) : 0;

  return (
    <g pointerEvents="none">
      {c.a && end && (
        <>
          <line
            x1={c.a.x}
            y1={c.a.y}
            x2={end.x}
            y2={end.y}
            stroke="#B45309"
            strokeWidth={stroke}
            strokeDasharray={c.b ? undefined : `${pxStroke(view, 5)} ${pxStroke(view, 3)}`}
          />
          <text
            x={(c.a.x + end.x) / 2}
            y={(c.a.y + end.y) / 2 - fontSize * 0.8}
            textAnchor="middle"
            fontSize={fontSize}
            fontFamily="var(--font-sans)"
            fill="#B45309"
          >
            {formatLength(measured)} on the plan as drawn
          </text>
        </>
      )}
      {[c.a, c.b].map((p, i) =>
        p ? (
          <circle key={i} cx={p.x} cy={p.y} r={r} fill="#FFFBEB" stroke="#B45309" strokeWidth={stroke} />
        ) : null,
      )}
    </g>
  );
}
