'use client';

import type { RoomPolygon } from '@/model/objects';
import type { ViewState } from '@/model/project';
import { pxStroke } from './viewport';
import { signedArea } from '@/geometry/polygon';
import { cornerArc, type Turn } from '@/geometry/corners';
import type { Corner } from '@/model/geometry';

/** The colour of a wall that is pointed out on the plan. */
const MARK = '#B45309';

interface Props {
  room: RoomPolygon;
  view: ViewState;
  selectedKind?: 'corner' | 'room' | 'wall' | null;
  selectedId?: string | null;
  /** Number each wall (matches the wall list in the room panel). */
  showWallNumbers?: boolean;
  highlightedWall?: number | null;
  /** With a corner selected: which of its two walls turns when its angle is typed. */
  turn?: Turn | null;
  onPointerDownEdge: (afterCornerId: string, e: React.PointerEvent<SVGElement>) => void;
  onDoubleClickEdge?: (afterCornerId: string, e: React.MouseEvent<SVGElement>) => void;
  onPointerDownCorner: (cornerId: string, e: React.PointerEvent<SVGElement>) => void;
  onPointerDownRoom: (e: React.PointerEvent<SVGElement>) => void;
}

export function Room({
  room,
  view,
  selectedKind,
  selectedId,
  showWallNumbers,
  highlightedWall,
  turn,
  onPointerDownEdge,
  onDoubleClickEdge,
  onPointerDownCorner,
  onPointerDownRoom,
}: Props) {
  const { corners, closed } = room;
  if (corners.length === 0) return null;

  const stroke = pxStroke(view, 2);
  const handleStroke = pxStroke(view, 1.5);
  const cornerR = pxStroke(view, 5);
  const edgeHit = pxStroke(view, 14);

  const badgeR = pxStroke(view, 8);
  const badgeFont = pxStroke(view, 9);
  const badgeInset = pxStroke(view, 18);
  // Beside the wall-length label (drawn at the midpoint), not on top of it.
  const badgeShift = pxStroke(view, 44);
  const inward = signedArea(corners.map((c) => c.point)) >= 0 ? 1 : -1;

  const polyPoints = corners.map((c) => `${c.point.x},${c.point.y}`).join(' ');

  // A selected corner with an angle: the wall that turns when the angle is typed.
  const n = corners.length;
  const cornerIndex = selectedKind === 'corner' && turn ? corners.findIndex((c) => c.id === selectedId) : -1;
  const turning =
    cornerIndex >= 0 && n >= 3 && (closed || (cornerIndex > 0 && cornerIndex < n - 1))
      ? { corner: cornerIndex, wall: turn === 'next' ? cornerIndex : (cornerIndex - 1 + n) % n, turn: turn! }
      : null;

  // Edges to render: closed → all, open → between consecutive corners only.
  const edges: {
    fromId: string;
    toId: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    transparent: boolean;
  }[] = [];
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
      transparent: !!room.walls?.[a.id]?.transparent,
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
            style={{ cursor: 'pointer' }}
            data-wall={e.fromId}
            onPointerDown={(ev) => onPointerDownEdge(e.fromId, ev)}
            onDoubleClick={(ev) => onDoubleClickEdge?.(e.fromId, ev)}
          >
            <title>Click to select the wall · double-click to add a corner</title>
          </line>
          {selectedKind === 'wall' && selectedId === e.fromId && (
            <line
              x1={e.x1}
              y1={e.y1}
              x2={e.x2}
              y2={e.y2}
              stroke="var(--selection)"
              strokeOpacity={0.35}
              strokeWidth={pxStroke(view, 8)}
              strokeLinecap="round"
              pointerEvents="none"
            />
          )}
          <line
            x1={e.x1}
            y1={e.y1}
            x2={e.x2}
            y2={e.y2}
            stroke={selectedKind === 'wall' && selectedId === e.fromId ? 'var(--selection)' : 'var(--wall-stroke)'}
            strokeWidth={stroke}
            strokeLinecap="square"
            // Open sides (no wall there) are dashed.
            strokeDasharray={e.transparent ? `${pxStroke(view, 7)} ${pxStroke(view, 5)}` : undefined}
            strokeOpacity={e.transparent ? 0.6 : 1}
            pointerEvents="none"
          />
        </g>
      ))}

      {turning && <TurnMarks corners={corners} closed={closed} index={turning.corner} turn={turning.turn} view={view} />}

      {highlightedWall != null && edges[highlightedWall] && (
        <line
          x1={edges[highlightedWall].x1}
          y1={edges[highlightedWall].y1}
          x2={edges[highlightedWall].x2}
          y2={edges[highlightedWall].y2}
          stroke={MARK}
          strokeWidth={pxStroke(view, 5)}
          strokeLinecap="round"
          strokeOpacity={0.8}
          pointerEvents="none"
        />
      )}

      {showWallNumbers &&
        edges.map((e, i) => {
          const len = Math.hypot(e.x2 - e.x1, e.y2 - e.y1) || 1;
          const nx = (inward * -(e.y2 - e.y1)) / len;
          const ny = (inward * (e.x2 - e.x1)) / len;
          const shift = Math.min(badgeShift, len / 4);
          const cx = (e.x1 + e.x2) / 2 + nx * badgeInset + ((e.x2 - e.x1) / len) * shift;
          const cy = (e.y1 + e.y2) / 2 + ny * badgeInset + ((e.y2 - e.y1) / len) * shift;
          const hot = i === highlightedWall || i === turning?.wall;
          return (
            <g key={`n-${e.fromId}`} pointerEvents="none" data-wall-number={i + 1}>
              <circle
                cx={cx}
                cy={cy}
                r={badgeR}
                fill={hot ? MARK : 'var(--wall-stroke)'}
              />
              <text
                x={cx}
                y={cy}
                dy="0.35em"
                textAnchor="middle"
                fontSize={badgeFont}
                fontFamily="var(--font-sans)"
                fill="#ffffff"
              >
                {i + 1}
              </text>
            </g>
          );
        })}

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

