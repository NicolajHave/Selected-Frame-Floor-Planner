'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { usePlannerStore } from '@/store/plannerStore';
import { useDerivedMetrics, useLayoutIssues } from '@/store/selectors';
import { eventToWorld, fitToBounds, pxStroke, screenToWorld } from './viewport';
import { Grid } from './Grid';
import { Room } from './Room';
import { Pillar } from './Pillar';
import { Inventory } from './Inventory';
import { Measurements } from './Measurements';
import { CalibrationMarks, Underlay } from './Underlay';
import { OpeningPreview, Openings } from './Openings';
import { GuideMarks, IssueMarks } from './LayoutMarks';
import { clearanceGuides } from '@/lib/layout';
import { rectCorners } from '@/geometry/transform';
import { closestPointOnPolygon } from '@/geometry/insert';
import { boundingBox } from '@/geometry/polygon';
import { pointAtDistance } from '@/geometry/snap';
import { openingSpan, placeOpening, projectOnWall } from '@/geometry/openings';
import { openingType } from '@/lib/openingTypes';
import type { Point } from '@/model/geometry';
import type { Mm, Radians } from '@/model/units';
import { mm } from '@/model/units';

const ROTATE_STEP = Math.PI / 12; // 15°

export function Canvas() {
  const project = usePlannerStore((s) => s.project);
  const view = usePlannerStore((s) => s.view);
  const tool = usePlannerStore((s) => s.tool);
  const selection = usePlannerStore((s) => s.selection);
  const calibration = usePlannerStore((s) => s.calibration);
  const highlightedWall = usePlannerStore((s) => s.highlightedWall);
  const drawLength = usePlannerStore((s) => s.drawLength);

  const setSelection = usePlannerStore((s) => s.setSelection);
  const addCorner = usePlannerStore((s) => s.addCorner);
  const closeRoom = usePlannerStore((s) => s.closeRoom);
  const moveCorner = usePlannerStore((s) => s.moveCorner);
  const insertCorner = usePlannerStore((s) => s.insertCorner);
  const addPillarAt = usePlannerStore((s) => s.addPillarAt);
  const addInventoryAt = usePlannerStore((s) => s.addInventoryAt);
  const updatePillar = usePlannerStore((s) => s.updatePillar);
  const updateInventory = usePlannerStore((s) => s.updateInventory);
  const moveInventory = usePlannerStore((s) => s.moveInventory);
  const beginGesture = usePlannerStore((s) => s.beginGesture);
  const endGesture = usePlannerStore((s) => s.endGesture);
  const setZoom = usePlannerStore((s) => s.setZoom);
  const setPan = usePlannerStore((s) => s.setPan);
  const addCalibrationPoint = usePlannerStore((s) => s.addCalibrationPoint);
  const updateUnderlay = usePlannerStore((s) => s.updateUnderlay);
  const addOpeningAt = usePlannerStore((s) => s.addOpeningAt);
  const moveOpening = usePlannerStore((s) => s.moveOpening);
  const resizeOpening = usePlannerStore((s) => s.resizeOpening);
  const pendingOpening = usePlannerStore((s) => s.pendingOpening);

  const metrics = useDerivedMetrics();
  const issues = useLayoutIssues();

  // Distances around the selected object (live while it is dragged).
  const guides = useMemo(() => {
    if (tool !== 'select' || !selection) return [];
    const obj =
      selection.kind === 'pillar'
        ? project.pillars.find((p) => p.id === selection.id)
        : selection.kind === 'inventory'
          ? project.inventory.find((i) => i.id === selection.id)
          : undefined;
    if (!obj) return [];
    return clearanceGuides(project, rectCorners(obj.position, obj.size, obj.rotation), obj.id);
  }, [project, selection, tool]);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [hoverWorld, setHoverWorld] = useState<Point | null>(null);
  const hoverRef = useRef<Point | null>(null);
  hoverRef.current = hoverWorld;

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
    | { type: 'inventory'; id: string; offset: Point }
    | { type: 'rotate'; kind: 'pillar' | 'inventory'; id: string; cx: number; cy: number }
    | { type: 'underlay'; offset: Point }
    | { type: 'opening'; id: string; grab: number }
    | { type: 'opening-end'; id: string; end: 'start' | 'end' };
  const drag = useRef<DragKind | null>(null);

  const getRect = useCallback(() => svgRef.current?.getBoundingClientRect() ?? null, []);

  const onCanvasPointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const rect = getRect();
      if (!rect) return;
      const world = eventToWorld(view, rect, e.clientX, e.clientY);

      // Placement tools act on any click that reaches the canvas — also
      // clicks bubbled through the room fill. Shapes that must intercept
      // (corners, objects in select mode) call stopPropagation themselves.
      if (tool === 'calibrate') {
        // Raw point: grid snapping would defeat the purpose.
        addCalibrationPoint(world);
        return;
      }
      if (tool === 'draw-room') {
        // Closing: click the first corner. The first-corner shape itself handles that.
        addCorner(world);
        return;
      }
      if (tool === 'add-pillar') {
        addPillarAt(world);
        return;
      }
      if (tool === 'add-opening') {
        addOpeningAt(world);
        return;
      }
      if (tool === 'add-inventory') {
        addInventoryAt(world, { wallSnap: !e.altKey });
        return;
      }

      // Ignore select-mode clicks that bubbled from a child shape (those
      // have their own handlers).
      if (e.target !== e.currentTarget) return;

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
    [tool, view, addCorner, addPillarAt, addInventoryAt, addOpeningAt, addCalibrationPoint, setSelection, getRect],
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
        moveInventory(
          d.id,
          { x: (world.x - d.offset.x) as Mm, y: (world.y - d.offset.y) as Mm },
          { wallSnap: !e.altKey },
        );
      } else if (d.type === 'opening') {
        moveOpening(d.id, world, d.grab);
      } else if (d.type === 'opening-end') {
        resizeOpening(d.id, d.end, world);
      } else if (d.type === 'underlay') {
        updateUnderlay({
          position: { x: (world.x - d.offset.x) as Mm, y: (world.y - d.offset.y) as Mm },
        });
      } else if (d.type === 'rotate') {
        // The handle sits on the local +y side, i.e. at angle θ + 90°.
        let angle = Math.atan2(world.y - d.cy, world.x - d.cx) - Math.PI / 2;
        if (!e.altKey) angle = Math.round(angle / ROTATE_STEP) * ROTATE_STEP;
        const rotation = angle as Radians;
        if (d.kind === 'pillar') updatePillar(d.id, { rotation });
        else updateInventory(d.id, { rotation });
      }
    },
    [view, setPan, moveCorner, updatePillar, updateInventory, moveInventory, moveOpening, resizeOpening, updateUnderlay, getRect],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const wasEditing = drag.current && drag.current.type !== 'pan';
      drag.current = null;
      if (wasEditing) endGesture();
      if ((e.currentTarget as Element).hasPointerCapture(e.pointerId)) {
        (e.currentTarget as Element).releasePointerCapture(e.pointerId);
      }
    },
    [endGesture],
  );

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

  // ---- typed wall lengths while drawing ----
  useEffect(() => {
    if (tool !== 'draw-room') return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.matches('input, textarea, [contenteditable="true"]')) return;
      const s = usePlannerStore.getState();
      const r = s.project.room;
      if (!r || r.closed || r.corners.length === 0) return;
      const buf = s.drawLength;
      if (/^[0-9]$/.test(e.key) || ((e.key === '.' || e.key === ',') && !buf.includes('.'))) {
        e.preventDefault();
        s.setDrawLength(buf + (e.key === ',' ? '.' : e.key));
      } else if (e.key === 'Backspace' && buf) {
        e.preventDefault();
        s.setDrawLength(buf.slice(0, -1));
      } else if (e.key === 'Enter' && Number(buf) > 0) {
        e.preventDefault();
        const last = r.corners[r.corners.length - 1]!.point;
        s.addCorner(pointAtDistance(last, hoverRef.current, Number(buf), !e.altKey), { snap: false });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tool]);

  // ---- preview line in draw-room mode ----
  const room = project.room;
  const previewLine = useMemo(() => {
    if (tool !== 'draw-room') return null;
    if (!room || room.closed) return null;
    if (room.corners.length === 0) return null;
    const last = room.corners[room.corners.length - 1]!.point;
    const typed = Number(drawLength);
    const end = typed > 0 ? pointAtDistance(last, hoverWorld, typed, true) : hoverWorld;
    if (!end) return null;
    return { x1: last.x, y1: last.y, x2: end.x, y2: end.y };
  }, [tool, room, hoverWorld, drawLength]);

  const cursorClass = useMemo(() => {
    switch (tool) {
      case 'draw-room':     return 'cursor-crosshair';
      case 'calibrate':     return 'cursor-crosshair';
      case 'add-pillar':    return 'cursor-copy';
      case 'add-inventory': return 'cursor-copy';
      case 'add-opening':   return 'cursor-copy';
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
    beginGesture();
    drag.current = { type: 'corner', cornerId };
    (svgRef.current as Element).setPointerCapture(e.pointerId);
  };

  // A click selects the wall; a double-click adds a corner on it.
  const onPointerDownEdge = (afterCornerId: string, e: React.PointerEvent<SVGElement>) => {
    if (tool !== 'select' || !room) return;
    e.stopPropagation();
    setSelection({ kind: 'wall', id: afterCornerId });
  };

  const onDoubleClickEdge = (afterCornerId: string, e: React.MouseEvent<SVGElement>) => {
    if (tool !== 'select' || !room) return;
    e.stopPropagation();
    const rect = getRect();
    if (!rect) return;
    const world = eventToWorld(view, rect, e.clientX, e.clientY);
    // Project click onto edge for clean placement
    const nearest = closestPointOnPolygon(room.corners.map((c) => c.point), world, room.closed);
    insertCorner(afterCornerId, nearest?.point ?? world);
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
    beginGesture();
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
    beginGesture();
    drag.current = {
      type: 'inventory',
      id,
      offset: { x: (world.x - it.position.x) as Mm, y: (world.y - it.position.y) as Mm },
    };
    (svgRef.current as Element).setPointerCapture(e.pointerId);
  };

  const onRotateHandleDown = (
    kind: 'pillar' | 'inventory',
    id: string,
    e: React.PointerEvent<SVGElement>,
  ) => {
    if (tool !== 'select') return;
    e.stopPropagation();
    const obj =
      kind === 'pillar'
        ? project.pillars.find((x) => x.id === id)
        : project.inventory.find((x) => x.id === id);
    if (!obj) return;
    beginGesture();
    drag.current = { type: 'rotate', kind, id, cx: obj.position.x, cy: obj.position.y };
    (svgRef.current as Element).setPointerCapture(e.pointerId);
  };

  const onPointerDownOpening = (id: string, e: React.PointerEvent<SVGElement>) => {
    if (tool !== 'select' || !room) return; // let placement clicks through
    e.stopPropagation();
    setSelection({ kind: 'opening', id });
    const rect = getRect();
    const o = room.openings.find((x) => x.id === id);
    const span = o ? openingSpan(room, o) : null;
    if (!rect || !span) return;
    // Keep the spot that was grabbed under the pointer.
    const hit = projectOnWall(room, span.index, eventToWorld(view, rect, e.clientX, e.clientY));
    beginGesture();
    drag.current = { type: 'opening', id, grab: hit ? span.offset - hit.along : 0 };
    (svgRef.current as Element).setPointerCapture(e.pointerId);
  };

  const onPointerDownOpeningEnd = (id: string, end: 'start' | 'end', e: React.PointerEvent<SVGElement>) => {
    if (tool !== 'select') return;
    e.stopPropagation();
    beginGesture();
    drag.current = { type: 'opening-end', id, end };
    (svgRef.current as Element).setPointerCapture(e.pointerId);
  };

  // Where the opening being placed would go, shown under the pointer.
  const preview = useMemo(() => {
    if (tool !== 'add-opening' || !pendingOpening || !room?.closed || !hoverWorld) return null;
    const t = openingType(pendingOpening);
    const where = placeOpening(room, hoverWorld, t.width, Math.max(600, 25 / view.zoom));
    return where.ok ? { kind: pendingOpening, width: t.width, cornerId: where.cornerId, offset: where.offset } : null;
  }, [tool, pendingOpening, room, hoverWorld, view.zoom]);

  const onPointerDownUnderlay = (e: React.PointerEvent<SVGElement>) => {
    const u = project.underlay;
    if (tool !== 'select' || !u || u.locked) return;
    e.stopPropagation();
    const rect = getRect();
    if (!rect) return;
    const world = eventToWorld(view, rect, e.clientX, e.clientY);
    setSelection(null);
    beginGesture();
    drag.current = {
      type: 'underlay',
      offset: { x: (world.x - u.position.x) as Mm, y: (world.y - u.position.y) as Mm },
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

      <g data-layer="world" transform={`translate(${view.pan.x} ${view.pan.y}) scale(${view.zoom})`}>
        {project.underlay && (
          <Underlay underlay={project.underlay} view={view} onPointerDown={onPointerDownUnderlay} />
        )}

        {room && (
          <Room
            room={room}
            view={view}
            selectedKind={
              selection?.kind === 'corner' || selection?.kind === 'room' || selection?.kind === 'wall'
                ? selection.kind
                : null
            }
            selectedId={selection?.id ?? null}
            showWallNumbers={selection?.kind === 'room' || selection?.kind === 'wall' || highlightedWall !== null}
            highlightedWall={highlightedWall}
            onPointerDownCorner={onPointerDownCorner}
            onPointerDownEdge={onPointerDownEdge}
            onDoubleClickEdge={onDoubleClickEdge}
            onPointerDownRoom={onPointerDownRoom}
          />
        )}

        {room && room.openings.length > 0 && (
          <Openings
            room={room}
            view={view}
            selectedId={selection?.kind === 'opening' ? selection.id : null}
            onPointerDown={onPointerDownOpening}
            onPointerDownEnd={onPointerDownOpeningEnd}
          />
        )}

        {room && preview && <OpeningPreview room={room} view={view} {...preview} />}

        {project.pillars.map((p) => (
          <Pillar
            key={p.id}
            pillar={p}
            view={view}
            selected={selection?.kind === 'pillar' && selection.id === p.id}
            onPointerDown={(e) => onPointerDownPillar(p.id, e)}
            onRotateHandleDown={(e) => onRotateHandleDown('pillar', p.id, e)}
          />
        ))}

        {project.inventory.map((it) => (
          <Inventory
            key={it.id}
            item={it}
            view={view}
            selected={selection?.kind === 'inventory' && selection.id === it.id}
            onPointerDown={(e) => onPointerDownInventory(it.id, e)}
            onRotateHandleDown={(e) => onRotateHandleDown('inventory', it.id, e)}
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

        {view.showLayoutCheck && <IssueMarks project={project} issues={issues} view={view} />}
        <GuideMarks guides={guides} view={view} />

        {calibration && <CalibrationMarks calibration={calibration} hover={hoverWorld} view={view} />}
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
