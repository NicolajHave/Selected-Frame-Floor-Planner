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
  Accessory,
  Opening,
  OpeningKind,
  ElectricalKind,
  ElectricalPoint,
  PlanNote,
  Selection,
  Point,
  Mm,
  Radians,
} from '@/model';
import { mm, rad } from '@/model/units';
import { newId } from '@/lib/id';
import * as variants from '@/lib/variants';
import { proposeLayout as makeProposal, type AutoLayoutOptions } from '@/lib/autoLayout';
import { clipCount, makeClip, placeClip, readClip, writeClip } from '@/lib/clipboard';
import { CURRENT_SCHEMA, migrate } from '@/lib/schema';
import { snapPoint } from '@/geometry/snap';
import { normalizeAngle, pushToWalls, snapToWall } from '@/geometry/wallSnap';
import { rectCorners } from '@/geometry/transform';
import { scaleRoomByCorner as scaleRoom } from '@/geometry/corners';
import { boxOf, snapToObjects, squareAngle, type SnapGuide } from '@/geometry/objectSnap';
import { DEFAULT_MIN_AISLE, innerOutline } from '@/lib/layout';
import { setWallLength as resizeWall } from '@/geometry/walls';
import { wallHeightNear } from '@/geometry/wallStyle';
import {
  MIN_OPENING_WIDTH,
  fitOpening,
  nearestWall,
  openingSpan,
  placeOpening,
  projectOnWall,
  reanchorAfterInsert,
  reanchorByPosition,
  stretchAround,
  wallFrame,
} from '@/geometry/openings';
import { openingType } from '@/lib/openingTypes';
import { electricalType } from '@/lib/electricalTypes';
import { clampToWall, electricalAnchor, reanchorElectrical, wallAnchorAt } from '@/geometry/electrical';
import { findAsset } from '@/lib/assetCatalog';
import { RACK_CATEGORY, itemMount, rackSize } from '@/lib/racks';
import { alignPositions, distributePositions, isGroupable, rotatePositions, type AlignMode } from '@/lib/group';
import { batchedLocalStorage } from '@/lib/autosaveStorage';
import { outset } from '@/lib/wallTrace';
import { TRAY_3X3, TRAY_3X5, accessoryHosts, accessoryOptions, freeShelf, roomFor } from '@/lib/accessories';
import { LAYOUT_LOCKED_MESSAGE, isLayoutKind, isLocked, itemLockedMessage } from '@/lib/locks';
import type { CloudProject, CloudRole, SaveResult, SharedProject } from '@/lib/cloud/api';

export type Tool =
  | 'select'
  | 'draw-room'
  /** Drag out a rectangular room. */
  | 'draw-rect'
  | 'add-pillar'
  | 'add-inventory'
  | 'add-opening'
  | 'add-electrical'
  | 'add-note'
  /** Click two points to measure between them. */
  | 'measure'
  | 'calibrate'
  /** Click inside a room on the plan underlay to draft its walls. */
  | 'trace-room';

/** Walls found on the underlay around a click, waiting to be used or dropped. */
export interface WallDraft {
  /** Where the user clicked, world mm (shift-clicks add more of the room). */
  seeds: Point[];
  /** Openings up to this wide are closed before filling, mm. */
  gapMm: number;
  /** The room's inside outline, world mm (null while working or when nothing was found). */
  points: Point[] | null;
  /** The fill escaped through a wider opening: the outline isn't a room. */
  leaked: boolean;
  areaM2: number;
  busy: boolean;
  error?: string;
}

/** Two clicks on the underlay that span a known real-world distance. */
export interface Calibration {
  a: Point | null;
  b: Point | null;
}

export interface PendingRack {
  name: string;
  modules: string[];
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
  /** Line up with nearby fixtures and keep the aisle to them (default on; Alt turns it off). */
  objectSnap?: boolean;
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
   * Several objects selected together (shift-click, shift-drag a box). Only
   * counts while it contains `selection`; see `selectedMembers`.
   */
  multi: Selection[];
  /**
   * When set, the next click in `add-inventory` mode places this asset (with
   * its catalog name + size + assetRef) instead of the generic placeholder.
   * Cleared after one placement or when the user switches tools.
   */
  pendingAssetRef: string | null;
  /** Wall rack the next click places (from the rack builder). */
  pendingRack: PendingRack | null;
  /** The rack builder dialog: a new rack, or editing a placed one. */
  rackBuilder: { editId: string | null } | null;
  /** Kind of door/opening/window the next click on a wall places. */
  pendingOpening: OpeningKind | null;
  /** Kind of electrical point the next click places. */
  pendingElectrical: ElectricalKind | null;
  /** In-progress underlay scale calibration; null outside the calibrate tool. */
  calibration: Calibration | null;
  wallDraft: WallDraft | null;
  /** The measurement in progress: `b` is null until the second click. */
  measure: { a: Point; b: Point | null } | null;
  measureClick: (p: Point) => void;
  /** Keeps the finished measurement as a dimension line on the plan. */
  keepMeasure: () => void;
  removeDimension: (id: string) => void;
  clearDimensions: () => void;
  /** Lines showing what a dragged fixture snapped to (cleared when the drag ends). */
  snapGuides: SnapGuide[];
  clearSnapGuides: () => void;
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
  setSelection: (sel: Selection | null) => void;
  /** Shift-click: add to or take out of the selection. */
  toggleSelected: (sel: Selection) => void;
  /** Box select; `add` keeps what was already selected. */
  selectMany: (sels: Selection[], add?: boolean) => void;
  /** Move everything selected by (dx, dy) mm. */
  translateSelected: (dx: number, dy: number) => void;
  alignSelected: (mode: AlignMode) => void;
  /** Equal gaps along x or y (three or more selected). */
  distributeSelected: (axis: 'x' | 'y') => void;
  pickAsset: (assetId: string) => void;
  pickOpening: (kind: OpeningKind) => void;
  pickElectrical: (kind: ElectricalKind) => void;

  // plan underlay
  setUnderlay: (u: PlanUnderlay | null) => void;
  updateUnderlay: (patch: Partial<PlanUnderlay>) => void;
  startCalibration: () => void;
  /** Lock the plan underlay in place (or unlock it). */
  setUnderlayPinned: (pinned: boolean) => void;
  /** Start the "draft walls from the plan" tool. */
  startWallTrace: () => void;
  setWallDraft: (d: WallDraft | null) => void;
  /** Replace the room with the drafted walls. */
  applyWallDraft: () => void;
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
  /** Set (or clear, with null) the fixtures budget, euro. */
  setBudget: (eur: number | null) => void;

  // layout variants (A, B, …): fixtures per layout, the room shared
  addVariant: (mode: 'copy' | 'empty') => void;
  /** An automatic layout as a new variant: brand or volume shop, keeping the aisle. */
  proposeLayout: (opts: AutoLayoutOptions) => void;
  /** Also works on a view-only plan: looking at the other layouts changes nothing. */
  switchVariant: (id: string) => void;
  renameVariant: (id: string, name: string) => void;
  deleteVariant: (id: string) => void;

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
  /** Replace the room with a closed rectangle spanning two opposite corners. */
  addRectRoom: (a: Point, b: Point) => void;
  moveCorner: (cornerId: string, p: Point) => void;
  /** Shift-drag of a corner: the whole room scales evenly from `base` (the room when the drag began). */
  scaleRoomByCorner: (base: RoomPolygon, cornerId: string, p: Point) => void;
  insertCorner: (afterCornerId: string, p: Point) => void;
  deleteCorner: (cornerId: string) => void;
  updateRoomMeta: (patch: Partial<Pick<RoomPolygon, 'wallThickness' | 'wallHeight'>>) => void;
  /** Wall `index`: its own height (null = the room's) and whether it is see-through. */
  updateWall: (index: number, patch: { height?: number | null; transparent?: boolean }) => void;

