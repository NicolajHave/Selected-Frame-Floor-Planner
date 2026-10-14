'use client';

import type { ViewState } from '@/model/project';
import { pxStroke } from './viewport';

interface RotateHandleProps {
  /** Object centre and footprint depth, in world mm (unrotated frame). */
  cx: number;
  cy: number;
  depth: number;
  view: ViewState;
  onPointerDown: (e: React.PointerEvent<SVGElement>) => void;
}

/**
 * Knob off the object's front edge (local +depth side; the back is the side
 * that goes against a wall). Drawn inside the object's rotated <g>, so it
 * turns with the object.
 */
export function RotateHandle({ cx, cy, depth, view, onPointerDown }: RotateHandleProps) {
  const gap = pxStroke(view, 26);
  const r = pxStroke(view, 6);
  const front = cy + depth / 2;
  const knobY = front + gap;

  return (
    <g>
      <line
        x1={cx}
        y1={front}
        x2={cx}
        y2={knobY - r}
        stroke="var(--selection)"
        strokeWidth={pxStroke(view, 1)}
        pointerEvents="none"
      />
      <circle
        cx={cx}
        cy={knobY}
        r={r}
        fill="var(--wall-50, #F7F6F2)"
        stroke="var(--selection)"
        strokeWidth={pxStroke(view, 1.5)}
        style={{ cursor: 'grab' }}
        onPointerDown={onPointerDown}
        data-handle="rotate"
      >
        <title>Drag to rotate (snaps to 15°, hold Alt for free rotation). R rotates 90°.</title>
      </circle>
    </g>
  );
}
