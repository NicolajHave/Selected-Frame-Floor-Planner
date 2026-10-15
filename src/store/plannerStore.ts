'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { Draft } from 'immer';
import type {
  Project,
  ViewState,
  ViewMode,
  PlanUnderlay,
  RoomPolygon,
  Pillar,
  InventoryItem,
  Opening,
  OpeningKind,
  Selection,
  Point,
  Mm,
  Radians,
} from '@/model';
import { mm, rad } from '@/model/units';
import { newId } from '@/lib/id';
import { CURRENT_SCHEMA, migrate } from '@/lib/schema';
import { snapPoint } from '@/geometry/snap';
import { normalizeAngle, snapToWall } from '@/geometry/wallSnap';
import { setWallLength as resizeWall } from '@/geometry/walls';
import {
  clampOffset,
  nearestWall,
  openingSpan,
  reanchorAfterInsert,
  reanchorByPosition,
} from '@/geometry/openings';
import { openingType } from '@/lib/openingTypes';
import { findAsset } from '@/lib/assetCatalog';
import { batchedLocalStorage } from '@/lib/autosaveStorage';
import type { CloudProject, CloudRole, SaveResult, SharedProject } from '@/lib/cloud/api';

export type Tool =
  | 'select'
  | 'draw-room'
  | 'add-pillar'
  | 'add-inventory'
  | 'add-opening'
  | 'calibrate';

/** Two clicks on the underlay that span a known real-world distance. */
export interface Calibration {
  a: Point | null;
  b: Point | null;
}

export interface Notice {
  /** Changes on every new notice so the UI can restart its timer. */
  id: number;
  tone: 'info' | 'warning';
  message: string;
}

export interface PlaceOptions {
  /** Pull wall-mounted catalog items flush onto the nearest wall. */
  wallSnap?: boolean;
}

/** The cloud project the open plan is saved to. */
export interface CloudLink {
  projectId: string;
  version: number;
  role: CloudRole;
  ownerEmail: string;
  /** Local edits not saved to the cloud yet. */
  dirty: boolean;
  lastSavedAt: string | null;
}

export type CloudStatus = 'idle' | 'saving' | 'saved' | 'error' | 'conflict';

/** Someone else saved a newer version while we had unsaved edits. */
export interface CloudConflict {
  version: number;
  updatedAt: string;
  updatedByEmail: string;
}

interface PlannerState {
  project: Project;
  view: ViewState;
  tool: Tool;
  selection: Selection | null;
  /**
   * When set, the next click in `add-inventory` mode places this asset (with
   * its catalog name + size + assetRef) instead of the generic placeholder.
   * Cleared after one placement or when the user switches tools.
   */
  pendingAssetRef: string | null;
  /** Kind of door/opening/window the next click on a wall places. */
  pendingOpening: OpeningKind | null;
  /** In-progress underlay scale calibration; null outside the calibrate tool. */
  calibration: Calibration | null;
  /** Digits typed while drawing: the next wall's length in mm. */
  drawLength: string;
  /** Wall index highlighted on the canvas (e.g. hovered in the wall list). */
  highlightedWall: number | null;

  /** Transient message about the last action, e.g. mounting requirements. */
  notice: Notice | null;

  cloud: CloudLink | null;
  cloudStatus: CloudStatus;
  cloudError: string | null;
  cloudConflict: CloudConflict | null;
  /** Viewing without edit rights (viewer role or a share link): edits are ignored. */
  readOnly: boolean;
  /** Set while showing a plan opened from a share link. */
  shared: { name: string; ownerEmail: string; updatedAt: string } | null;

  /** Undo stack: project snapshots before each edit, oldest first. */
  past: Project[];
  /** Redo stack: snapshots undone, most recently undone last. */
  future: Project[];

  // tool actions
  setTool: (t: Tool) => void;
  setSelection: (s: Selection | null) => void;
  pickAsset: (assetId: string) => void;
  pickOpening: (kind: OpeningKind) => void;

  // plan underlay
  setUnderlay: (u: PlanUnderlay | null) => void;
  updateUnderlay: (patch: Partial<PlanUnderlay>) => void;
  startCalibration: () => void;
  addCalibrationPoint: (p: Point) => void;
  /** Scale the underlay so the two clicked points are `distanceMm` apart. */
  applyCalibration: (distanceMm: number) => void;
  dismissNotice: () => void;