/**
 * At a selected corner: its angle as a wedge inside the room, the wall that
 * turns when the angle is typed picked out, and at that wall's far end the
 * arc it swings along.
 */
function TurnMarks({ corners, closed, index, turn, view }: { corners: Corner[]; closed: boolean; index: number; turn: Turn; view: ViewState }) {
  const n = corners.length;
  const c = corners[index]!.point;
  const prev = corners[(index - 1 + n) % n]!.point;
  const next = corners[(index + 1) % n]!.point;
  const far = turn === 'next' ? next : prev;
  const arc = cornerArc(corners, closed, index);
  const length = Math.hypot(far.x - c.x, far.y - c.y);
  if (!arc || length < 1) return null;

  const on = (a: number, r: number) => `${c.x + Math.cos(a) * r},${c.y + Math.sin(a) * r}`;
  const shortest = Math.min(Math.hypot(prev.x - c.x, prev.y - c.y), Math.hypot(next.x - c.x, next.y - c.y));
  const r = Math.min(pxStroke(view, 30), shortest * 0.4);
  const wedge = `M${c.x},${c.y} L${on(arc.from, r)} A${r},${r} 0 ${Math.abs(arc.by) > Math.PI ? 1 : 0} ${arc.by > 0 ? 1 : 0} ${on(arc.from + arc.by, r)} Z`;

  // The swing: a short arc through the far end, an arrowhead each way.
  const at = Math.atan2(far.y - c.y, far.x - c.x);
  const reach = Math.min(0.16, pxStroke(view, 34) / length);
  const head = pxStroke(view, 7);
  const arrow = (a: number, dir: 1 | -1) => {
    const tip = { x: c.x + Math.cos(a) * length, y: c.y + Math.sin(a) * length };
    // Back along the arc from the tip, and out to either side of it.
    const bx = tip.x + Math.sin(a) * head * dir;
    const by = tip.y - Math.cos(a) * head * dir;
    const wx = Math.cos(a) * head * 0.5;
    const wy = Math.sin(a) * head * 0.5;
    return `${tip.x},${tip.y} ${bx + wx},${by + wy} ${bx - wx},${by - wy}`;
  };

  return (
    <g pointerEvents="none" data-turning-wall={(turn === 'next' ? index : (index - 1 + n) % n) + 1}>
      <path d={wedge} fill={MARK} fillOpacity={0.14} stroke={MARK} strokeWidth={pxStroke(view, 1.2)} strokeLinejoin="round" />
      <line x1={c.x} y1={c.y} x2={far.x} y2={far.y} stroke={MARK} strokeWidth={pxStroke(view, 4)} strokeLinecap="round" strokeOpacity={0.85} />
      <path
        d={`M${on(at - reach, length)} A${length},${length} 0 0 1 ${on(at + reach, length)}`}
        fill="none"
        stroke={MARK}
        strokeWidth={pxStroke(view, 1.5)}
      />
      <polygon points={arrow(at + reach, 1)} fill={MARK} />
      <polygon points={arrow(at - reach, -1)} fill={MARK} />
    </g>
  );
}