  // object actions
  addPillarAt: (p: Point) => void;
  addInventoryAt: (p: Point, opts?: PlaceOptions) => void;
  updatePillar: (id: string, patch: Partial<Pillar>) => void;
  updateInventory: (id: string, patch: Partial<InventoryItem>) => void;
  /** Drag-move an inventory item; applies wall snapping for wall-mounted assets. */
  moveInventory: (id: string, p: Point, opts?: PlaceOptions) => void;
  /** Place the pending opening on the wall nearest `p`. */
  addOpeningAt: (p: Point) => void;
  /** Put a new opening on wall `index`, as near its middle as there is room. */
  addOpeningOnWall: (index: number, kind: OpeningKind) => void;
  updateOpening: (id: string, patch: Partial<Omit<Opening, 'id'>>) => void;
  /**
   * Drag an opening along (or onto another) wall. `grab` is how far the
   * opening's centre was from the pointer, along the wall, when the drag began.
   */
  moveOpening: (id: string, p: Point, grab?: number) => void;
  /** Drag one end of an opening to change its width; the other end stays. */
  resizeOpening: (id: string, end: 'start' | 'end', p: Point) => void;

  // electrical points and plan notes
  /** Place the pending electrical point on the wall nearest `p` (floor boxes: at `p`). */
  addElectricalAt: (p: Point) => void;
  updateElectrical: (id: string, patch: Partial<Omit<ElectricalPoint, 'id'>>) => void;
  /** Drag along (or onto another) wall; floor boxes move freely. */
  moveElectrical: (id: string, p: Point) => void;
  addNoteAt: (p: Point) => void;
  updateNote: (id: string, patch: Partial<Omit<PlanNote, 'id'>>) => void;
  /** Show or hide the note's arrow. */
  toggleNoteArrow: (id: string) => void;
  /** Objects: rotate by `delta`. Doors: positive flips the hinge side, negative the swing. */
  rotateSelected: (delta: number) => void;
  /** Lock or unlock the floor layout (walls, corners, doors, windows, pillars). */
  setLayoutLocked: (locked: boolean) => void;
  /** Lock or unlock fixtures in place. */
  setItemsLocked: (ids: string[], locked: boolean) => void;
  /** L: lock the selected fixtures, or unlock them if they all are. */
  toggleLockSelected: () => void;
  /** Explain why something can't be moved (a press on a locked thing). */
  explainLock: (sel: Selection) => void;
  /** Add a sign or tray to a fixture (or to unit `module` of a wall rack). */
  addAccessory: (itemId: string, assetRef: string, module?: number) => void;
  removeAccessory: (itemId: string, accessoryId: string) => void;
  /** Move a tray to another shelf of its unit. */
  setAccessoryShelf: (itemId: string, accessoryId: string, shelf: number) => void;
  duplicateSelected: () => void;
  /** Ctrl+C: puts the selected fixtures, pillars and notes on the planner's clipboard. */
  copySelected: () => void;
  /** Ctrl+V: pastes the clipboard (from any plan or layout) centred on `at`. */
  pasteClip: (at: Point) => void;
  deleteSelected: () => void;