  // view actions
  setZoom: (z: number) => void;
  setPan: (x: number, y: number) => void;
  resetView: () => void;
  toggleGrid: () => void;
  toggleSnap: () => void;
  setViewMode: (m: ViewMode) => void;
  toggleLayoutCheck: () => void;
  setMinAisle: (mmValue: number) => void;
  setNotes: (notes: string) => void;

  // history
  undo: () => void;
  redo: () => void;
  /**
   * Group every edit until `endGesture` into one undo step. Drags call
   * this on pointer-down so a move is one step, not one per frame.
   */
  beginGesture: () => void;
  endGesture: () => void;

  // room actions
  startRoom: () => void;
  /** `snap: false` places the corner exactly (typed lengths); default follows grid snap. */
  addCorner: (p: Point, opts?: { snap?: boolean }) => void;
  setDrawLength: (text: string) => void;
  /** Wall `index` runs from corner `index` to the next corner. */
  setWallLength: (index: number, lengthMm: number) => void;
  setHighlightedWall: (index: number | null) => void;
  closeRoom: () => void;
  moveCorner: (cornerId: string, p: Point) => void;
  insertCorner: (afterCornerId: string, p: Point) => void;
  deleteCorner: (cornerId: string) => void;
  updateRoomMeta: (patch: Partial<Pick<RoomPolygon, 'wallThickness' | 'wallHeight'>>) => void;

  // object actions
  addPillarAt: (p: Point) => void;
  addInventoryAt: (p: Point, opts?: PlaceOptions) => void;
  updatePillar: (id: string, patch: Partial<Pillar>) => void;
  updateInventory: (id: string, patch: Partial<InventoryItem>) => void;
  /** Drag-move an inventory item; applies wall snapping for wall-mounted assets. */
  moveInventory: (id: string, p: Point, opts?: PlaceOptions) => void;
  /** Place the pending opening on the wall nearest `p`. */
  addOpeningAt: (p: Point) => void;
  updateOpening: (id: string, patch: Partial<Omit<Opening, 'id'>>) => void;
  /** Drag an opening along (or onto another) wall. */
  moveOpening: (id: string, p: Point) => void;
  /** Objects: rotate by `delta`. Doors: positive flips the hinge side, negative the swing. */
  rotateSelected: (delta: number) => void;
  duplicateSelected: () => void;
  deleteSelected: () => void;

  // project lifecycle
  newProject: () => void;
  renameProject: (name: string) => void;
  loadProject: (p: unknown) => void;

  // cloud
  openCloudProject: (p: CloudProject) => void;
  linkCloud: (link: Omit<CloudLink, 'dirty'>) => void;
  unlinkCloud: () => void;
  setCloudStatus: (status: CloudStatus, error?: string | null) => void;
  /** After a successful save of `saved`; still dirty if the plan changed meanwhile. */
  markSynced: (result: SaveResult, saved: Project) => void;
  setCloudConflict: (c: CloudConflict) => void;
  openShared: (p: SharedProject) => void;
}

const DEFAULT_VIEW: ViewState = {
  zoom: 0.05, // 1 mm = 0.05 px → 20 mm per pixel; tuned for ~10 m rooms
  pan: { x: 0, y: 0 },
  showGrid: true,
  snapToGrid: true,
  gridSize: mm(100),
  viewMode: '2d',
  showLayoutCheck: true,
};

const HISTORY_LIMIT = 100;

function makeProject(name = 'Untitled plan'): Project {
  const now = new Date().toISOString();
  return {
    schemaVersion: CURRENT_SCHEMA,
    id: newId('proj'),
    name,
    createdAt: now,
    updatedAt: now,
    units: 'mm',
    room: null,
    pillars: [],
    inventory: [],
  };
}

const metres = (n: number) => `${(n / 1000).toFixed(1)} m`;

let noticeSeq = 0;

