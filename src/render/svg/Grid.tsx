'use client';

import type { ViewState } from '@/model/project';

interface Props {
  view: ViewState;
  width: number;   // viewport px
  height: number;  // viewport px
}

/**
 * Two-tier grid: minor lines at gridSize, accented lines every 10th step.
 * Drawn in screen space so it's stable across zoom; the spacing reflects
 * the world step scaled by current zoom.
 */
export function Grid({ view, width, height }: Props) {
  if (!view.showGrid) return null;

  const stepPx = view.gridSize * view.zoom;
  // Hide grid when too dense or too sparse to read.
  if (stepPx < 4 || stepPx > 400) return null;

  const majorStepPx = stepPx * 10;

  // Offset the pattern so the world origin (0,0) lines up with a grid line.
  const offsetX = ((view.pan.x % stepPx) + stepPx) % stepPx;
  const offsetY = ((view.pan.y % stepPx) + stepPx) % stepPx;
  const offsetXMajor = ((view.pan.x % majorStepPx) + majorStepPx) % majorStepPx;
  const offsetYMajor = ((view.pan.y % majorStepPx) + majorStepPx) % majorStepPx;

  return (
    <g aria-hidden="true">
      <defs>
        <pattern
          id="grid-minor"
          x={offsetX}
          y={offsetY}
          width={stepPx}
          height={stepPx}
          patternUnits="userSpaceOnUse"
        >
          <path d={`M ${stepPx} 0 L 0 0 0 ${stepPx}`} fill="none" stroke="var(--grid-line)" strokeWidth={1} />
        </pattern>
        <pattern
          id="grid-major"
          x={offsetXMajor}
          y={offsetYMajor}
          width={majorStepPx}
          height={majorStepPx}
          patternUnits="userSpaceOnUse"
        >
          <path d={`M ${majorStepPx} 0 L 0 0 0 ${majorStepPx}`} fill="none" stroke="var(--grid-line-2)" strokeWidth={1} />
        </pattern>
      </defs>
      <rect x={0} y={0} width={width} height={height} fill="url(#grid-minor)" />
      <rect x={0} y={0} width={width} height={height} fill="url(#grid-major)" />
    </g>
  );
}
