'use client';

import type { InventoryItem } from '@/model/objects';
import type { ViewState } from '@/model/project';
import { formatLength } from '@/model/units';
import { pxStroke } from './viewport';
import { RotateHandle } from './Handles';
import { rackSlots } from '@/lib/racks';
import { itemPlanShape, pathData } from '@/lib/planShapes';

interface Props {
  item: InventoryItem;
  view: ViewState;
  selected: boolean;
  /** Part of a group: outlined, but no rotate handle of its own. */
  grouped?: boolean;
  onPointerDown: (e: React.PointerEvent<SVGElement>) => void;
  onRotateHandleDown: (e: React.PointerEvent<SVGElement>) => void;
}

export function Inventory({ item, view, selected, grouped, onPointerDown, onRotateHandleDown }: Props) {
  const { width, depth } = item.size;
  const x = item.position.x - width / 2;
  const y = item.position.y - depth / 2;
  const rotDeg = (item.rotation * 180) / Math.PI;

  const stroke = pxStroke(view, selected ? 1.5 : 1);
  const labelSize = pxStroke(view, 11);
  const subSize = pxStroke(view, 9);

  // Hide labels when the rect is smaller than ~30 px on screen.
  const screenW = width * view.zoom;
  const screenH = depth * view.zoom;
  const showLabel = screenW > 60 && screenH > 30;
  // The model seen from above; the footprint rectangle stays as a faint outline (and the hit area).
  const shape = itemPlanShape(item);

  return (
    <g transform={`rotate(${rotDeg} ${item.position.x} ${item.position.y})`}>
      <g onPointerDown={onPointerDown} style={{ cursor: item.locked ? 'default' : 'move' }} data-locked={item.locked ? '' : undefined}>
        <rect
          x={x}
          y={y}
          width={width}
          height={depth}
          fill={shape ? 'transparent' : 'var(--inv-fill)'}
          stroke={selected ? 'var(--selection)' : 'var(--inv-stroke)'}
          strokeOpacity={shape && !selected ? 0.45 : 1}
          strokeWidth={stroke}
          strokeDasharray={selected ? undefined : `${pxStroke(view, 3)} ${pxStroke(view, 3)}`}
        />
        {shape && (
          <g transform={`translate(${item.position.x} ${item.position.y})`} pointerEvents="none" data-testid="plan-shape">
            <path
              d={pathData(shape.fill, true)}
              fillRule="evenodd"
              fill="var(--inv-fill)"
              stroke="var(--wall-stroke)"
              strokeWidth={pxStroke(view, 1)}
              strokeLinejoin="round"
            />
            {shape.lines.length > 0 && (
              <path
                d={pathData(shape.lines, false)}
                fill="none"
                stroke="var(--inv-stroke)"
                strokeWidth={pxStroke(view, 0.6)}
                strokeLinejoin="round"
              />
            )}
            {shape.extra && shape.extra.length > 0 && (
              <path
                data-testid="plan-accessories"
                d={pathData(shape.extra, true)}
                fill="var(--inv-fill)"
                stroke="var(--wall-stroke)"
                strokeWidth={pxStroke(view, 0.8)}
                strokeLinejoin="round"
              />
            )}
          </g>
        )}
        {item.modules?.length && !shape ? (
          // Wall rack: a line between units, and each unit's own front.
          <g pointerEvents="none" stroke="var(--inv-stroke)" strokeWidth={pxStroke(view, 1)}>
            {rackSlots(item.modules).map((slot, i) => {
              const left = item.position.x + slot.x - slot.asset.size.width / 2;
              const front = y + slot.asset.size.depth;
              return (
                <g key={i}>
                  {i > 0 && <line x1={left} y1={y} x2={left} y2={y + depth} />}
                  {slot.asset.size.depth < depth - 1 && (
                    <line x1={left} y1={front} x2={left + slot.asset.size.width} y2={front} strokeDasharray={`${pxStroke(view, 2)} ${pxStroke(view, 2)}`} />
                  )}
                </g>
              );
            })}
          </g>
        ) : null}
        {showLabel && (
          <g pointerEvents="none">
            <text
              x={item.position.x}
              y={item.position.y - labelSize * 0.1}
              textAnchor="middle"
              fontSize={labelSize}
              fontFamily="var(--font-sans)"
              fill="var(--wall-stroke)"
            >
              {item.name}
            </text>
            <text
              x={item.position.x}
              y={item.position.y + subSize * 1.6}
              textAnchor="middle"
              fontSize={subSize}
              fontFamily="var(--font-sans)"
              fill="var(--inv-stroke)"
            >
              {item.modules?.length ? `${item.modules.length} units · ` : ''}
              {formatLength(width)} × {formatLength(depth)}
            </text>
          </g>
        )}
        {/* Back edge marker: the side that faces the wall (the model shows it once drawn). */}
        {(!shape || selected) && (
          <line
            x1={x}
            y1={y}
            x2={x + width}
            y2={y}
            stroke={selected ? 'var(--selection)' : 'var(--inv-stroke)'}
            strokeWidth={pxStroke(view, 2.5)}
            pointerEvents="none"
          />
        )}
      </g>
      {item.locked && <LockBadge x={x + width} y={y} view={view} />}
      {selected && !grouped && !item.locked && (
        <RotateHandle
          cx={item.position.x}
          cy={item.position.y}
          depth={depth}
          view={view}
          onPointerDown={onRotateHandleDown}
        />
      )}
    </g>
  );
}

/** A padlock at the item's back-right corner, a constant size on screen. */
function LockBadge({ x, y, view }: { x: number; y: number; view: ViewState }) {
  const r = pxStroke(view, 8);
  const k = pxStroke(view, 1);
  return (
    <g pointerEvents="none" data-testid="lock-badge" transform={`translate(${x} ${y})`}>
      <circle r={r} fill="var(--wall-stroke)" />
      <rect x={-3.5 * k} y={-0.5 * k} width={7 * k} height={5 * k} rx={k} fill="#F7F5F0" />
      <path
        d={`M${-2.2 * k} ${-0.5 * k}V${-2 * k}a${2.2 * k} ${2.2 * k} 0 0 1 ${4.4 * k} 0V${-0.5 * k}`}
        fill="none"
        stroke="#F7F5F0"
        strokeWidth={1.2 * k}
      />
    </g>
  );
}
