'use client';

import type { ElectricalPoint, PlanNote, RoomPolygon } from '@/model/objects';
import type { ViewState } from '@/model/project';
import { electricalAnchor } from '@/geometry/electrical';
import { electricalType } from '@/lib/electricalTypes';
import { pxStroke } from './viewport';

const EL_COLOR = '#B45309';

/** Electrical points: a small labelled disc on the wall's inside face (or a square for floor boxes). */
export function ElectricalMarks({
  room,
  points,
  view,
  selectedId,
  onPointerDown,
}: {
  room: RoomPolygon | null;
  points: ElectricalPoint[];
  view: ViewState;
  selectedId: string | null;
  onPointerDown: (id: string, e: React.PointerEvent<SVGElement>) => void;
}) {
  const r = pxStroke(view, 8);
  return (
    <g data-layer="electrical">
      {points.map((e) => {
        const a = electricalAnchor(room, e);
        if (!a) return null;
        const t = electricalType(e.kind);
        const selected = e.id === selectedId;
        // Sit just inside the room so the symbol doesn't cover the wall line.
        const cx = a.point.x + a.nx * r * 1.15;
        const cy = a.point.y + a.ny * r * 1.15;
        const stroke = selected ? 'var(--selection)' : EL_COLOR;
        return (
          <g
            key={e.id}
            data-electrical={e.id}
            data-kind={e.kind}
            onPointerDown={(ev) => onPointerDown(e.id, ev)}
            style={{ cursor: 'move' }}
          >
            {t.mount === 'floor' ? (
              <rect x={cx - r} y={cy - r} width={r * 2} height={r * 2} fill="#FFF8EE" stroke={stroke} strokeWidth={pxStroke(view, selected ? 2 : 1.25)} />
            ) : (
              <circle cx={cx} cy={cy} r={r} fill="#FFF8EE" stroke={stroke} strokeWidth={pxStroke(view, selected ? 2 : 1.25)} />
            )}
            <text
              x={cx}
              y={cy}
              dy="0.35em"
              textAnchor="middle"
              fontSize={pxStroke(view, t.code.length > 1 ? 7 : 9)}
              fontWeight={600}
              fontFamily="var(--font-sans)"
              fill={stroke}
              pointerEvents="none"
            >
              {t.code}
            </text>
            <title>
              {t.name}
              {t.mount === 'wall' ? ` · ${e.height} mm` : ''}
              {e.note ? ` · ${e.note}` : ''}
            </title>
          </g>
        );
      })}
    </g>
  );
}

/** Notes: a text box, and an arrow to what it is about. */
export function PlanNotes({
  notes,
  view,
  selectedId,
  onPointerDown,
  onPointerDownTarget,
}: {
  notes: PlanNote[];
  view: ViewState;
  selectedId: string | null;
  onPointerDown: (id: string, e: React.PointerEvent<SVGElement>) => void;
  onPointerDownTarget: (id: string, e: React.PointerEvent<SVGElement>) => void;
}) {
  const font = pxStroke(view, 11);
  const pad = pxStroke(view, 5);
  return (
    <g data-layer="notes">
      {notes.map((n) => {
        const selected = n.id === selectedId;
        const lines = (n.text || 'Note').split('\n');
        const w = Math.max(...lines.map((l) => l.length)) * font * 0.56 + pad * 2;
        const h = lines.length * font * 1.25 + pad * 2;
        const color = selected ? 'var(--selection)' : 'var(--wall-stroke)';
        return (
          <g key={n.id} data-note={n.id}>
            {n.target && (
              <Arrow
                from={{ x: n.position.x, y: n.position.y }}
                to={n.target}
                view={view}
                color={color}
              />
            )}
            <g onPointerDown={(e) => onPointerDown(n.id, e)} style={{ cursor: 'move' }}>
              <rect
                x={n.position.x - w / 2}
                y={n.position.y - h / 2}
                width={w}
                height={h}
                rx={pxStroke(view, 2)}
                fill="#FFFDF7"
                stroke={color}
                strokeWidth={pxStroke(view, selected ? 1.5 : 1)}
              />
              {lines.map((line, i) => (
                <text
                  key={i}
                  x={n.position.x}
                  y={n.position.y - h / 2 + pad + font * (i + 0.95)}
                  textAnchor="middle"
                  fontSize={font}
                  fontFamily="var(--font-sans)"
                  fill={n.text ? 'var(--wall-stroke)' : 'var(--inv-stroke)'}
                  pointerEvents="none"
                >
                  {line || ' '}
                </text>
              ))}
            </g>
            {n.target && selected && (
              <circle
                data-note-target={n.id}
                cx={n.target.x}
                cy={n.target.y}
                r={pxStroke(view, 6)}
                fill="var(--panel, #fff)"
                stroke="var(--selection)"
                strokeWidth={pxStroke(view, 1.5)}
                style={{ cursor: 'crosshair' }}
                onPointerDown={(e) => onPointerDownTarget(n.id, e)}
              />
            )}
          </g>
        );
      })}
    </g>
  );
}

function Arrow({
  from,
  to,
  view,
  color,
}: {
  from: { x: number; y: number };
  to: { x: number; y: number };
  view: ViewState;
  color: string;
}) {
  const len = Math.hypot(to.x - from.x, to.y - from.y) || 1;
  const ux = (to.x - from.x) / len;
  const uy = (to.y - from.y) / len;
  const head = pxStroke(view, 9);
  const wing = pxStroke(view, 4);
  const bx = to.x - ux * head;
  const by = to.y - uy * head;
  return (
    <g pointerEvents="none">
      <line x1={from.x} y1={from.y} x2={bx} y2={by} stroke={color} strokeWidth={pxStroke(view, 1.25)} />
      <polygon
        points={`${to.x},${to.y} ${bx - uy * wing},${by + ux * wing} ${bx + uy * wing},${by - ux * wing}`}
        fill={color}
      />
    </g>
  );
}
