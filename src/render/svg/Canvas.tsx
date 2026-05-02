'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { usePlannerStore } from '@/store/plannerStore';
import { useDerivedMetrics } from '@/store/selectors';
import { eventToWorld, fitToBounds, pxStroke, screenToWorld } from './viewport';
import { Grid } from './Grid';
import { Room } from './Room';
import { Pillar } from './Pillar';
import { Inventory } from './Inventory';
import { Measurements } from './Measurements';
import { closestPointOnPolygon } from '@/geometry/insert';
import { boundingBox } from '@/geometry/polygon';
import type { Point } from '@/model/geometry';
import type { Mm } from '@/model/units';
import { mm } from '@/model/units';

export function Canvas() {
  const project = usePlannerStore((s) => s.project);
  const view = usePlannerStore((s) => s.view);
  const tool = usePlannerStore((s) => s.tool);
  const selection = usePlannerStore((s) => s.selection);

  const setSelection = usePlannerStore((s) => s.setSelection);
  const addCorner = usePlannerStore((s) => s.addCorner);
  const closeRoom = usePlannerStore((s) => s.closeRoom);
  const moveCorner = usePlannerStore((s) => s.moveCorner);
  const insertCorner = usePlannerStore((s) => s.insertCorner);
  const addPillarAt = usePlannerStore((s) => s.addPillarAt);
  const addInventoryAt = usePlannerStore((s) => s.addInventoryAt);
  const updatePillar = usePlannerStore((s) => s.updatePillar);
  const updateInventory = usePlannerStore((s) => s.updateInventory);
  const setZoom = usePlannerStore((s) => s.setZoom);
  const setPan = usePlannerStore((s) => s.setPan);

  const metrics = useDerivedMetrics();

  const svgRef = useRef<SVGSVGElement | null>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [hoverWorld, setHoverWorld] = useState<Point | null>(null);

  // Track container size for the grid pattern.
  useLayoutEffect(() => {
    const el = svgRef.current?.parentElement;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        setSize({ w: e.contentRect.width, h: e.contentRect.height });
      }
    });
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // Auto-fit when a room exists and the user hasn't panned yet (initial view).
  // Triggered only once on first room close.
  const fitOnce = useRef(false);
  useEffect(() => {
    if (fitOnce.current) return;
    if (!project.room?.closed) return;
    const bb = boundingBox(project.room.corners.map((c) => c.point));
    if (!bb || size.w === 0) return;
    const next = fitToBounds(bb, { width: size.w, height: size.h });
    setZoom(next.zoom);
    setPan(next.pan.x, next.pan.y);
    fitOnce.current = true;
  }, [project.room?.closed, project.room?.corners, size, setZoom, setPan]);

  // ---- pointer logic ----
  type DragKind =
    | { type: 'pan'; startX: number; startY: number; startPanX: number; startPanY: number }
    | { type: 'corner'; cornerId: string }
    | { type: 'pillar'; id: string; offset: Point }
    | { type: 'inventory'; id: string; offset: Point };
  const drag = useRef<DragKind | null>(null);

  const getRect = useCallback(() => svgRef.current?.getBoundingClientRect() ?? null, []);

  const onCanvasPointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      // Ignore clicks that bubbled from a child shape (those have their own handlers).
      if (e.target !== e.currentTarget) return;

      const rect = getRect();
      if (!rect) return;
      const world = eventToWorld(view, rect, e.clientX, e.clientY);

      if (tool === 'draw-room') {
        // Closing: click the first corner. The first-corner shape itself handles that.
        addCorner(world);
        return;
      }
      if (tool === 'add-pillar') {
        addPillarAt(world);
        return;
      }
      if (tool === 'add-inventory') {
        addInventoryAt(world);
        return;
      }

      // Default: pan drag or clear selection
      if (e.button === 0) {
        setSelection(null);
        drag.current = {
          type: 'pan',
          startX: e.clientX,
          startY: e.clientY,
          startPanX: view.pan.x,
          startPanY: view.pan.y,
        };
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
      }
    },
    [tool, view, addCorner, addPillarAt, addInventoryAt, setSelection, getRect],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const rect = getRect();
      if (!rect) return;
      const world = eventToWorld(view, rect, e.clientX, e.clientY);
      setHoverWorld(world);

      const d = drag.current;
      if (!d) return;
      if (d.type === 'pan') {
        setPan(d.startPanX + (e.clientX - d.startX), d.startPanY + (e.clientY - d.startY));
      } else if (d.type === 'corner') {
        moveCorner(d.cornerId, world);
      } else if (d.type === 'pillar') {
        updatePillar(d.id, {
          position: { x: (world.x - d.offset.x) as Mm, y: (world.y - d.offset.y) as Mm },
        });
      } else if (d.type === 'inventory') {
        updateInventory(d.id, {
          position: { x: (world.x - d.offset.x) as Mm, y: (world.y - d.offset.y) as Mm },
        });
      }
    },
    [view, setPan, moveCorner, updatePillar, updateInventory, getRect],
  );

  const onPointerUp = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    drag.current = null;
    if ((e.currentTarget as Element).hasPointerCapture(e.pointerId)) {
      (e.currentTarget as Element).releasePointerCapture(e.pointerId);
    }
  }, []);

  // Wheel zoom anchored at the cursor
  const onWheel = useCallback(
    (e: React.WheelEvent<SVGSVGElement>) => {
      const rect = getRect();
      if (!rect) return;
      e.preventDefault();
      const delta = -e.deltaY;
      const factor = Math.exp(delta * 0.0015);
      const newZoom = Math.max(0.005, Math.min(2, view.zoom * factor));
      // Keep the world point under the cursor stationary
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const worldBefore = screenToWorld(view, { x: sx, y: sy });
      const newPanX = sx - worldBefore.x * newZoom;
      const newPanY = sy - worldBefore.y * newZoom;
      setZoom(newZoom);
      setPan(newPanX, newPanY);
    },
    [view, setZoom, setPan, getRect],
  );

  // Wheel handler must be non-passive to call preventDefault
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      // React's onWheel is passive in some envs; intercept here.
      if (e.cancelable) e.preventDefault();
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  // ---- preview line in draw-room mode ----
  const room = project.room;
  const previewLine = useMemo(() => {
    if (tool !== 'draw-room') return null;
    if (!room || room.closed) return null;
    if (room.corners.length === 0 || !hoverWorld) return null;
    const last = room.corners[room.corners.length - 1]!.point;
    return { x1: last.x, y1: last.y, x2: hoverWorld.x, y2: hoverWorld.y };
  }, [tool, room, hoverWorld]);

  const cursorClass = useMemo(() => {
    switch (tool) {
      case 'draw-room':     return 'cursor-crosshair';
      case 'add-pillar':    return 'cursor-copy';
      case 'add-inventory': return 'cursor-copy';
      default:              return 'cursor-grab active:cursor-grabbing';
    }
  }, [tool]);

  // ---- shape handlers ----
  const onPointerDownCorner = (cornerId: string, e: React.PointerEvent<SVGElement>) => {
    e.stopPropagation();
    // Click first corner while drawing → close polygon.
    if (tool === 'draw-room' && room && !room.closed && room.corners[0]?.id === cornerId && room.corners.length >= 3) {
      closeRoom();
      return;
    }
    setSelection({ kind: 'corner', id: cornerId });
    drag.current = { type: 'corner', cornerId };
    (svgRef.current as Element).setPointerCapture(e.pointerId);
  };

  const onPointerDownEdge = (afterCornerId: string, e: React.PointerEvent<SVGElement>) => {
    if (tool !== 'select' || !room) return;
    e.stopPropagation();
    const rect = getRect();
    if (!rect) return;
    const world = eventToWorld(view, rect, e.clientX, e.clientY);
    // Project click onto edge for clean placement
    const nearest = closestPointOnPolygon(room.corners.map((c) => c.point), world, room.closed);
    const insertAt = nearest?.point ?? world;
    insertCorner(afterCornerId, insertAt);
  };

  const onPointerDownRoom = (e: React.PointerEvent<SVGElement>) => {
    if (tool !== 'select' || !room) return;
    e.stopPropagation();
    setSelection({ kind: 'room', id: room.id });
  };

  const onPointerDownPillar = (id: string, e: React.PointerEvent<SVGElement>) => {
    if (tool !== 'select') return;
    e.stopPropagation();
    setSelection({ kind: 'pillar', id });
    const rect = getRect();
    if (!rect) return;
    const world = eventToWorld(view, rect, e.clientX, e.clientY);
    const p = project.pillars.find((x) => x.id === id);
    if (!p) return;
    drag.current = {
      type: 'pillar',
      id,
      offset: { x: (world.x - p.position.x) as Mm, y: (world.y - p.position.y) as Mm },
    };
    (svgRef.current as Element).setPointerCapture(e.pointerId);
  };

  const onPointerDownInventory = (id: string, e: React.PointerEvent<SVGElement>) => {
    if (tool !== 'select') return;
    e.stopPropagation();
    setSelection({ kind: 'inventory', id });
    const rect = getRect();
    if (!rect) return;
    const world = eventToWorld(view, rect, e.clientX, e.clientY);
    const it = project.inventory.find((x) => x.id === id);
    if (!it) return;
    drag.current = {
      type: 'inventory',
      id,
      offset: { x: (world.x - it.position.x) as Mm, y: (world.y - it.position.y) as Mm },
    };
    (svgRef.current as Element).setPointerCapture(e.pointerId);
  };

  const previewStroke = pxStroke(view, 1.5);

  return (
    <svg
      ref={svgRef}
      className={`block h-full w-full select-none ${cursorClass}`}
      onPointerDown={onCanvasPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onWheel={onWheel}
    >
      <Grid view={view} width={size.w} height={size.h} />

      <g transform={`translate(${view.pan.x} ${view.pan.y}) scale(${view.zoom})`}>
        {room && (
          <Room
            room={room}
            view={view}
            selectedKind={selection?.kind === 'corner' || selection?.kind === 'room' ? selection.kind : null}
            selectedId={selection?.id ?? null}
            onPointerDownCorner={onPointerDownCorner}
            onPointerDownEdge={onPointerDownEdge}
            onPointerDownRoom={onPointerDownRoom}
          />
        )}

        {project.pillars.map((p) => (
          <Pillar
            key={p.id}
            pillar={p}
            view={view}
            selected={selection?.kind === 'pillar' && selection.id === p.id}
            onPointerDown={(e) => onPointerDownPillar(p.id, e)}
          />
        ))}

        {project.inventory.map((it) => (
          <Inventory
            key={it.id}
            item={it}
            view={view}
            selected={selection?.kind === 'inventory' && selection.id === it.id}
            onPointerDown={(e) => onPointerDownInventory(it.id, e)}
          />
        ))}

        {/* Preview line while drawing */}
        {previewLine && (
          <line
            x1={previewLine.x1}
            y1={previewLine.y1}
            x2={previewLine.x2}
            y2={previewLine.y2}
            stroke="var(--wall-stroke)"
            strokeOpacity={0.4}
            strokeWidth={previewStroke}
            strokeDasharray={`${pxStroke(view, 4)} ${pxStroke(view, 3)}`}
            pointerEvents="none"
          />
        )}

        {room && metrics && <Measurements room={room} view={view} metrics={metrics} />}
      </g>

      {/* Cursor coords readout, in screen space */}
      {hoverWorld && (
        <g transform={`translate(${size.w - 12} ${size.h - 12})`} pointerEvents="none">
          <text
            textAnchor="end"
            fontSize={11}
            fontFamily="var(--font-mono, ui-monospace)"
            fill="var(--ink-500, #6B7077)"
            opacity={0.7}
          >
            {Math.round(hoverWorld.x)} mm, {Math.round(hoverWorld.y)} mm
          </text>
        </g>
      )}
    </svg>
  );
}
