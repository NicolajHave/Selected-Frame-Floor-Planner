'use client';

import type { RoomPolygon } from '@/model/objects';
import type { ViewState } from '@/model/project';
import { pxStroke } from './viewport';

interface Props {
  room: RoomPolygon;
  view: ViewState;
  selectedKind?: 'corner' | 'room' | null;
  selectedId?: string | null;
  onPointerDownEdge: (afterCornerId: string, e: React.PointerEvent<SVGElement>) => void;
  onPointerDownCorner: (cornerId: string, e: React.PointerEvent<SVGElement>) => void;
  onPointerDownRoom: (e: React.PointerEvent<SVGElement>) => void;
}

export function Room({
  room,
  view,
  selectedKind,
  selectedId,
  onPointerDownEdge,
  onPointerDownCorner,
  onPointerDownRoom,
}: Props) {
  const { corners, closed } = room;
  if (corners.length === 0) return null;

  const stroke = pxStroke(view, 2);
  const handleStroke = pxStroke(view, 1.5);
  const cornerR = pxStroke(view, 5);
  const edgeHit = pxStroke(view, 14);

  const polyPoints = corners.map((c) => `${c.point.x},${c.point.y}`).join(' ');

  // Edges to render: closed → all, open → between consecutive corners only.
  const edges: { fromId: string; toId: string; x1: number; y1: number; x2: number; y2: number }[] = [];
  const last = closed ? corners.length : corners.length - 1;
  for (let i = 0; i < last; i++) {
    const a = corners[i]!;
    const b = corners[(i + 1) % corners.length]!;
    edges.push({
      fromId: a.id,
      toId: b.id,
      x1: a.point.x,
      y1: a.point.y,
      x2: b.point.x,
      y2: b.point.y,
    });
  }

  return (
    <g>
      {/* Filled room body — only after closing. Catches clicks for selecting the room. */}
      {closed && (
        <polygon
          points={polyPoints}
          fill="var(--wall-fill)"
          stroke="none"
          onPointerDown={onPointerDownRoom}
          style={{ cursor: 'default' }}
        />
      )}

      {/* Walls */}
      {edges.map((e) => (
        <g key={`${e.fromId}-${e.toId}`}>
          {/* Wide invisible hit target for inserting points on edge */}
          <line
            x1={e.x1}
            y1={e.y1}
            x2={e.x2}
            y2={e.y2}
            stroke="transparent"
            strokeWidth={edgeHit}
            style={{ cursor: 'copy' }}
            onPointerDown={(ev) => onPointerDownEdge(e.fromId, ev)}
          />
          <line
            x1={e.x1}
            y1={e.y1}
            x2={e.x2}
            y2={e.y2}
            stroke="var(--wall-stroke)"
            strokeWidth={stroke}
            strokeLinecap="square"
            pointerEvents="none"
          />
        </g>
      ))}

      {/* Corner handles */}
      {corners.map((c) => {
        const isSel = selectedKind === 'corner' && selectedId === c.id;
        return (
          <g
            key={c.id}
            onPointerDown={(ev) => onPointerDownCorner(c.id, ev)}
            style={{ cursor: 'grab' }}
          >
            {/* Larger transparent hit target */}
            <circle cx={c.point.x} cy={c.point.y} r={cornerR * 2.5} fill="transparent" />
            <circle
              cx={c.point.x}
              cy={c.point.y}
              r={cornerR}
              fill={isSel ? 'var(--selection)' : '#ffffff'}
              stroke="var(--wall-stroke)"
              strokeWidth={handleStroke}
            />
          </g>
        );
      })}
    </g>
  );
}
