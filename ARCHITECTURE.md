# Selected Frame — Shop Planner

> Internal MVP planning tool. **2D-first, 3D-ready.**

This document is the contract between the MVP code and any future work
(3D view, SVG asset library, quote flow, backend persistence). Read it
before changing the data model or adding a new render adapter.

---

## 1. Folder structure

```
sf-planner/
├── app/                          # Next.js App Router
│   ├── layout.tsx
│   ├── page.tsx                  # mounts <PlannerShell/>
│   └── globals.css               # Tailwind + design tokens
│
├── src/
│   ├── model/                    # Pure types. No React, no Zustand.
│   │   ├── units.ts              # Branded mm type, conversions
│   │   ├── geometry.ts           # Point, WallSegment, Corner
│   │   ├── objects.ts            # Pillar, InventoryItem, RoomPolygon
│   │   ├── project.ts            # Project, ViewState, DerivedMetrics
│   │   └── index.ts
│   │
│   ├── geometry/                 # Pure functions. No React.
│   │   ├── polygon.ts            # area, centroid, point-in-polygon
│   │   ├── walls.ts              # segment lengths
│   │   ├── corners.ts            # interior angles
│   │   ├── insert.ts             # insert point on edge
│   │   ├── transform.ts          # rotate, translate, AABB
│   │   └── snap.ts               # grid snapping
│   │
│   ├── store/                    # Zustand. Holds Project + ViewState only.
│   │   ├── plannerStore.ts
│   │   └── selectors.ts          # derived metrics memoized
│   │
│   ├── render/
│   │   ├── svg/                  # MVP renderer
│   │   │   ├── Canvas.tsx
│   │   │   ├── Grid.tsx
│   │   │   ├── Room.tsx
│   │   │   ├── Pillar.tsx
│   │   │   ├── Inventory.tsx
│   │   │   ├── Handles.tsx
│   │   │   ├── Measurements.tsx
│   │   │   └── viewport.ts       # screen <-> world transforms
│   │   └── three/                # Future 3D. Empty stub + README.
│   │       └── README.md
│   │
│   ├── components/
│   │   ├── editor/               # composes the SVG canvas + tools
│   │   │   ├── PlannerShell.tsx
│   │   │   └── ToolOverlay.tsx
│   │   ├── topbar/
│   │   │   └── TopBar.tsx        # brand slot, file actions, view toggle
│   │   ├── panels/
│   │   │   ├── RightPanel.tsx
│   │   │   ├── EmptySelection.tsx
│   │   │   ├── RoomProperties.tsx
│   │   │   ├── CornerProperties.tsx
│   │   │   ├── PillarProperties.tsx
│   │   │   └── InventoryProperties.tsx
│   │   └── ui/                   # tiny primitives: Button, NumberInput…
│   │
│   ├── hooks/
│   │   ├── usePanZoom.ts
│   │   ├── useKeyboard.ts        # delete, escape, duplicate
│   │   └── useFileIO.ts
│   │
│   └── lib/
│       ├── id.ts                 # nanoid wrapper
│       ├── io.ts                 # JSON save/load/export
│       └── schema.ts             # version + migration stub
│
├── public/
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── postcss.config.js
├── next.config.mjs
└── README.md
```

**Why these boundaries.** `model/` and `geometry/` are framework-free
pure TypeScript. They can be unit-tested without React, reused by a
future Three.js adapter, and shipped to a backend if we ever add one.
`render/` is the only place that knows about pixels.

---

## 2. Data model

All measurements are stored in **millimetres** as a branded `Mm` type.
The renderer converts to screen pixels at the very edge.

```ts
type Mm = number & { readonly __mm: unique symbol };
type Radians = number & { readonly __rad: unique symbol };

interface Point  { x: Mm; y: Mm; }                  // world coords
interface Size3D { width: Mm; depth: Mm; height: Mm; }

interface Corner {
  id: string;
  point: Point;
}

interface WallSegment {            // derived, but we expose the type
  fromCornerId: string;
  toCornerId: string;
  length: Mm;
}

interface RoomPolygon {
  id: string;
  corners: Corner[];               // ordered, closed implicitly
  wallThickness: Mm;               // for 3D extrusion
  wallHeight: Mm;                  // for 3D extrusion
  closed: boolean;
}

type ShapeType = 'rect' | 'round'; // round reserved for later

interface Pillar {
  id: string;
  type: 'pillar';
  position: Point;                 // centre, world coords
  size: Size3D;
  rotation: Radians;
  shape: ShapeType;
}

interface InventoryItem {
  id: string;
  type: 'inventory';
  name: string;                    // user label
  category?: string;               // future: 'frame' | 'shelf' | …
  position: Point;
  size: Size3D;
  rotation: Radians;
  // assetRef?: string;            // future: swap placeholder for SVG/3D
}

interface ViewState {              // never serialised in export
  zoom: number;                    // pixels per mm
  pan: { x: number; y: number };   // screen px
  showGrid: boolean;
  snapToGrid: boolean;
  gridSize: Mm;                    // 100 default
}

interface DerivedMetrics {         // recomputed, never stored
  wallLengths: number[];           // mm, per segment in order
  cornerAngles: number[];          // degrees, per corner in order
  area: number;                    // mm²
}

interface Project {
  schemaVersion: 1;
  id: string;
  name: string;
  createdAt: string;               // ISO
  updatedAt: string;
  units: 'mm';                     // explicit
  room: RoomPolygon | null;
  pillars: Pillar[];
  inventory: InventoryItem[];
  // view is a UI concern — see ViewState — and is excluded from export.
}
```

