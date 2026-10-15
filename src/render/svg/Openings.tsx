'use client';

import type { Opening, OpeningKind, RoomPolygon } from '@/model/objects';
import type { Mm } from '@/model/units';
import type { ViewState } from '@/model/project';
import type { Point } from '@/model/geometry';
import { formatLength } from '@/model/units';
import { openingSpan, type OpeningSpan } from '@/geometry/openings';
import { openingType } from '@/lib/openingTypes';
import { pxStroke } from './viewport';

/** Matches the canvas background, to cut the opening out of the wall line. */
const GAP_COLOR = '#F0EEE6';

interface Props {
  room: RoomPolygon;
  view: ViewState;
  selectedId: string | null;
  onPointerDown: (id: string, e: React.PointerEvent<SVGElement>) => void;
  /** Drag an end of the selected opening to change its width. */
  onPointerDownEnd?: (id: string, end: 'start' | 'end', e: React.PointerEvent<SVGElement>) => void;
}

export function Openings({ room, view, selectedId, onPointerDown, onPointerDownEnd }: Props) {
  return (
    <g data-layer="openings">
      {room.openings.map((o) => {
        const span = openingSpan(room, o);
        if (!span) return null;
        return (
          <OpeningSymbol
            key={o.id}
            opening={o}
            span={span}
            wallThickness={room.wallThickness}
            view={view}
            selected={o.id === selectedId}
            onPointerDown={(e) => onPointerDown(o.id, e)}
            onPointerDownEnd={onPointerDownEnd && ((end, e) => onPointerDownEnd(o.id, end, e))}
          />
        );
      })}
    </g>
  );
}

/** Ghost of the opening about to be placed, where a click would put it. */
export function OpeningPreview({
  room,
  view,
  kind,
  width,
  cornerId,
  offset,
}: {
  room: RoomPolygon;
  view: ViewState;
  kind: OpeningKind;
  width: number;
  cornerId: string;
  offset: number;
}) {
  const t = openingType(kind);
  const o: Opening = {
    id: 'preview',
    kind,
    wallStartCornerId: cornerId,
    offset: offset as Mm,
    width: width as Mm,
    height: t.height as Mm,
    sillHeight: t.sillHeight as Mm,
    hinge: 'start',
    swing: 'in',
  };
  const span = openingSpan(room, o);
  if (!span) return null;
  return (
    <g opacity={0.6} pointerEvents="none" data-opening-preview={kind}>
      <OpeningSymbol opening={o} span={span} wallThickness={room.wallThickness} view={view} selected />
    </g>
  );
}

interface SymbolProps {
  opening: Opening;
  span: OpeningSpan;
  wallThickness: number;
  view: ViewState;
  selected: boolean;
  onPointerDown?: (e: React.PointerEvent<SVGElement>) => void;
  onPointerDownEnd?: (end: 'start' | 'end', e: React.PointerEvent<SVGElement>) => void;
}

function OpeningSymbol({ opening: o, span, wallThickness, view, selected, onPointerDown, onPointerDownEnd }: SymbolProps) {
  const { p1, p2, nx, ny, width } = span;
  const color = selected ? 'var(--selection)' : 'var(--wall-stroke)';
  const line = pxStroke(view, selected ? 1.5 : 1);
  const jamb = Math.max(wallThickness, pxStroke(view, 10)) / 2;
  const add = (p: Point, k: number, vx = nx, vy = ny) => ({ x: p.x + vx * k, y: p.y + vy * k });

  // Door leaves open into the room (+n) or out of it (−n).
  const side = o.swing === 'in' ? 1 : -1;
  const leaf = (hinge: Point, free: Point, length: number) => {
    const tip = add(hinge, side * length);
    const cross = (tip.x - hinge.x) * (free.y - hinge.y) - (tip.y - hinge.y) * (free.x - hinge.x);
    return (
      <>
        <line x1={hinge.x} y1={hinge.y} x2={tip.x} y2={tip.y} stroke={color} strokeWidth={line * 1.5} />
        <path
          d={`M ${tip.x} ${tip.y} A ${length} ${length} 0 0 ${cross > 0 ? 1 : 0} ${free.x} ${free.y}`}
          fill="none"
          stroke={color}
          strokeWidth={line}
          strokeDasharray={`${pxStroke(view, 3)} ${pxStroke(view, 2)}`}
        />
      </>
    );
  };

  const center = span.center;
  const labelAt = add(center, -(jamb + pxStroke(view, 12)));

  return (
    <g data-opening={o.id} data-kind={o.kind} onPointerDown={onPointerDown} style={{ cursor: 'move' }}>
      {/* Cut the wall line where the opening is */}
      <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={GAP_COLOR} strokeWidth={pxStroke(view, 6)} />

      {/* Jambs */}
      {[p1, p2].map((p, i) => {
        const a = add(p, -jamb);
        const b = add(p, jamb);
        return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth={line * 1.5} />;
      })}

      {o.kind === 'door' && (o.hinge === 'start' ? leaf(p1, p2, width) : leaf(p2, p1, width))}
      {o.kind === 'double-door' && (
        <>
          {leaf(p1, center, width / 2)}
          {leaf(p2, center, width / 2)}
        </>
      )}
      {o.kind === 'opening' && (
        <line
          x1={p1.x}
          y1={p1.y}
          x2={p2.x}
          y2={p2.y}
          stroke={color}
          strokeWidth={line}
          strokeDasharray={`${pxStroke(view, 6)} ${pxStroke(view, 4)}`}
        />
      )}
      {o.kind === 'window' &&
        [-0.5, 0, 0.5].map((k) => {
          const a = add(p1, jamb * k);
          const b = add(p2, jamb * k);
          return <line key={k} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth={line} />;
        })}

      {/* Generous hit target along the opening */}
      <line
        x1={p1.x}
        y1={p1.y}
        x2={p2.x}
        y2={p2.y}
        stroke="transparent"
        strokeWidth={Math.max(wallThickness, pxStroke(view, 16))}
      />

      {selected && (
        <text
          x={labelAt.x}
          y={labelAt.y}
          dy="0.35em"
          textAnchor="middle"
          fontSize={pxStroke(view, 10)}
          fontFamily="var(--font-sans)"
          fill="var(--selection)"
          pointerEvents="none"
        >
          {formatLength(width)}
        </text>
      )}

      {/* Width handles on both ends */}
      {selected &&
        onPointerDownEnd &&
        ([
          ['start', p1],
          ['end', p2],
        ] as const).map(([end, p]) => {
          const r = pxStroke(view, 5);
          return (
            <rect
              key={end}
              data-opening-end={end}
              x={p.x - r}
              y={p.y - r}
              width={r * 2}
              height={r * 2}
              fill="var(--panel, #fff)"
              stroke="var(--selection)"
              strokeWidth={pxStroke(view, 1.5)}
              style={{ cursor: 'ew-resize' }}
              onPointerDown={(e) => onPointerDownEnd(end, e)}
            />
          );
        })}
    </g>
  );
}