  // wall racks
  openRackBuilder: (editId?: string | null) => void;
  closeRackBuilder: () => void;
  /** Arm placement of a new rack; the next click puts it on the nearest wall. */
  pickRack: (rack: PendingRack) => void;
  /** Change a placed rack's units and name; its back stays on the wall. */
  updateRack: (id: string, rack: PendingRack) => void;

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
  /** Replace the plan with an earlier version of it (one undo step). */
  restoreVersion: (data: unknown, name: string) => void;
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
const sameSel = (a: Selection, b: Selection) => a.kind === b.kind && a.id === b.id;

/** Everything selected: the group, if it holds the current selection, else just the selection. */
export function selectedMembers(s: Pick<PlannerState, 'selection' | 'multi'>): Selection[] {
  const sel = s.selection;
  if (!sel) return [];
  if (s.multi.length > 1 && s.multi.some((m) => sameSel(m, sel))) return s.multi;
  return [sel];
}

function applyPositions(s: Draft<PlannerState>, positions: Map<string, Point>) {
  for (const [id, p] of positions) {
    const o =
      s.project.pillars.find((x) => x.id === id) ??
      s.project.inventory.find((x) => x.id === id) ??
      s.project.annotations?.find((x) => x.id === id);
    if (!o) continue;
    const dx = p.x - o.position.x;
    const dy = p.y - o.position.y;
    o.position = { x: p.x, y: p.y };
    if ('target' in o && o.target) o.target = { x: (o.target.x + dx) as Mm, y: (o.target.y + dy) as Mm };
  }
}

/** How far from a wall (mm) a click still counts as on it: ~25 px or 600 mm. */
const openingReach = (zoom: number) => Math.max(600, 25 / zoom);

const formatMm = (v: number) => `${Math.round(v).toLocaleString('da-DK')} mm`;

function copyAccessories(list: readonly Accessory[]): Accessory[] {
  return list.map((a) => ({ ...a, id: newId('acc') }));
}

const PLAN_LOCKED_MESSAGE = 'The plan is locked. Unlock it in the Plan underlay panel to move, rescale or replace it.';

function info(message: string): Notice {
  return { id: ++noticeSeq, tone: 'info', message };
}

/** The same message again keeps its notice (so a drag doesn't flash it anew). */
function sameNotice(current: Notice | null, message: string): Notice {
  return current?.message === message ? current : info(message);
}

/** Adds an opening of `kind` with its default size; returns its id. */
function newOpening(room: Draft<RoomPolygon>, kind: OpeningKind, cornerId: string, offset: number): string {
  const t = openingType(kind);
  const id = newId('opn');
  room.openings.push({
    id,
    kind,
    wallStartCornerId: cornerId,
    offset: offset as Mm,
    width: mm(t.width),
    height: mm(t.height),
    sillHeight: mm(t.sillHeight),
    hinge: 'start',
    swing: 'in',
  });
  return id;
}

function mountingNotice(
  name: string,
  mountHeight: number | undefined,
  minWallHeight: number,
  room: RoomPolygon | null,
  at: Point,
): Notice {
  const hang = mountHeight !== undefined ? `${name} hangs with its bottom edge at ${metres(mountHeight)}. ` : '';
  const base = `${hang}Walls must be at least ${metres(minWallHeight)} high.`;
  const wall = room ? wallHeightNear(room, at) : null;
  if (wall !== null && wall < minWallHeight) {
    return {
      id: ++noticeSeq,
      tone: 'warning',
      message: `${base} This wall is only ${metres(wall)} — raise it in the wall's properties (click the wall).`,
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
  if (s.multi.length) {
    const p = s.project;
    s.multi = s.multi.filter((m) =>
      m.kind === 'pillar'
        ? p.pillars.some((x) => x.id === m.id)
        : m.kind === 'inventory'
          ? p.inventory.some((x) => x.id === m.id)
          : !!p.annotations?.some((x) => x.id === m.id),
    );
    if (s.multi.length < 2) s.multi = [];
  }
  const sel = s.selection;
  if (!sel) return;
  const { project } = s;
  const exists =
    (sel.kind === 'pillar' && project.pillars.some((p) => p.id === sel.id)) ||
    (sel.kind === 'inventory' && project.inventory.some((i) => i.id === sel.id)) ||
    (sel.kind === 'corner' && !!project.room?.corners.some((c) => c.id === sel.id)) ||
    (sel.kind === 'room' && !!project.room) ||
    (sel.kind === 'opening' && !!project.room?.openings.some((o) => o.id === sel.id)) ||
    (sel.kind === 'wall' && !!project.room?.corners.some((c) => c.id === sel.id)) ||
    (sel.kind === 'electrical' && !!project.electrical?.some((e) => e.id === sel.id)) ||
    (sel.kind === 'note' && !!project.annotations?.some((n) => n.id === sel.id));
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

      /** True (and says why) while the floor layout is locked. */
      const layoutBlocked = (s: Draft<PlannerState>) => {
        if (!s.project.layoutLocked) return false;
        s.notice = sameNotice(s.notice, LAYOUT_LOCKED_MESSAGE);
        return true;
      };

      /** True (and says why) when the fixture is locked in place. */
      const itemBlocked = (s: Draft<PlannerState>, it: { locked?: boolean; name: string }) => {
        if (!it.locked) return false;
        s.notice = sameNotice(s.notice, itemLockedMessage(it.name));
        return true;
      };

      /** The members a group edit may move: not locked ones. */
      const movable = (s: Draft<PlannerState>, members: Selection[]) => {
        const free = members.filter((m) => !isLocked(s.project, m));
        if (free.length < members.length) {
          s.notice = sameNotice(
            s.notice,
            `${members.length - free.length} locked ${members.length - free.length === 1 ? 'object stays' : 'objects stay'} in place.`,
          );
        }
        return free;
      };

      return {
        project: makeProject(),
        view: { ...DEFAULT_VIEW },
        tool: 'select',
        selection: null,
        multi: [],
        pendingAssetRef: null,
        pendingRack: null,
        rackBuilder: null,
        pendingOpening: null,
        pendingElectrical: null,
        notice: null,
        cloud: null,
        cloudStatus: 'idle',
        cloudError: null,
        cloudConflict: null,
        readOnly: false,
        shared: null,
        calibration: null,
        wallDraft: null,
        snapGuides: [],
        measure: null,
        drawLength: '',
        highlightedWall: null,
        past: [],
        future: [],

        setTool: (t) =>
          set((s) => {
            if ((t === 'draw-room' || t === 'draw-rect' || t === 'add-pillar' || t === 'add-opening') && layoutBlocked(s)) return;
            s.tool = t;
            // Tool change clears any in-progress selection that no longer applies.
            if (t !== 'select') s.selection = null;
            // Switching away from add-inventory abandons a pending asset pick.
            if (t !== 'add-inventory') {
              s.pendingAssetRef = null;
              s.pendingRack = null;
            }
            if (t !== 'add-opening') s.pendingOpening = null;
            if (t !== 'add-electrical') s.pendingElectrical = null;
            if (t !== 'calibrate') s.calibration = null;
            if (t !== 'trace-room') s.wallDraft = null;
            if (t !== 'draw-room') s.drawLength = '';
            if (t !== 'measure') s.measure = null;
          }),

        measureClick: (p) =>
          setState((s) => {
            const m = s.measure;
            s.measure = m && !m.b ? { a: m.a, b: { x: p.x, y: p.y } } : { a: { x: p.x, y: p.y }, b: null };
          }),

        keepMeasure: () =>
          set((s) => {
            const m = s.measure;
            if (!m?.b || Math.hypot(m.b.x - m.a.x, m.b.y - m.a.y) < 1) return;
            record(s);
            (s.project.dimensions ??= []).push({ id: newId('dim'), a: m.a, b: m.b });
            s.measure = null;
            touch(s.project);
          }),

        removeDimension: (id) =>
          set((s) => {
            const list = s.project.dimensions;
            if (!list?.some((d) => d.id === id)) return;
            record(s);
            s.project.dimensions = list.filter((d) => d.id !== id);
            if (!s.project.dimensions.length) delete s.project.dimensions;
            touch(s.project);
          }),

        clearDimensions: () =>
          set((s) => {
            if (!s.project.dimensions?.length) return;
            record(s);
            delete s.project.dimensions;
            touch(s.project);
          }),

        pickAsset: (assetId) =>
          set((s) => {
            s.pendingAssetRef = assetId;
            s.pendingRack = null;
            s.tool = 'add-inventory';
            s.selection = null;
          }),

        pickElectrical: (kind) =>
          set((s) => {
            s.pendingElectrical = kind;
            s.pendingAssetRef = null;
            s.pendingRack = null;
            s.pendingOpening = null;
            s.tool = 'add-electrical';
            s.selection = null;
          }),

        pickOpening: (kind) =>
          set((s) => {
            if (layoutBlocked(s)) return;
            s.pendingOpening = kind;
            s.pendingAssetRef = null;
            s.tool = 'add-opening';
            s.selection = null;
          }),

        addOpeningAt: (p) =>
          set((s) => {
            const room = s.project.room;
            const kind = s.pendingOpening;
            if (!kind || layoutBlocked(s)) return;
            const t = openingType(kind);
            const where = room?.closed ? placeOpening(room, p, t.width, openingReach(s.view.zoom)) : null;
            if (!room || !where?.ok) {
              s.notice = info(
                !room?.closed
                  ? 'Draw and close the room first — doors and windows go in its walls.'
                  : where && !where.ok && where.reason === 'full'
                    ? `No room for a ${formatMm(t.width)} ${t.name.toLowerCase()} on wall ${where.index! + 1}. Move or narrow what is there, or pick another wall.`
                    : `Click on a wall to place the ${t.name.toLowerCase()}.`,
              );
              return;
            }
            record(s);
            const id = newOpening(room, kind, where.cornerId, where.offset);
            s.selection = { kind: 'opening', id };
            s.tool = 'select';
            s.pendingOpening = null;
            s.notice = null;
            touch(s.project);
          }),

        addOpeningOnWall: (index, kind) =>
          set((s) => {
            const room = s.project.room;
            const w = room ? wallFrame(room, index) : null;
            if (!room || !w || layoutBlocked(s)) return;
            const t = openingType(kind);
            const offset = fitOpening(room, index, t.width, w.length / 2);
            if (offset === null) {
              s.notice = info(`No room for a ${formatMm(t.width)} ${t.name.toLowerCase()} on wall ${index + 1}.`);
              return;
            }
            record(s);
            const id = newOpening(room, kind, room.corners[index]!.id, offset);
            s.selection = { kind: 'opening', id };
            s.notice = null;
            touch(s.project);
          }),

        updateOpening: (id, patch) =>
          set((s) => {
            const room = s.project.room;
            const o = room?.openings.find((x) => x.id === id);
            if (!room || !o || layoutBlocked(s)) return;
            record(s);
            Object.assign(o, patch);
            o.width = mm(Math.max(MIN_OPENING_WIDTH, o.width));
            if (o.sillHeight >= o.height) o.sillHeight = mm(Math.max(0, o.height - 100));
            const index = room.corners.findIndex((c) => c.id === o.wallStartCornerId);
            // Keep it clear of the corners and the other openings: slide it
            // if that is enough, otherwise make it as wide as the gap allows.
            let offset = fitOpening(room, index, o.width, o.offset, o.id);
            if (offset === null) {
              const gap = stretchAround(room, index, o.offset, o.id);
              if (gap && gap[1] - gap[0] >= MIN_OPENING_WIDTH) {
                o.width = mm(Math.floor(gap[1] - gap[0]));
                offset = (gap[0] + gap[1]) / 2;
                s.notice = info(`Narrowed to ${formatMm(o.width)}: that is all the room there is on this wall.`);
              }
            }
            if (offset !== null) o.offset = offset as Mm;
            touch(s.project);
          }),

        moveOpening: (id, p, grab = 0) =>
          set((s) => {
            const room = s.project.room;
            const o = room?.openings.find((x) => x.id === id);
            if (!room || !o || layoutBlocked(s)) return;
            // Stay on the current wall while the pointer is near it, so it
            // doesn't jump to the next wall when dragged towards a corner.
            const current = room.corners.findIndex((c) => c.id === o.wallStartCornerId);
            const onCurrent = projectOnWall(room, current, p);
            let index: number;
            let want: number;
            if (onCurrent && onCurrent.distance <= openingReach(s.view.zoom)) {
              index = current;
              want = onCurrent.along + grab;
            } else {
              const hit = nearestWall(room, p);
              if (!hit) return;
              index = hit.index;
              want = hit.along;
            }
            const offset = fitOpening(room, index, o.width, want, o.id);
            if (offset === null) return; // no room there: it stays where it was
            record(s);
            o.wallStartCornerId = room.corners[index]!.id;
            o.offset = offset as Mm;
            touch(s.project);
          }),

        resizeOpening: (id, end, p) =>
          set((s) => {
            const room = s.project.room;
            const o = room?.openings.find((x) => x.id === id);
            const span = room && o ? openingSpan(room, o) : null;
            if (!room || !o || !span || layoutBlocked(s)) return;
            const hit = projectOnWall(room, span.index, p);
            const gap = stretchAround(room, span.index, span.offset, o.id);
            if (!hit || !gap) return;
            const dir = end === 'end' ? 1 : -1;
            const fixed = span.offset - (dir * span.width) / 2;
            let edge = Math.max(gap[0], Math.min(gap[1], hit.along));
            if ((edge - fixed) * dir < MIN_OPENING_WIDTH) edge = fixed + dir * MIN_OPENING_WIDTH;
            const width = Math.round(Math.abs(edge - fixed) / 10) * 10;
            if (width === o.width) return;
            record(s);
            o.width = mm(width);
            o.offset = (fixed + (dir * width) / 2) as Mm;
            touch(s.project);
          }),

        addElectricalAt: (p) =>
          set((s) => {
            const kind = s.pendingElectrical;
            if (!kind) return;
            const t = electricalType(kind);
            const room = s.project.room;
            let point: ElectricalPoint | null = null;
            const id = newId('el');
            if (t.mount === 'floor') {
              const at = maybeSnap(s.view, p);
              point = { id, kind, position: { x: at.x as Mm, y: at.y as Mm }, height: mm(0) };
            } else {
              const anchor = room ? wallAnchorAt(room, p, openingReach(s.view.zoom)) : null;
              if (!anchor) {
                s.notice = info(
                  room?.closed
                    ? `Click on a wall to place the ${t.name.toLowerCase()}.`
                    : 'Draw and close the room first — wall points go on its walls.',
                );
                return;
              }
              point = { id, kind, ...anchor, height: mm(t.height) };
            }
            record(s);
            (s.project.electrical ??= []).push(point);
            s.selection = { kind: 'electrical', id };
            s.tool = 'select';
            s.pendingElectrical = null;
            s.notice = null;
            touch(s.project);
          }),

        updateElectrical: (id, patch) =>
          set((s) => {
            const e = s.project.electrical?.find((x) => x.id === id);
            if (!e) return;
            record(s);
            const wasFloor = electricalType(e.kind).mount === 'floor';
            Object.assign(e, patch);
            const isFloor = electricalType(e.kind).mount === 'floor';
            // Changing between a wall point and a floor box moves it accordingly.
            if (isFloor !== wasFloor) {
              const a = electricalAnchor(s.project.room, { ...e, position: wasFloor ? e.position : undefined });
              if (isFloor && a) {
                e.position = {
                  x: (a.point.x + a.nx * 300) as Mm,
                  y: (a.point.y + a.ny * 300) as Mm,
                };
                delete e.wallStartCornerId;
                delete e.offset;
                e.height = mm(0);
              } else if (!isFloor && e.position && s.project.room) {
                const anchor = wallAnchorAt(s.project.room, e.position, Infinity);
                if (anchor) {
                  Object.assign(e, anchor);
                  delete e.position;
                  e.height = mm(electricalType(e.kind).height);
                }
              }
            }
            if (e.offset !== undefined && s.project.room && e.wallStartCornerId) {
              const index = s.project.room.corners.findIndex((c) => c.id === e.wallStartCornerId);
              const w = wallFrame(s.project.room, index);
              if (w) e.offset = clampToWall(w.length, s.project.room.wallThickness, e.offset) as Mm;
            }
            touch(s.project);
          }),

        moveElectrical: (id, p) =>
          set((s) => {
            const e = s.project.electrical?.find((x) => x.id === id);
            const room = s.project.room;
            if (!e) return;
            if (e.position) {
              record(s);
              e.position = { x: p.x, y: p.y };
              touch(s.project);
              return;
            }
            if (!room) return;
            // Stay on the current wall while the pointer is near it.
            const current = room.corners.findIndex((c) => c.id === e.wallStartCornerId);
            const onCurrent = projectOnWall(room, current, p);
            const w = wallFrame(room, current);
            let anchor: { wallStartCornerId: string; offset: Mm } | null;
            if (onCurrent && w && onCurrent.distance <= openingReach(s.view.zoom)) {
              anchor = {
                wallStartCornerId: e.wallStartCornerId!,
                offset: Math.round(clampToWall(w.length, room.wallThickness, onCurrent.along)) as Mm,
              };
            } else {
              anchor = wallAnchorAt(room, p, Infinity);
            }
            if (!anchor) return;
            record(s);
            Object.assign(e, anchor);
            touch(s.project);
          }),

        addNoteAt: (p) =>
          set((s) => {
            record(s);
            const id = newId('note');
            (s.project.annotations ??= []).push({ id, position: { x: p.x, y: p.y }, text: '' });
            s.selection = { kind: 'note', id };
            s.tool = 'select';
            touch(s.project);
          }),

        updateNote: (id, patch) =>
          set((s) => {
            const n = s.project.annotations?.find((x) => x.id === id);
            if (!n) return;
            record(s);
            Object.assign(n, patch);
            touch(s.project);
          }),

        toggleNoteArrow: (id) =>
          set((s) => {
            const n = s.project.annotations?.find((x) => x.id === id);
            if (!n) return;
            record(s);
            if (n.target) delete n.target;
            else n.target = { x: (n.position.x + 1000) as Mm, y: (n.position.y - 800) as Mm };
            touch(s.project);
          }),

        setUnderlay: (u) =>
          set((s) => {
            if (!u && !s.project.underlay) return;
            if (s.project.underlay?.pinned) {
              s.notice = sameNotice(s.notice, PLAN_LOCKED_MESSAGE);
              return;
            }
            record(s);
            s.project.underlay = u;
            touch(s.project);
          }),

        updateUnderlay: (patch) =>
          set((s) => {
            const u = s.project.underlay;
            if (!u) return;
            // A locked plan keeps its place and scale; only its look can change.
            const moves = (['position', 'width', 'aspect', 'src', 'calibrated'] as const).some((k) => k in patch);
            if (u.pinned && moves) {
              s.notice = sameNotice(s.notice, PLAN_LOCKED_MESSAGE);
              return;
            }
            record(s);
            Object.assign(u, patch);
            if (patch.position) u.position = { ...patch.position };
            touch(s.project);
          }),

        setUnderlayPinned: (pinned) =>
          set((s) => {
            const u = s.project.underlay;
            if (!u || !!u.pinned === pinned) return;
            record(s);
            if (pinned) {
              u.pinned = true;
              u.locked = true; // stop moving, if it was
              if (s.tool === 'calibrate') {
                s.tool = 'select';
                s.calibration = null;
              }
            } else delete u.pinned;
            s.notice = null;
            touch(s.project);
          }),

        startWallTrace: () =>
          set((s) => {
            if (layoutBlocked(s)) return;
            if (!s.project.underlay?.calibrated) {
              s.notice = info('Set the plan’s scale first, so the walls come out the right size.');
              return;
            }
            s.tool = 'trace-room';
            s.wallDraft = null;
            s.selection = null;
            s.multi = [];
          }),

        setWallDraft: (d) =>
          set((s) => {
            s.wallDraft = d;
          }),

        applyWallDraft: () =>
          set((s) => {
            const d = s.wallDraft;
            if (!d?.points || d.leaked || d.points.length < 3 || layoutBlocked(s)) return;
            record(s);
            const old = s.project.room;
            const thickness = old?.wallThickness ?? mm(120);
            // The draft is the inside of the walls; corners sit on the walls' centre line.
            const corners = outset(d.points, thickness / 2).map((p) => ({
              id: newId('cor'),
              point: { x: Math.round(p.x) as Mm, y: Math.round(p.y) as Mm },
            }));
            s.project.room = {
              id: old?.id ?? newId('room'),
              corners,
              closed: true,
              wallThickness: thickness,
              wallHeight: old?.wallHeight ?? mm(2700),
              openings: [],
            };
            // Points on the old walls have nothing to hang on any more; floor boxes stay.
            if (s.project.electrical) s.project.electrical = s.project.electrical.filter((e) => e.position);
            s.wallDraft = null;
            s.tool = 'select';
            s.selection = { kind: 'room', id: s.project.room.id };
            s.notice = info(`${corners.length} walls drafted from the plan. Drag the corners to adjust, or type exact lengths in the room panel.`);
            touch(s.project);
          }),

        startCalibration: () =>
          set((s) => {
            if (!s.project.underlay) return;
            if (s.project.underlay.pinned) {
              s.notice = sameNotice(s.notice, PLAN_LOCKED_MESSAGE);
              return;
            }
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
            s.multi = [];
            s.highlightedWall = null;
          }),

        toggleSelected: (sel) =>
          set((s) => {
            const current = selectedMembers(s).filter(isGroupable);
            const has = current.some((m) => sameSel(m, sel));
            const next = has ? current.filter((m) => !sameSel(m, sel)) : [...current, sel];
            s.multi = next.length > 1 ? next : [];
            s.selection = has ? (next.at(-1) ?? null) : sel;
            s.highlightedWall = null;
          }),

        selectMany: (sels, add = false) =>
          set((s) => {
            const base = add ? selectedMembers(s).filter(isGroupable) : [];
            const next = [...base, ...sels.filter((x) => !base.some((m) => sameSel(m, x)))];
            s.multi = next.length > 1 ? next : [];
            s.selection = next.at(-1) ?? null;
            s.highlightedWall = null;
          }),

        translateSelected: (dx, dy) =>
          set((s) => {
            if (dx === 0 && dy === 0) return;
            const members = movable(s, selectedMembers(s));
            if (members.length === 0) return;
            record(s);
            for (const m of members) {
              const o =
                m.kind === 'pillar'
                  ? s.project.pillars.find((x) => x.id === m.id)
                  : m.kind === 'inventory'
                    ? s.project.inventory.find((x) => x.id === m.id)
                    : m.kind === 'note'
                      ? s.project.annotations?.find((x) => x.id === m.id)
                      : undefined;
              if (!o) continue;
              o.position = { x: (o.position.x + dx) as Mm, y: (o.position.y + dy) as Mm };
              if ('target' in o && o.target) o.target = { x: (o.target.x + dx) as Mm, y: (o.target.y + dy) as Mm };
            }
            touch(s.project);
          }),

        alignSelected: (mode) =>
          set((s) => {
            const members = selectedMembers(s);
            if (members.length < 2) return;
            record(s);
            const free = new Set(movable(s, members).map((m) => m.id));
            const next = alignPositions(get().project, members, mode);
            applyPositions(s, new Map([...next].filter(([id]) => free.has(id))));
            touch(s.project);
          }),

        distributeSelected: (axis) =>
          set((s) => {
            const members = selectedMembers(s);
            if (members.length < 3) return;
            record(s);
            const free = new Set(movable(s, members).map((m) => m.id));
            const next = distributePositions(get().project, members, axis);
            applyPositions(s, new Map([...next].filter(([id]) => free.has(id))));
            touch(s.project);
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

        setBudget: (eur) =>
          set((s) => {
            const next = eur && eur > 0 ? Math.round(eur) : undefined;
            if (s.project.budgetEur === next) return;
            record(s);
            if (next) s.project.budgetEur = next;
            else delete s.project.budgetEur;
            touch(s.project);
          }),

        addVariant: (mode) =>
          set((s) => {
            if ((s.project.variants?.length ?? 0) >= variants.MAX_VARIANTS) {
              s.notice = info(`Up to ${variants.MAX_VARIANTS} layouts per plan. Delete one to add another.`);
              return;
            }
            record(s);
            variants.addVariant(s.project as Project, mode);
            s.selection = null;
            s.multi = [];
            touch(s.project);
          }),

        proposeLayout: (opts) =>
          set((s) => {
            const current = get().project;
            const result = makeProposal(current, opts);
            if (result.problem) {
              s.notice = { id: ++noticeSeq, tone: 'warning', message: result.problem };
              return;
            }
            if ((s.project.variants?.length ?? 0) >= variants.MAX_VARIANTS) {
              s.notice = info(`Up to ${variants.MAX_VARIANTS} layouts per plan. Delete one to make room for the proposal.`);
              return;
            }
            record(s);
            const base = opts.style === 'brand' ? 'Proposal – brand shop' : 'Proposal – volume shop';
            const taken = new Set((s.project.variants ?? []).map((v) => v.name));
            let name = base;
            for (let n = 2; taken.has(name); n++) name = `${base} ${n}`;
            variants.addVariant(s.project as Project, 'empty', name);
            s.project.inventory = result.inventory;
            s.selection = null;
            s.multi = [];
            s.tool = 'select';
            const floor = result.inventory.filter((i) => !i.modules).length;
            const racks = result.inventory.length - floor;
            s.notice = info(
              `${name}: ${floor} fixtures${racks ? ` and ${racks} wall rack${racks === 1 ? '' : 's'}` : ''}, at least ${Math.round(opts.aisle)} mm apart. Your own layout is unchanged in its tab.`,
            );
            touch(s.project);
          }),

        switchVariant: (id) =>
          setState((s) => {
            if (id === s.project.activeVariantId) return;
            if (!s.readOnly) record(s);
            if (!variants.switchVariant(s.project as Project, id)) return;
            s.selection = null;
            s.multi = [];
            s.pendingAssetRef = null;
            if (s.tool === 'add-inventory') s.tool = 'select';
          }),

        renameVariant: (id, name) =>
          set((s) => {
            const v = s.project.variants?.find((x) => x.id === id);
            if (!v || !name.trim() || v.name === name.trim().slice(0, 60)) return;
            record(s);
            variants.renameVariant(s.project as Project, id, name);
            touch(s.project);
          }),

        deleteVariant: (id) =>
          set((s) => {
            if ((s.project.variants?.length ?? 0) < 2) return;
            record(s);
            variants.deleteVariant(s.project as Project, id);
            s.selection = null;
            s.multi = [];
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
            if (m === '3d' && (s.tool === 'draw-room' || s.tool === 'draw-rect')) s.tool = 'select';
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
            if (layoutBlocked(s)) return;
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
            if (!room || layoutBlocked(s)) return;
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

        addRectRoom: (a, b) =>
          set((s) => {
            if (layoutBlocked(s)) return;
            const p = maybeSnap(s.view, a);
            const q = maybeSnap(s.view, b);
            const x0 = Math.min(p.x, q.x);
            const x1 = Math.max(p.x, q.x);
            const y0 = Math.min(p.y, q.y);
            const y1 = Math.max(p.y, q.y);
            // A click without a real drag makes nothing.
            if (x1 - x0 < 200 || y1 - y0 < 200) return;
            record(s);
            const old = s.project.room;
            const corner = (x: number, y: number) => ({ id: newId('cor'), point: { x: x as Mm, y: y as Mm } });
            s.project.room = {
              id: old?.id ?? newId('room'),
              corners: [corner(x0, y0), corner(x1, y0), corner(x1, y1), corner(x0, y1)],
              closed: true,
              wallThickness: old?.wallThickness ?? mm(120),
              wallHeight: old?.wallHeight ?? mm(2700),
              openings: [],
            };
            // Wall points belonged to the old walls; floor boxes stay.
            if (s.project.electrical) s.project.electrical = s.project.electrical.filter((e) => e.position);
            s.tool = 'select';
            s.selection = { kind: 'room', id: s.project.room.id };
            touch(s.project);
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
            if (!room || layoutBlocked(s)) return;
            const c = room.corners.find((c) => c.id === cornerId);
            if (!c) return;
            record(s);
            const snapped = maybeSnap(s.view, p);
            c.point = { x: snapped.x as Mm, y: snapped.y as Mm };
            touch(s.project);
          }),

        scaleRoomByCorner: (base, cornerId, p) =>
          set((s) => {
            if (!s.project.room || layoutBlocked(s)) return;
            record(s);
            s.project.room = scaleRoom(base, cornerId, p);
            touch(s.project);
          }),

        insertCorner: (afterCornerId, p) =>
          set((s) => {
            const room = s.project.room;
            if (!room || layoutBlocked(s)) return;
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
            if (s.project.electrical) {
              s.project.electrical = reanchorAfterInsert(
                s.project.electrical,
                afterCornerId,
                id,
                Math.hypot(snapped.x - start.x, snapped.y - start.y),
              );
            }
            // Both halves of a split wall keep its height and look.
            const style = room.walls?.[afterCornerId];
            if (style) room.walls![id] = { ...style };
            s.selection = { kind: 'corner', id };
            touch(s.project);
          }),

        deleteCorner: (cornerId) =>
          set((s) => {
            const room = s.project.room;
            if (!room || layoutBlocked(s)) return;
            if (room.corners.length <= 3 && room.closed) return; // refuse to break a triangle
            if (!room.corners.some((c) => c.id === cornerId)) return;
            record(s);
            const before = get().project.room!;
            room.corners = room.corners.filter((c) => c.id !== cornerId);
            if (room.walls?.[cornerId]) delete room.walls[cornerId];
            const after = { ...before, corners: before.corners.filter((c) => c.id !== cornerId) };
            room.openings = reanchorByPosition(before, after);
            if (s.project.electrical) {
              s.project.electrical = reanchorElectrical(get().project.electrical ?? [], before, after);
            }
            if (s.selection?.kind === 'corner' && s.selection.id === cornerId) {
              s.selection = null;
            }
            touch(s.project);
          }),

        updateRoomMeta: (patch) =>
          set((s) => {
            if (!s.project.room || layoutBlocked(s)) return;
            record(s);
            if (patch.wallThickness !== undefined) s.project.room.wallThickness = patch.wallThickness;
            if (patch.wallHeight !== undefined) s.project.room.wallHeight = patch.wallHeight;
            touch(s.project);
          }),

        updateWall: (index, patch) =>
          set((s) => {
            const room = s.project.room;
            const corner = room?.corners[index];
            if (!room || !corner || !wallFrame(room, index) || layoutBlocked(s)) return;
            record(s);
            const walls = (room.walls ??= {});
            const style = { ...walls[corner.id] };
            if (patch.height !== undefined) {
              if (patch.height === null || patch.height === room.wallHeight) delete style.height;
              else style.height = mm(patch.height);
            }
            if (patch.transparent !== undefined) {
              if (patch.transparent) style.transparent = true;
              else delete style.transparent;
            }
            if (Object.keys(style).length) walls[corner.id] = style;
            else delete walls[corner.id];
            touch(s.project);
          }),

        addPillarAt: (p) =>
          set((s) => {
            if (layoutBlocked(s)) return;
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
            const rack = s.pendingRack;
            const item: InventoryItem = rack
              ? {
                  id,
                  type: 'inventory',
                  name: rack.name,
                  category: RACK_CATEGORY,
                  modules: [...rack.modules],
                  position: { x: snapped.x as Mm, y: snapped.y as Mm },
                  size: rackSize(rack.modules),
                  rotation: rad(0),
                }
              : asset
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
            if (itemMount(item) === 'wall' && opts?.wallSnap !== false && s.project.room) {
              // Snap from the raw click so grid rounding can't push it out of reach.
              const hit = snapToWall(s.project.room, p, item.size.depth);
              if (hit) {
                item.position = hit.position;
                item.rotation = hit.rotation;
              }
            } else if (opts?.wallSnap !== false && s.project.room?.closed) {
              // Free-standing: placed close to a wall, it stands flush against it.
              const inner = innerOutline(s.project.room);
              if (inner) item.position = pushToWalls(inner, item.position, item.size, item.rotation, 12 / s.view.zoom).position;
            }
            s.project.inventory.push(item);
            s.notice = asset?.minWallHeight
              ? mountingNotice(asset.name, asset.mountHeight, asset.minWallHeight, s.project.room, item.position)
              : null;
            s.selection = { kind: 'inventory', id };
            s.tool = 'select';
            s.pendingAssetRef = null;
            s.pendingRack = null;
            touch(s.project);
          }),

        updatePillar: (id, patch) =>
          set((s) => {
            const p = s.project.pillars.find((x) => x.id === id);
            if (!p || layoutBlocked(s)) return;
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
            // A locked fixture keeps its place, turn, size and units; its name may change.
            const moves = (['position', 'rotation', 'size', 'modules', 'assetRef'] as const).some((k) => k in patch);
            if (moves && itemBlocked(s, it)) return;
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
            if (!it || itemBlocked(s, it)) return;
            record(s);
            const hit =
              itemMount(it) === 'wall' && opts?.wallSnap !== false && s.project.room
                ? snapToWall(s.project.room, p, it.size.depth)
                : null;
            let guides: SnapGuide[] = [];
            if (hit) {
              it.position = hit.position;
              it.rotation = hit.rotation;
            } else if (opts?.objectSnap !== false && squareAngle(it.rotation)) {
              const others = [
                ...s.project.inventory.filter((x) => x.id !== id && squareAngle(x.rotation)),
                ...s.project.pillars.filter((x) => squareAngle(x.rotation)),
              ].map((o) => boxOf(rectCorners(o.position, o.size, o.rotation)));
              const box = boxOf(rectCorners(p, it.size, it.rotation));
              // About 10 px on screen, whatever the zoom.
              const r = snapToObjects(p, box, others, 10 / s.view.zoom, s.project.minAisle ?? DEFAULT_MIN_AISLE);
              it.position = r.position;
              guides = r.guides;
              // Near a wall (or pushed into it): flush against it, never through it.
              const inner = s.project.room?.closed ? innerOutline(s.project.room) : null;
              if (inner && opts?.wallSnap !== false) {
                const w = pushToWalls(inner, it.position, it.size, it.rotation, 12 / s.view.zoom);
                if (w.position.x !== it.position.x || w.position.y !== it.position.y) {
                  it.position = w.position;
                  // Keep only the alignments that still hold exactly.
                  guides = snapToObjects(w.position, boxOf(rectCorners(w.position, it.size, it.rotation)), others, 0.5, s.project.minAisle ?? DEFAULT_MIN_AISLE).guides;
                }
              }
            } else {
              it.position = { x: p.x, y: p.y };
              const inner = s.project.room?.closed ? innerOutline(s.project.room) : null;
              if (inner && opts?.wallSnap !== false && opts?.objectSnap !== false) {
                it.position = pushToWalls(inner, it.position, it.size, it.rotation, 12 / s.view.zoom).position;
              }
            }
            if (guides.length || s.snapGuides.length) s.snapGuides = guides;
            touch(s.project);
          }),

        clearSnapGuides: () =>
          setState((s) => {
            if (s.snapGuides.length) s.snapGuides = [];
          }),

        rotateSelected: (delta) =>
          set((s) => {
            const sel = s.selection;
            if (!sel) return;
            const all = selectedMembers(s);
            if (all.length > 1) {
              const members = movable(s, all);
              if (members.length === 0) return;
              record(s);
              const next = rotatePositions(get().project, members, delta);
              for (const m of members) {
                const r = next.get(m.id);
                if (!r) continue;
                if (m.kind === 'note') {
                  applyPositions(s, new Map([[m.id, r.position]]));
                  continue;
                }
                const o =
                  m.kind === 'pillar'
                    ? s.project.pillars.find((x) => x.id === m.id)
                    : s.project.inventory.find((x) => x.id === m.id);
                if (!o) continue;
                o.position = r.position;
                o.rotation = r.rotation;
              }
              touch(s.project);
              return;
            }
            if (sel.kind === 'opening') {
              const o = s.project.room?.openings.find((x) => x.id === sel.id);
              if (!o || (o.kind !== 'door' && o.kind !== 'double-door') || layoutBlocked(s)) return;
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
            if (sel.kind === 'pillar' ? layoutBlocked(s) : itemBlocked(s, target as InventoryItem)) return;
            record(s);
            target.rotation = normalizeAngle(target.rotation + delta);
            touch(s.project);
          }),

        copySelected: () =>
          setState((s) => {
            const members = selectedMembers(s);
            if (!members.length) return;
            const ids = (k: string) => new Set(members.filter((m) => m.kind === k).map((m) => m.id));
            const inv = ids('inventory');
            const pil = ids('pillar');
            const notes = ids('note');
            const clip = makeClip(
              s.project.inventory.filter((x) => inv.has(x.id)),
              s.project.pillars.filter((x) => pil.has(x.id)),
              (s.project.annotations ?? []).filter((x) => notes.has(x.id)),
            );
            if (!clip) return;
            const n = clipCount(clip);
            s.notice = writeClip(clip)
              ? info(`Copied ${n === 1 ? '1 item' : `${n} items`}. Paste with Ctrl+V — in this plan, another layout or another plan.`)
              : info('Could not copy: this browser does not allow storing it.');
          }),

        pasteClip: (at) =>
          set((s) => {
            const clip = readClip();
            if (!clip || !clipCount(clip)) {
              s.notice = info('Nothing to paste yet. Select fixtures and press Ctrl+C first.');
              return;
            }
            const placed = placeClip(clip, at);
            // Pillars are part of the floor layout: they stay out while it is locked.
            const pillars = s.project.layoutLocked ? [] : placed.pillars;
            if (!placed.inventory.length && !pillars.length && !placed.notes.length) {
              s.notice = info('The floor layout is locked, so the pillars were not pasted.');
              return;
            }
            record(s);
            s.project.inventory.push(...placed.inventory);
            s.project.pillars.push(...pillars);
            if (placed.notes.length) (s.project.annotations ??= []).push(...placed.notes);
            const pasted: Selection[] = [
              ...placed.inventory.map((x) => ({ kind: 'inventory' as const, id: x.id })),
              ...pillars.map((x) => ({ kind: 'pillar' as const, id: x.id })),
              ...placed.notes.map((x) => ({ kind: 'note' as const, id: x.id })),
            ];
            s.multi = pasted.length > 1 ? pasted : [];
            s.selection = pasted.at(-1) ?? null;
            if (s.tool !== 'select') s.tool = 'select';
            const n = pasted.length;
            s.notice = info(
              `Pasted ${n === 1 ? '1 item' : `${n} items`}.${pillars.length < placed.pillars.length ? ' Pillars were left out: the floor layout is locked.' : ''}`,
            );
            touch(s.project);
          }),

        duplicateSelected: () =>
          set((s) => {
            const sel = s.selection;
            if (!sel) return;
            const offset = mm(300) as number;
            const members = selectedMembers(s);
            if (members.length > 1) {
              record(s);
              const copies: Selection[] = [];
              const shift = (p: Point): Point => ({ x: (p.x + offset) as Mm, y: (p.y + offset) as Mm });
              for (const m of members) {
                if (m.kind === 'pillar') {
                  const o = s.project.pillars.find((x) => x.id === m.id);
                  if (!o || s.project.layoutLocked) continue;
                  const id = newId('pil');
                  s.project.pillars.push({ ...o, id, position: shift(o.position), size: { ...o.size } });
                  copies.push({ kind: 'pillar', id });
                } else if (m.kind === 'inventory') {
                  const o = s.project.inventory.find((x) => x.id === m.id);
                  if (!o) continue;
                  const id = newId('inv');
                  s.project.inventory.push({
                    ...o,
                    id,
                    position: shift(o.position),
                    size: { ...o.size },
                    ...(o.modules ? { modules: [...o.modules] } : {}),
                    ...(o.accessories ? { accessories: copyAccessories(o.accessories) } : {}),
                    locked: undefined,
                  });
                  copies.push({ kind: 'inventory', id });
                } else if (m.kind === 'note') {
                  const o = s.project.annotations?.find((x) => x.id === m.id);
                  if (!o) continue;
                  const id = newId('note');
                  s.project.annotations!.push({
                    ...o,
                    id,
                    position: shift(o.position),
                    ...(o.target ? { target: shift(o.target) } : {}),
                  });
                  copies.push({ kind: 'note', id });
                }
              }
              s.multi = copies.length > 1 ? copies : [];
              s.selection = copies.at(-1) ?? null;
              touch(s.project);
              return;
            }
            if (sel.kind === 'pillar') {
              const orig = s.project.pillars.find((x) => x.id === sel.id);
              if (!orig || layoutBlocked(s)) return;
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
                ...(orig.modules ? { modules: [...orig.modules] } : {}),
                ...(orig.accessories ? { accessories: copyAccessories(orig.accessories) } : {}),
                locked: undefined,
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
          const members = selectedMembers(get());
          if (members.length > 1) {
            set((s) => {
              const free = movable(s, members);
              if (free.length === 0) return;
              record(s);
              const gone = (kind: string) => new Set(free.filter((m) => m.kind === kind).map((m) => m.id));
              const pillars = gone('pillar');
              const items = gone('inventory');
              const notes = gone('note');
              s.project.pillars = s.project.pillars.filter((x) => !pillars.has(x.id));
              s.project.inventory = s.project.inventory.filter((x) => !items.has(x.id));
              if (s.project.annotations) s.project.annotations = s.project.annotations.filter((x) => !notes.has(x.id));
              const kept = members.filter((m) => !free.includes(m));
              s.multi = kept.length > 1 ? kept : [];
              s.selection = kept.at(-1) ?? null;
              touch(s.project);
            });
            return;
          }
          if (sel.kind === 'corner') {
            get().deleteCorner(sel.id);
            return;
          }
          set((s) => {
            if (sel.kind === 'pillar') {
              if (!s.project.pillars.some((x) => x.id === sel.id) || layoutBlocked(s)) return;
              record(s);
              s.project.pillars = s.project.pillars.filter((x) => x.id !== sel.id);
            } else if (sel.kind === 'inventory') {
              const it = s.project.inventory.find((x) => x.id === sel.id);
              if (!it || itemBlocked(s, it)) return;
              record(s);
              s.project.inventory = s.project.inventory.filter((x) => x.id !== sel.id);
            } else if (sel.kind === 'opening') {
              const room = s.project.room;
              if (!room?.openings.some((x) => x.id === sel.id) || layoutBlocked(s)) return;
              record(s);
              room.openings = room.openings.filter((x) => x.id !== sel.id);
            } else if (sel.kind === 'electrical') {
              if (!s.project.electrical?.some((x) => x.id === sel.id)) return;
              record(s);
              s.project.electrical = s.project.electrical.filter((x) => x.id !== sel.id);
            } else if (sel.kind === 'note') {
              if (!s.project.annotations?.some((x) => x.id === sel.id)) return;
              record(s);
              s.project.annotations = s.project.annotations.filter((x) => x.id !== sel.id);
            } else {
              return;
            }
            s.selection = null;
            touch(s.project);
          });
        },

        setLayoutLocked: (locked) =>
          set((s) => {
            if (!!s.project.layoutLocked === locked) return;
            record(s);
            if (locked) s.project.layoutLocked = true;
            else delete s.project.layoutLocked;
            // Put down anything that would change the layout.
            if (locked && (s.tool === 'draw-room' || s.tool === 'add-pillar' || s.tool === 'add-opening')) {
              s.tool = 'select';
              s.pendingOpening = null;
              s.drawLength = '';
            }
            s.notice = locked
              ? info('Floor layout locked: walls, doors, windows and pillars stay put. Fixtures still move.')
              : null;
            touch(s.project);
          }),

        setItemsLocked: (ids, locked) =>
          set((s) => {
            const items = s.project.inventory.filter((x) => ids.includes(x.id) && !!x.locked !== locked);
            if (items.length === 0) return;
            record(s);
            for (const it of items) {
              if (locked) it.locked = true;
              else delete it.locked;
            }
            s.notice = null;
            touch(s.project);
          }),

        toggleLockSelected: () => {
          const st = get();
          const ids = selectedMembers(st)
            .filter((m) => m.kind === 'inventory')
            .map((m) => m.id);
          if (ids.length === 0) return;
          const items = st.project.inventory.filter((x) => ids.includes(x.id));
          st.setItemsLocked(ids, !items.every((x) => x.locked));
        },

        explainLock: (sel) =>
          set((s) => {
            if (sel.kind === 'inventory') {
              const it = s.project.inventory.find((x) => x.id === sel.id);
              if (it) itemBlocked(s, it);
            } else if (isLayoutKind(sel.kind)) {
              layoutBlocked(s);
            }
          }),

        addAccessory: (itemId, assetRef, module) =>
          set((s) => {
            const it = s.project.inventory.find((x) => x.id === itemId);
            if (!it || itemBlocked(s, it)) return;
            const host = accessoryHosts(it).find((h) => h.module === module);
            const asset = findAsset(assetRef);
            if (!host || !asset || roomFor(it, host, assetRef) <= 0) return;
            let shelf: number | undefined;
            if (assetRef === TRAY_3X3 || assetRef === TRAY_3X5) {
              const free = freeShelf(it, host, assetRef);
              if (free === null) {
                s.notice = info(`No room for another ${asset.name} on the shelves of ${host.asset.name}.`);
                return;
              }
              shelf = free;
            }
            record(s);
            (it.accessories ??= []).push({
              id: newId('acc'),
              assetRef,
              ...(module !== undefined ? { module } : {}),
              ...(shelf !== undefined ? { shelf } : {}),
            });
            touch(s.project);
          }),

        removeAccessory: (itemId, accessoryId) =>
          set((s) => {
            const it = s.project.inventory.find((x) => x.id === itemId);
            if (!it?.accessories?.some((a) => a.id === accessoryId) || itemBlocked(s, it)) return;
            record(s);
            it.accessories = it.accessories.filter((a) => a.id !== accessoryId);
            if (it.accessories.length === 0) delete it.accessories;
            touch(s.project);
          }),

        setAccessoryShelf: (itemId, accessoryId, shelf) =>
          set((s) => {
            const it = s.project.inventory.find((x) => x.id === itemId);
            const a = it?.accessories?.find((x) => x.id === accessoryId);
            if (!it || !a || (a.shelf ?? 0) === shelf || itemBlocked(s, it)) return;
            const host = accessoryHosts(it).find((h) => h.module === a.module);
            const others = { ...it, accessories: it.accessories!.filter((x) => x.id !== accessoryId) };
            if (!host || freeShelf(others, host, a.assetRef, [shelf]) === null) {
              s.notice = info(`That shelf is full: move or remove a tray there first.`);
              return;
            }
            record(s);
            a.shelf = shelf;
            touch(s.project);
          }),

        openRackBuilder: (editId = null) =>
          setState((s) => {
            s.rackBuilder = { editId };
          }),

        closeRackBuilder: () =>
          setState((s) => {
            s.rackBuilder = null;
          }),

        pickRack: (rack) =>
          set((s) => {
            if (rack.modules.length === 0) return;
            s.pendingRack = { name: rack.name, modules: [...rack.modules] };
            s.pendingAssetRef = null;
            s.pendingOpening = null;
            s.tool = 'add-inventory';
            s.selection = null;
            s.rackBuilder = null;
          }),

        updateRack: (id, rack) =>
          set((s) => {
            const it = s.project.inventory.find((x) => x.id === id);
            if (!it || rack.modules.length === 0 || itemBlocked(s, it)) return;
            record(s);
            const size = rackSize(rack.modules);
            // Keep the back edge where it was (e.g. against its wall): move
            // the centre forward by half the change in depth.
            const grow = (size.depth - it.size.depth) / 2;
            it.position = {
              x: (it.position.x - Math.sin(it.rotation) * grow) as Mm,
              y: (it.position.y + Math.cos(it.rotation) * grow) as Mm,
            };
            it.name = rack.name;
            it.modules = [...rack.modules];
            it.size = size;
            // Accessories stay on their unit if it is still there and still takes them.
            if (it.accessories) {
              const kept = it.accessories.filter((a) => {
                const ref = a.module !== undefined ? rack.modules[a.module] : undefined;
                return !!ref && accessoryOptions(ref).some((o) => o.asset.id === a.assetRef);
              });
              if (kept.length) it.accessories = kept;
              else delete it.accessories;
            }
            s.rackBuilder = null;
            touch(s.project);
          }),

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

        restoreVersion: (data, name) =>
          set((s) => {
            record(s);
            s.project = { ...migrate(data), name };
            touch(s.project);
            s.selection = null;
            s.multi = [];
            s.tool = 'select';
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
