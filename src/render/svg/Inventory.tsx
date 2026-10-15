'use client';

import type { InventoryItem } from '@/model/objects';
import type { ViewState } from '@/model/project';
import { formatLength } from '@/model/units';
import { pxStroke } from './viewport';
import { RotateHandle } from './Handles';
import { rackSlots } from '@/lib/racks';

interface Props {
  item: InventoryItem;
  view: ViewState;
  selected: boolean;
  onPointerDown: (e: React.PointerEvent<SVGElement>) => void;
  onRotateHandleDown: (e: React.PointerEvent<SVGElement>) => void;
}

export function Inventory({ item, view, selected, onPointerDown, onRotateHandleDown }: Props) {
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

  return (
    <g transform={`rotate(${rotDeg} ${item.position.x} ${item.position.y})`}>
      <g onPointerDown={onPointerDown} style={{ cursor: 'move' }}>
        <rect
          x={x}
          y={y}
          width={width}
          height={depth}
          fill="var(--inv-fill)"
          stroke={selected ? 'var(--selection)' : 'var(--inv-stroke)'}
          strokeWidth={stroke}
          strokeDasharray={selected ? undefined : `${pxStroke(view, 3)} ${pxStroke(view, 3)}`}
        />
        {item.modules?.length ? (
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
        {/* Back edge marker: the side that faces the wall. */}
        <line
          x1={x}
          y1={y}
          x2={x + width}
          y2={y}
          stroke={selected ? 'var(--selection)' : 'var(--inv-stroke)'}
          strokeWidth={pxStroke(view, 2.5)}
          pointerEvents="none"
        />
      </g>
      {selected && (
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