/** Mounting requirement shown when an item with a minimum wall height is placed. */
function mountingNotice(
  name: string,
  mountHeight: number | undefined,
  minWallHeight: number,
  room: RoomPolygon | null,
): Notice {
  const hang = mountHeight !== undefined ? `${name} hangs with its bottom edge at ${metres(mountHeight)}. ` : '';
  const base = `${hang}Walls must be at least ${metres(minWallHeight)} high.`;
  if (room && room.wallHeight < minWallHeight) {
    return {
      id: ++noticeSeq,
      tone: 'warning',
      message: `${base} This room's walls are only ${metres(room.wallHeight)} — raise the wall height in the room properties.`,
    };
  }
  return { id: ++noticeSeq, tone: 'info', message: base };
}

function maybeSnap(view: ViewState, p: Point): Point {
  return view.snapToGrid ? snapPoint(p, view.gridSize) : p;
}

function touch(p: Project): void {
  p.updatedAt = new Date().toISOString();
}

/** Drop a selection that points at something that no longer exists. */
function pruneSelection(s: Draft<PlannerState>): void {
  const sel = s.selection;
  if (!sel) return;
  const { project } = s;
  const exists =
    (sel.kind === 'pillar' && project.pillars.some((p) => p.id === sel.id)) ||
    (sel.kind === 'inventory' && project.inventory.some((i) => i.id === sel.id)) ||
    (sel.kind === 'corner' && !!project.room?.corners.some((c) => c.id === sel.id)) ||
    (sel.kind === 'room' && !!project.room) ||
    (sel.kind === 'opening' && !!project.room?.openings.some((o) => o.id === sel.id));
  if (!exists) s.selection = null;
}

function detach(s: Draft<PlannerState>): void {
  s.cloud = null;
  s.readOnly = false;
  s.shared = null;
  s.cloudStatus = 'idle';
  s.cloudError = null;
  s.cloudConflict = null;
}

/** Project as it stood when the current gesture began; null outside a gesture. */
let gestureStart: Project | null = null;

