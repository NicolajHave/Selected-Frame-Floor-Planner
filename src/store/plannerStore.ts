'use client';

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type {
  Project,
  ViewState,
  ViewMode,
  RoomPolygon,
  Pillar,
  InventoryItem,
  Selection,
  Point,
  Mm,
  Radians,
} from '@/model';
import { mm, rad } from '@/model/units';
import { newId } from '@/lib/id';
import { CURRENT_SCHEMA, migrate } from '@/lib/schema';
import { snapPoint } from '@/geometry/snap';
import { findAsset } from '@/lib/assetCatalog';

export type Tool = 'select' | 'draw-room' | 'add-pillar' | 'add-inventory';

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

  // tool actions
  setTool: (t: Tool) => void;
  setSelection: (s: Selection | null) => void;
  pickAsset: (assetId: string) => void;

  // view actions
  setZoom: (z: number) => void;
  setPan: (x: number, y: number) => void;
  resetView: () => void;
  toggleGrid: () => void;
  toggleSnap: () => void;
  setViewMode: (m: ViewMode) => void;

  // room actions
  startRoom: () => void;
  addCorner: (p: Point) => void;
  closeRoom: () => void;
  moveCorner: (cornerId: string, p: Point) => void;
  insertCorner: (afterCornerId: string, p: Point) => void;
  deleteCorner: (cornerId: string) => void;
  updateRoomMeta: (patch: Partial<Pick<RoomPolygon, 'wallThickness' | 'wallHeight'>>) => void;

  // object actions
  addPillarAt: (p: Point) => void;
  addInventoryAt: (p: Point) => void;
  updatePillar: (id: string, patch: Partial<Pillar>) => void;
  updateInventory: (id: string, patch: Partial<InventoryItem>) => void;
  duplicateSelected: () => void;
  deleteSelected: () => void;

  // project lifecycle
  newProject: () => void;
  renameProject: (name: string) => void;
  loadProject: (p: unknown) => void;
}

const DEFAULT_VIEW: ViewState = {
  zoom: 0.05, // 1 mm = 0.05 px → 20 mm per pixel; tuned for ~10 m rooms
  pan: { x: 0, y: 0 },
  showGrid: true,
  snapToGrid: true,
  gridSize: mm(100),
  viewMode: '2d',
};

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

function maybeSnap(view: ViewState, p: Point): Point {
  return view.snapToGrid ? snapPoint(p, view.gridSize) : p;
}

function touch(p: Project): void {
  p.updatedAt = new Date().toISOString();
}