**Why mm.** Construction practice in DK/SE. Avoids float drift compared
to metres. A single conversion site (`render/svg/viewport.ts`) talks to
pixels.

**Why centre + rotation for objects.** Identical to how Three.js Object3D
handles transforms. Same field set drives both the SVG `<g transform>`
and a future `mesh.position / mesh.rotation`.

**Why store `wallThickness` and `wallHeight` on the room now.** They're
needed for 3D extrusion later but cost nothing in the MVP. Defaulting
them at room creation means no schema migration when the 3D view ships.

---

## 3. Rendering approach

**MVP: SVG.** One `<svg>` with a single `<g transform="translate(px,py) scale(zoom)">`
wrapper. Children draw in **world mm coordinates** — the wrapper handles
pan/zoom. Stroke widths divide by zoom so lines stay 1px on screen at
any zoom level.

Layer order, bottom to top:

1. Grid (HTML `<pattern>`)
2. Room fill + walls
3. Pillars
4. Inventory
5. Measurements (lengths, angles, area)
6. Selection handles (corners, bounding boxes, rotation handle)

**Hit-testing.** Native SVG event delegation. Each shape carries
`data-id` and `data-kind`; one handler on the canvas dispatches to the
store.

**No virtualisation.** Plans have <500 elements; SVG handles this
trivially.

---

## 4. Interaction architecture

State lives in **one Zustand store**:

```
PlannerStore
├── project: Project
├── view:    ViewState
├── tool:    'select' | 'draw-room' | 'add-pillar' | 'add-inventory'
├── selection: { kind, id } | null
├── past / future: Project[]          # undo / redo stacks
└── actions: addCorner, moveCorner, insertCornerOnEdge, closeRoom,
              addPillar, updateObject, moveInventory, rotateSelected,
              duplicate, delete, undo, redo, beginGesture, endGesture, …
```

**History.** Every action that edits the project pushes the previous
`project` onto `past` first (cheap: Immer shares unchanged structure).
Drags wrap their many per-frame updates in `beginGesture` /
`endGesture`, so one drag is one undo step. History is session-only.

**Autosave.** Zustand's `persist` middleware writes `project` (only) to
`localStorage` under `sf-planner:project`. Hydration is deferred to
mount (`PlannerShell`) so prerendered HTML matches the first client
render, and restored data goes through `migrate()` like a loaded file.

**Wall snapping.** Catalog entries with `mount: 'wall'` (wall units,
logos) snap flush to the nearest wall's inner face with their back to
the wall when placed or dragged (`geometry/wallSnap.ts`); Alt opts out.

Actions mutate via Immer (Zustand's `immer` middleware). Components
subscribe to thin selectors. Derived metrics (`wallLengths`,
`cornerAngles`, `area`) are computed in `store/selectors.ts` and
memoised by reference equality on `room.corners`.

**Tools as state, not modes scattered across components.** `tool` drives
the cursor and the `onClick` semantics of the canvas. Switching tools
clears any in-progress drawing.

**Right panel.** Reads `selection` and renders one of:
`EmptySelection`, `RoomProperties`, `CornerProperties`,
`PillarProperties`, `InventoryProperties`. Each panel writes back
through store actions — never mutates objects directly.

Keyboard: `Esc` cancels tool / clears selection, `Delete` removes
selected, `R` / `Shift+R` rotates ±90°, `Cmd/Ctrl+Z` undoes,
`Shift+Cmd/Ctrl+Z` or `Ctrl+Y` redoes, `Cmd/Ctrl+D` duplicates,
`Cmd/Ctrl+S` saves JSON.

---

## 5. 2D → 3D strategy

When the 3D view ships, **no model file changes**. The work is in a new
`src/render/three/` adapter:

| 2D today (SVG)                     | 3D later (react-three-fiber)                 |
|-----------------------------------|----------------------------------------------|
| Room polygon → `<polygon>` fill   | `Shape` + `ExtrudeGeometry` to `wallHeight`  |
| Walls → `<line>` between corners  | Box meshes per segment, thickness × height   |
| Pillar → `<rect transform>`       | `BoxGeometry(width, height, depth)` mesh     |
| Inventory → `<rect>` placeholder  | `BoxGeometry`, swap to GLTF when `assetRef`  |
| Pan/zoom in `viewport.ts`         | `OrbitControls`                              |

A view toggle in the top bar (`2D Plan` / `3D View`) renders
`<SvgCanvas/>` or `<ThreeCanvas/>` from the same `project` slice. Both
adapters are thin — all geometry comes from `geometry/` helpers.

The 3D folder ships in MVP as a stub README so the boundary is visible
in code review.

---

## 6. Phased MVP plan

Implementation order, each phase end-to-end usable:

1. **Scaffold** — Next.js + Tailwind + Zustand + design tokens.
2. **Empty canvas** — pan, zoom, grid, fit-to-view.
3. **Room drawing** — click corners, close polygon, drag corners,
   insert on edge.
4. **Live measurements** — wall lengths, corner angles, total area.
5. **Pillars** — add / move / rotate / resize / delete.
6. **Inventory** — same lifecycle, with name + duplicate.
7. **Right-panel editing** — selection-driven property forms.
8. **File I/O** — save / load / export JSON.
9. **Polish** — keyboard, empty states, brand slot, view-toggle stub.

---

## 7. Non-goals (MVP)

Quotes, PDFs, auth, backend, multi-user sync, room drawing in 3D.
Each is unblocked by the architecture above; none are built.

Shipped since the original MVP scope: the full SIS catalog with generated
3D models, an interactive 3D view, undo/redo, autosave, wall snapping and
a parts-list export (`lib/partsList.ts`).