export const usePlannerStore = create<PlannerState>()(
  persist(
    immer((setState, get) => {
      /**
       * All actions go through this. While read-only, whatever a recipe does
       * to the project or its history is rolled back; selection, tools and
       * view still work so the plan can be explored.
       */
      const set = (recipe: (s: Draft<PlannerState>) => void) =>
        setState((s) => {
          const { readOnly, project, past, future } = get();
          recipe(s);
          if (readOnly) {
            s.project = project;
            s.past = past;
            s.future = future;
          }
        });

      /**
       * Call inside a `set` recipe, after validating and before mutating
       * `s.project`. Pushes the pre-edit project onto the undo stack.
       * `get()` still returns the committed state at that point.
       */
      const record = (s: Draft<PlannerState>) => {
        if (gestureStart) return;
        s.past.push(get().project);
        if (s.past.length > HISTORY_LIMIT) s.past.shift();
        s.future = [];
      };

      return {
        project: makeProject(),
        view: { ...DEFAULT_VIEW },
        tool: 'select',
        selection: null,
        pendingAssetRef: null,
        pendingOpening: null,
        notice: null,
        cloud: null,
        cloudStatus: 'idle',
        cloudError: null,
        cloudConflict: null,
        readOnly: false,
        shared: null,
        calibration: null,
        drawLength: '',
        highlightedWall: null,
        past: [],
        future: [],

        setTool: (t) =>
          set((s) => {
            s.tool = t;
            // Tool change clears any in-progress selection that no longer applies.
            if (t !== 'select') s.selection = null;
            // Switching away from add-inventory abandons a pending asset pick.
            if (t !== 'add-inventory') s.pendingAssetRef = null;
            if (t !== 'add-opening') s.pendingOpening = null;
            if (t !== 'calibrate') s.calibration = null;
            if (t !== 'draw-room') s.drawLength = '';
          }),

        pickAsset: (assetId) =>
          set((s) => {
            s.pendingAssetRef = assetId;
            s.tool = 'add-inventory';
            s.selection = null;
          }),

        pickOpening: (kind) =>
          set((s) => {
            s.pendingOpening = kind;
            s.pendingAssetRef = null;
            s.tool = 'add-opening';
            s.selection = null;
          }),

        addOpeningAt: (p) =>
          set((s) => {
            const room = s.project.room;
            const kind = s.pendingOpening;
            if (!kind) return;
            const hit = room?.closed ? nearestWall(room, p) : null;
            // Accept clicks up to ~25 px or 600 mm from a wall, whichever is larger.
            const reach = Math.max(600, 25 / s.view.zoom);
            if (!room || !hit || hit.distance > reach) {
              s.notice = {
                id: Date.now(),
                tone: 'info',
                message: room?.closed
                  ? `Click on a wall to place the ${openingType(kind).name.toLowerCase()}.`
                  : 'Draw and close the room first — doors and windows go in its walls.',
              };
              return;
            }
            record(s);
            const t = openingType(kind);
            const id = newId('opn');
            room.openings.push({
              id,
              kind,
              wallStartCornerId: hit.cornerId,
              offset: clampOffset(hit.length, t.width, hit.along) as Mm,
              width: mm(t.width),
              height: mm(t.height),
              sillHeight: mm(t.sillHeight),
              hinge: 'start',
              swing: 'in',
            });
            s.selection = { kind: 'opening', id };
            s.tool = 'select';
            s.pendingOpening = null;
            s.notice = null;
            touch(s.project);
          }),

        updateOpening: (id, patch) =>
          set((s) => {
            const room = s.project.room;
            const o = room?.openings.find((x) => x.id === id);
            if (!room || !o) return;
            record(s);
            Object.assign(o, patch);
            if (o.sillHeight >= o.height) o.sillHeight = mm(Math.max(0, o.height - 100));
            const span = openingSpan(room, o);
            if (span) o.offset = clampOffset(span.length, o.width, o.offset) as Mm;
            touch(s.project);
          }),

        moveOpening: (id, p) =>
          set((s) => {
            const room = s.project.room;
            const o = room?.openings.find((x) => x.id === id);
            const hit = room ? nearestWall(room, p) : null;
            if (!room || !o || !hit) return;
            record(s);
            o.wallStartCornerId = hit.cornerId;
            o.offset = clampOffset(hit.length, o.width, hit.along) as Mm;
            touch(s.project);
          }),

        setUnderlay: (u) =>
          set((s) => {
            if (!u && !s.project.underlay) return;
            record(s);
            s.project.underlay = u;
            touch(s.project);
          }),

        updateUnderlay: (patch) =>
          set((s) => {
            const u = s.project.underlay;
            if (!u) return;
            record(s);
            Object.assign(u, patch);
            if (patch.position) u.position = { ...patch.position };
            touch(s.project);
          }),

        startCalibration: () =>
          set((s) => {
            if (!s.project.underlay) return;
            s.tool = 'calibrate';
            s.calibration = { a: null, b: null };
            s.selection = null;
            s.pendingAssetRef = null;
          }),

        addCalibrationPoint: (p) =>
          set((s) => {
            const c = s.calibration;
            if (!c) return;
            if (!c.a) c.a = { x: p.x, y: p.y };
            else if (!c.b) c.b = { x: p.x, y: p.y };
          }),

        applyCalibration: (distanceMm) =>
          set((s) => {
            const c = s.calibration;
            const u = s.project.underlay;
            if (!c?.a || !c.b || !u || !(distanceMm > 0)) return;
            const measured = Math.hypot(c.b.x - c.a.x, c.b.y - c.a.y);
            if (measured < 1) return;
            record(s);
            const k = distanceMm / measured;
            // Scale about the first point so it stays put on screen.
            u.position = {
              x: (c.a.x + (u.position.x - c.a.x) * k) as Mm,
              y: (c.a.y + (u.position.y - c.a.y) * k) as Mm,
            };
            u.width = (u.width * k) as Mm;
            u.calibrated = true;
            u.locked = true;
            s.calibration = null;
            s.tool = 'select';
            touch(s.project);
          }),

        dismissNotice: () =>
          set((s) => {
            s.notice = null;
          }),

        setSelection: (sel) =>
          set((s) => {
            s.selection = sel;
            s.highlightedWall = null;
          }),

        setZoom: (z) =>
          set((s) => {
            s.view.zoom = Math.max(0.005, Math.min(2, z));
          }),
        setPan: (x, y) =>
          set((s) => {
            s.view.pan.x = x;
            s.view.pan.y = y;
          }),
        resetView: () =>
          set((s) => {
            s.view.zoom = DEFAULT_VIEW.zoom;
            s.view.pan = { ...DEFAULT_VIEW.pan };
          }),
        toggleGrid: () =>
          set((s) => {
            s.view.showGrid = !s.view.showGrid;
          }),
        toggleSnap: () =>
          set((s) => {
            s.view.snapToGrid = !s.view.snapToGrid;
          }),
        toggleLayoutCheck: () =>
          set((s) => {
            s.view.showLayoutCheck = !s.view.showLayoutCheck;
          }),

        setMinAisle: (mmValue) =>
          set((s) => {
            if (!(mmValue > 0) || s.project.minAisle === mmValue) return;
            record(s);
            s.project.minAisle = mm(mmValue);
            touch(s.project);
          }),

        setNotes: (notes) =>
          set((s) => {
            if ((s.project.notes ?? '') === notes) return;
            record(s);
            s.project.notes = notes;
            touch(s.project);
          }),

        setViewMode: (m) =>
          set((s) => {
            s.view.viewMode = m;
            // Room drawing needs the 2D plan; placement tools work in both.
            if (m === '3d' && s.tool === 'draw-room') s.tool = 'select';
          }),

        undo: () => {
          const { past, project } = get();
          const prev = past[past.length - 1];
          if (!prev || gestureStart) return;
          set((s) => {
            s.past.pop();
            s.future.push(project);
            s.project = prev;
            pruneSelection(s);
          });
        },

        redo: () => {
          const { future, project } = get();
          const next = future[future.length - 1];
          if (!next || gestureStart) return;
          set((s) => {
            s.future.pop();
            s.past.push(project);
            s.project = next;
            pruneSelection(s);
          });
        },

        beginGesture: () => {
          if (!gestureStart) gestureStart = get().project;
        },

        endGesture: () => {
          const start = gestureStart;
          gestureStart = null;
          if (!start || start === get().project) return;
          set((s) => {
            s.past.push(start);
            if (s.past.length > HISTORY_LIMIT) s.past.shift();
            s.future = [];
          });
        },

        startRoom: () =>
          set((s) => {
            if (!s.project.room) {
              record(s);
              s.project.room = {
                id: newId('room'),
                corners: [],
                closed: false,
                wallThickness: mm(120),
                wallHeight: mm(2700),
                openings: [],
              };
            } else if (s.project.room.corners.length > 0) {
              // Reset existing room when user explicitly redraws.
              record(s);
              s.project.room.corners = [];
              s.project.room.closed = false;
              s.project.room.openings = [];
            }
            s.tool = 'draw-room';
            s.selection = null;
          }),

        addCorner: (p, opts) =>
          set((s) => {
            if (!s.project.room) return;
            if (s.project.room.closed) return;
            record(s);
            const snapped = opts?.snap === false ? p : maybeSnap(s.view, p);
            s.drawLength = '';
            s.project.room.corners.push({
              id: newId('cor'),
              point: { x: snapped.x as Mm, y: snapped.y as Mm },
            });
            touch(s.project);
          }),

        setDrawLength: (text) =>
          set((s) => {
            s.drawLength = text;
          }),

        setWallLength: (index, lengthMm) =>
          set((s) => {
            const room = s.project.room;
            if (!room) return;
            const next = resizeWall(room.corners, room.closed, index, lengthMm);
            if (next === room.corners) return;
            record(s);
            room.corners = next;
            touch(s.project);
          }),

        setHighlightedWall: (index) =>
          set((s) => {
            s.highlightedWall = index;
          }),

        closeRoom: () =>
          set((s) => {
            if (!s.project.room) return;
            if (s.project.room.corners.length < 3) return;
            record(s);
            s.project.room.closed = true;
            s.tool = 'select';
            s.drawLength = '';
            touch(s.project);
          }),

        moveCorner: (cornerId, p) =>
          set((s) => {
            const room = s.project.room;
            if (!room) return;
            const c = room.corners.find((c) => c.id === cornerId);
            if (!c) return;
            record(s);
            const snapped = maybeSnap(s.view, p);
            c.point = { x: snapped.x as Mm, y: snapped.y as Mm };
            touch(s.project);
          }),

        insertCorner: (afterCornerId, p) =>
          set((s) => {
            const room = s.project.room;
            if (!room) return;
            const idx = room.corners.findIndex((c) => c.id === afterCornerId);
            if (idx < 0) return;
            record(s);
            const snapped = maybeSnap(s.view, p);
            const start = room.corners[idx]!.point;
            const id = newId('cor');
            room.corners.splice(idx + 1, 0, {
              id,
              point: { x: snapped.x as Mm, y: snapped.y as Mm },
            });
            room.openings = reanchorAfterInsert(
              room.openings,
              afterCornerId,
              id,
              Math.hypot(snapped.x - start.x, snapped.y - start.y),
            );
            touch(s.project);
          }),

        deleteCorner: (cornerId) =>
          set((s) => {
            const room = s.project.room;
            if (!room) return;
            if (room.corners.length <= 3 && room.closed) return; // refuse to break a triangle
            if (!room.corners.some((c) => c.id === cornerId)) return;
            record(s);
            const before = get().project.room!;
            room.corners = room.corners.filter((c) => c.id !== cornerId);
            room.openings = reanchorByPosition(before, {
              ...before,
              corners: before.corners.filter((c) => c.id !== cornerId),
            });
            if (s.selection?.kind === 'corner' && s.selection.id === cornerId) {
              s.selection = null;
            }
            touch(s.project);
          }),

        updateRoomMeta: (patch) =>
          set((s) => {
            if (!s.project.room) return;
            record(s);
            if (patch.wallThickness !== undefined) s.project.room.wallThickness = patch.wallThickness;
            if (patch.wallHeight !== undefined) s.project.room.wallHeight = patch.wallHeight;
            touch(s.project);
          }),

        addPillarAt: (p) =>
          set((s) => {
            record(s);
            const snapped = maybeSnap(s.view, p);
            const id = newId('pil');
            const pillar: Pillar = {
              id,
              type: 'pillar',
              position: { x: snapped.x as Mm, y: snapped.y as Mm },
              size: { width: mm(300), depth: mm(300), height: mm(2700) },
              rotation: rad(0),
              shape: 'rect',
            };
            s.project.pillars.push(pillar);
            s.selection = { kind: 'pillar', id };
            s.tool = 'select';
            touch(s.project);
          }),

        addInventoryAt: (p, opts) =>
          set((s) => {
            record(s);
            const snapped = maybeSnap(s.view, p);
            const id = newId('inv');
            const asset = findAsset(s.pendingAssetRef ?? undefined);
            const item: InventoryItem = asset
              ? {
                  id,
                  type: 'inventory',
                  name: asset.name,
                  category: asset.category,
                  assetRef: asset.id,
                  position: { x: snapped.x as Mm, y: snapped.y as Mm },
                  size: { ...asset.size },
                  rotation: rad(0),
                }
              : {
                  id,
                  type: 'inventory',
                  name: 'Display table',
                  position: { x: snapped.x as Mm, y: snapped.y as Mm },
                  size: { width: mm(1200), depth: mm(600), height: mm(900) },
                  rotation: rad(0),
                };
            if (asset?.mount === 'wall' && opts?.wallSnap !== false && s.project.room) {
              // Snap from the raw click so grid rounding can't push it out of reach.
              const hit = snapToWall(s.project.room, p, item.size.depth);
              if (hit) {
                item.position = hit.position;
                item.rotation = hit.rotation;
              }
            }
            s.project.inventory.push(item);
            s.notice = asset?.minWallHeight
              ? mountingNotice(asset.name, asset.mountHeight, asset.minWallHeight, s.project.room)
              : null;
            s.selection = { kind: 'inventory', id };
            s.tool = 'select';
            s.pendingAssetRef = null;
            touch(s.project);
          }),

        updatePillar: (id, patch) =>
          set((s) => {
            const p = s.project.pillars.find((x) => x.id === id);
            if (!p) return;
            record(s);
            Object.assign(p, patch);
            if (patch.size) p.size = { ...p.size, ...patch.size };
            if (patch.position) p.position = { ...p.position, ...patch.position };
            if (patch.rotation !== undefined) p.rotation = normalizeAngle(patch.rotation);
            touch(s.project);
          }),

        updateInventory: (id, patch) =>
          set((s) => {
            const it = s.project.inventory.find((x) => x.id === id);
            if (!it) return;
            record(s);
            Object.assign(it, patch);
            if (patch.size) it.size = { ...it.size, ...patch.size };
            if (patch.position) it.position = { ...it.position, ...patch.position };
            if (patch.rotation !== undefined) it.rotation = normalizeAngle(patch.rotation);
            touch(s.project);
          }),

        moveInventory: (id, p, opts) =>
          set((s) => {
            const it = s.project.inventory.find((x) => x.id === id);
            if (!it) return;
            record(s);
            const asset = findAsset(it.assetRef);
            const hit =
              asset?.mount === 'wall' && opts?.wallSnap !== false && s.project.room
                ? snapToWall(s.project.room, p, it.size.depth)
                : null;
            if (hit) {
              it.position = hit.position;
              it.rotation = hit.rotation;
            } else {
              it.position = { x: p.x, y: p.y };
            }
            touch(s.project);
          }),

        rotateSelected: (delta) =>
          set((s) => {
            const sel = s.selection;
            if (!sel) return;
            if (sel.kind === 'opening') {
              const o = s.project.room?.openings.find((x) => x.id === sel.id);
              if (!o || (o.kind !== 'door' && o.kind !== 'double-door')) return;
              record(s);
              if (delta > 0) o.hinge = o.hinge === 'start' ? 'end' : 'start';
              else o.swing = o.swing === 'in' ? 'out' : 'in';
              touch(s.project);
              return;
            }
            const target =
              sel.kind === 'pillar'
                ? s.project.pillars.find((x) => x.id === sel.id)
                : sel.kind === 'inventory'
                  ? s.project.inventory.find((x) => x.id === sel.id)
                  : undefined;
            if (!target) return;
            record(s);
            target.rotation = normalizeAngle(target.rotation + delta);
            touch(s.project);
          }),

        duplicateSelected: () =>
          set((s) => {
            const sel = s.selection;
            if (!sel) return;
            const offset = mm(300) as number;
            if (sel.kind === 'pillar') {
              const orig = s.project.pillars.find((x) => x.id === sel.id);
              if (!orig) return;
              record(s);
              const id = newId('pil');
              s.project.pillars.push({
                ...orig,
                id,
                position: { x: (orig.position.x + offset) as Mm, y: (orig.position.y + offset) as Mm },
                size: { ...orig.size },
              });
              s.selection = { kind: 'pillar', id };
            } else if (sel.kind === 'inventory') {
              const orig = s.project.inventory.find((x) => x.id === sel.id);
              if (!orig) return;
              record(s);
              const id = newId('inv');
              s.project.inventory.push({
                ...orig,
                id,
                position: { x: (orig.position.x + offset) as Mm, y: (orig.position.y + offset) as Mm },
                size: { ...orig.size },
              });
              s.selection = { kind: 'inventory', id };
            } else {
              return;
            }
            touch(s.project);
          }),

        deleteSelected: () => {
          const sel = get().selection;
          if (!sel) return;
          if (sel.kind === 'corner') {
            get().deleteCorner(sel.id);
            return;
          }
          set((s) => {
            if (sel.kind === 'pillar') {
              if (!s.project.pillars.some((x) => x.id === sel.id)) return;
              record(s);
              s.project.pillars = s.project.pillars.filter((x) => x.id !== sel.id);
            } else if (sel.kind === 'inventory') {
              if (!s.project.inventory.some((x) => x.id === sel.id)) return;
              record(s);
              s.project.inventory = s.project.inventory.filter((x) => x.id !== sel.id);
            } else if (sel.kind === 'opening') {
              const room = s.project.room;
              if (!room?.openings.some((x) => x.id === sel.id)) return;
              record(s);
              room.openings = room.openings.filter((x) => x.id !== sel.id);
            } else {
              return;
            }
            s.selection = null;
            touch(s.project);
          });
        },

        // New and Load start a separate plan: they work even while read-only
        // and detach from any cloud project or shared view.
        newProject: () =>
          setState((s) => {
            record(s);
            s.project = makeProject();
            s.selection = null;
            s.tool = 'select';
            detach(s);
          }),

        renameProject: (name) =>
          set((s) => {
            if (s.project.name === name) return;
            record(s);
            s.project.name = name;
            touch(s.project);
          }),

        loadProject: (raw) =>
          setState((s) => {
            const p = migrate(raw);
            record(s);
            s.project = p;
            s.selection = null;
            s.tool = 'select';
            detach(s);
          }),

        // Opening a plan from the cloud or a link replaces the session: it
        // bypasses the read-only guard and starts a fresh history.
        openCloudProject: (cp) =>
          setState((s) => {
            s.project = { ...migrate(cp.data), name: cp.name };
            s.past = [];
            s.future = [];
            s.selection = null;
            s.tool = 'select';
            s.pendingAssetRef = null;
            s.pendingOpening = null;
            s.cloud = {
              projectId: cp.id,
              version: cp.version,
              role: cp.role,
              ownerEmail: cp.owner_email,
              dirty: false,
              lastSavedAt: cp.updated_at,
            };
            s.readOnly = cp.role === 'viewer';
            s.shared = null;
            s.cloudStatus = 'saved';
            s.cloudError = null;
            s.cloudConflict = null;
          }),

        linkCloud: (link) =>
          setState((s) => {
            s.cloud = { ...link, dirty: false };
            s.readOnly = link.role === 'viewer';
            s.cloudStatus = 'saved';
            s.cloudError = null;
            s.cloudConflict = null;
          }),

        unlinkCloud: () =>
          setState((s) => {
            s.cloud = null;
            s.readOnly = false;
            s.cloudStatus = 'idle';
            s.cloudError = null;
            s.cloudConflict = null;
          }),

        setCloudStatus: (status, error = null) =>
          setState((s) => {
            s.cloudStatus = status;
            s.cloudError = error;
          }),

        markSynced: (result, saved) =>
          setState((s) => {
            if (!s.cloud) return;
            s.cloud.version = result.version;
            s.cloud.lastSavedAt = result.updated_at;
            s.cloud.dirty = get().project !== saved;
            s.cloudStatus = 'saved';
            s.cloudError = null;
            s.cloudConflict = null;
          }),

        setCloudConflict: (c) =>
          setState((s) => {
            s.cloudConflict = c;
            s.cloudStatus = 'conflict';
          }),

        openShared: (sp) =>
          setState((s) => {
            s.project = { ...migrate(sp.data), name: sp.name };
            s.past = [];
            s.future = [];
            s.selection = null;
            s.tool = 'select';
            s.cloud = null;
            s.readOnly = true;
            s.shared = { name: sp.name, ownerEmail: sp.owner_email, updatedAt: sp.updated_at };
          }),
      };
    }),
    {
      // Autosave: the project and which cloud project it belongs to go to
      // localStorage. View, tool and undo history are session state.
      name: 'sf-planner:project',
      version: 1,
      storage: batchedLocalStorage(),
      partialize: (s) => ({ project: s.project, cloud: s.cloud }),
      // Hydrate after mount (PlannerShell) so the prerendered HTML and the
      // first client render agree.
      skipHydration: true,
      merge: (persisted, current) => {
        const saved = persisted as { project?: unknown; cloud?: CloudLink | null } | undefined;
        const raw = saved?.project;
        if (!raw) return current;
        try {
          const cloud = saved?.cloud?.projectId ? saved.cloud : null;
          return { ...current, project: migrate(raw), cloud, readOnly: cloud?.role === 'viewer' };
        } catch {
          // Corrupt or incompatible save: start fresh rather than crash.
          return current;
        }
      },
    },
  ),
);

// Any edit to a plan that is linked to the cloud marks it as unsaved there.
// Switching to another plan (link changes along with the project) doesn't.
usePlannerStore.subscribe((state, prev) => {
  if (
    state.project !== prev.project &&
    state.cloud &&
    !state.cloud.dirty &&
    state.cloud.projectId === prev.cloud?.projectId &&
    !state.readOnly
  ) {
    usePlannerStore.setState((s) => {
      if (s.cloud) s.cloud.dirty = true;
    });
  }
});

// expose Radians type for callers that need to type-assert
export type { Radians };
