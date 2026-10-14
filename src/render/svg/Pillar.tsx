'use client';

import type { Pillar as PillarT } from '@/model/objects';
import type { ViewState } from '@/model/project';
import { pxStroke } from './viewport';
import { RotateHandle } from './Handles';

interface Props {
  pillar: PillarT;
  view: ViewState;
  selected: boolean;
  onPointerDown: (e: React.PointerEvent<SVGElement>) => void;
  onRotateHandleDown: (e: React.PointerEvent<SVGElement>) => void;
}

export function Pillar({ pillar, view, selected, onPointerDown, onRotateHandleDown }: Props) {
  const { width, depth } = pillar.size;
  const x = pillar.position.x - width / 2;
  const y = pillar.position.y - depth / 2;
  const rotDeg = (pillar.rotation * 180) / Math.PI;

  const stroke = pxStroke(view, selected ? 2 : 1);

  return (
    <g transform={`rotate(${rotDeg} ${pillar.position.x} ${pillar.position.y})`}>
      <rect
        onPointerDown={onPointerDown}
        style={{ cursor: 'move' }}
        x={x}
        y={y}
        width={width}
        height={depth}
        fill="var(--pillar-fill)"
        stroke={selected ? 'var(--selection)' : 'transparent'}
        strokeWidth={stroke}
      />
      {selected && <SelectionFrame cx={pillar.position.x} cy={pillar.position.y} w={width} h={depth} view={view} />}
      {selected && (
        <RotateHandle
          cx={pillar.position.x}
          cy={pillar.position.y}
          depth={depth}
          view={view}
          onPointerDown={onRotateHandleDown}
        />
      )}
    </g>
  );
}

function SelectionFrame({
  cx,
  cy,
  w,
  h,
  view,
}: {
  cx: number;
  cy: number;
  w: number;
  h: number;
  view: ViewState;
}) {
  const pad = pxStroke(view, 6);
  const stroke = pxStroke(view, 1);
  return (
    <rect
      x={cx - w / 2 - pad}
      y={cy - h / 2 - pad}
      width={w + pad * 2}
      height={h + pad * 2}
      fill="none"
      stroke="var(--selection)"
      strokeWidth={stroke}
      strokeDasharray={`${pxStroke(view, 4)} ${pxStroke(view, 3)}`}
      pointerEvents="none"
    />
  );
}