export const usePlannerStore = create<PlannerState>()(
  immer((set, get) => ({
    project: makeProject(),
    view: { ...DEFAULT_VIEW },
    tool: 'select',
    selection: null,
    pendingAssetRef: null,

    setTool: (t) =>
      set((s) => {
        s.tool = t;
        // Tool change clears any in-progress selection that no longer applies.
        if (t !== 'select') s.selection = null;
        // Switching away from add-inventory abandons a pending asset pick.
        if (t !== 'add-inventory') s.pendingAssetRef = null;
      }),

    pickAsset: (assetId) =>
      set((s) => {
        s.pendingAssetRef = assetId;
        s.tool = 'add-inventory';
        s.selection = null;
      }),

    setSelection: (sel) =>
      set((s) => {
        s.selection = sel;
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
    setViewMode: (m) =>
      set((s) => {
        s.view.viewMode = m;
        // 3D is read-only; drop any armed placement tool.
        if (m === '3d') {
          s.tool = 'select';
          s.pendingAssetRef = null;
        }
      }),

    startRoom: () =>
      set((s) => {
        if (!s.project.room) {
          s.project.room = {
            id: newId('room'),
            corners: [],
            closed: false,
            wallThickness: mm(120),
            wallHeight: mm(2700),
          };
        } else {
          // Reset existing room when user explicitly redraws.
          s.project.room.corners = [];
          s.project.room.closed = false;
        }
        s.tool = 'draw-room';
        s.selection = null;
      }),

    addCorner: (p) =>
      set((s) => {
        if (!s.project.room) return;
        if (s.project.room.closed) return;
        const snapped = maybeSnap(s.view, p);
        s.project.room.corners.push({
          id: newId('cor'),
          point: { x: snapped.x as Mm, y: snapped.y as Mm },
        });
        touch(s.project);
      }),

    closeRoom: () =>
      set((s) => {
        if (!s.project.room) return;
        if (s.project.room.corners.length < 3) return;
        s.project.room.closed = true;
        s.tool = 'select';
        touch(s.project);
      }),

    moveCorner: (cornerId, p) =>
      set((s) => {
        const room = s.project.room;
        if (!room) return;
        const c = room.corners.find((c) => c.id === cornerId);
        if (!c) return;
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
        const snapped = maybeSnap(s.view, p);
        room.corners.splice(idx + 1, 0, {
          id: newId('cor'),
          point: { x: snapped.x as Mm, y: snapped.y as Mm },
        });
        touch(s.project);
      }),

    deleteCorner: (cornerId) =>
      set((s) => {
        const room = s.project.room;
        if (!room) return;
        if (room.corners.length <= 3 && room.closed) return; // refuse to break a triangle
        room.corners = room.corners.filter((c) => c.id !== cornerId);
        if (s.selection?.kind === 'corner' && s.selection.id === cornerId) {
          s.selection = null;
        }
        touch(s.project);
      }),

    updateRoomMeta: (patch) =>
      set((s) => {
        if (!s.project.room) return;
        if (patch.wallThickness !== undefined) s.project.room.wallThickness = patch.wallThickness;
        if (patch.wallHeight !== undefined) s.project.room.wallHeight = patch.wallHeight;
        touch(s.project);
      }),

    addPillarAt: (p) =>
      set((s) => {
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

    addInventoryAt: (p) =>
      set((s) => {
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
        s.project.inventory.push(item);
        s.selection = { kind: 'inventory', id };
        s.tool = 'select';
        s.pendingAssetRef = null;
        touch(s.project);
      }),

    updatePillar: (id, patch) =>
      set((s) => {
        const p = s.project.pillars.find((x) => x.id === id);
        if (!p) return;
        Object.assign(p, patch);
        if (patch.size) p.size = { ...p.size, ...patch.size };
        if (patch.position) p.position = { ...p.position, ...patch.position };
        touch(s.project);
      }),

    updateInventory: (id, patch) =>
      set((s) => {
        const it = s.project.inventory.find((x) => x.id === id);
        if (!it) return;
        Object.assign(it, patch);
        if (patch.size) it.size = { ...it.size, ...patch.size };
        if (patch.position) it.position = { ...it.position, ...patch.position };
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
          const id = newId('inv');
          s.project.inventory.push({
            ...orig,
            id,
            position: { x: (orig.position.x + offset) as Mm, y: (orig.position.y + offset) as Mm },
            size: { ...orig.size },
          });
          s.selection = { kind: 'inventory', id };
        }
        touch(s.project);
      }),

    deleteSelected: () =>
      set((s) => {
        const sel = s.selection;
        if (!sel) return;
        if (sel.kind === 'pillar') {
          s.project.pillars = s.project.pillars.filter((x) => x.id !== sel.id);
        } else if (sel.kind === 'inventory') {
          s.project.inventory = s.project.inventory.filter((x) => x.id !== sel.id);
        } else if (sel.kind === 'corner') {
          get().deleteCorner(sel.id);
          return;
        }
        s.selection = null;
        touch(s.project);
      }),

    newProject: () =>
      set((s) => {
        s.project = makeProject();
        s.selection = null;
        s.tool = 'select';
      }),

    renameProject: (name) =>
      set((s) => {
        s.project.name = name;
        touch(s.project);
      }),

    loadProject: (raw) =>
      set((s) => {
        const p = migrate(raw);
        s.project = p;
        s.selection = null;
        s.tool = 'select';
      }),
  })),
);

// expose Radians type for callers that need to type-assert
export type { Radians };
