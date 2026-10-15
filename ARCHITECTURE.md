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
  openings: Opening[];             // doors, passages, windows
}

interface Opening {
  id: string;
  kind: 'door' | 'double-door' | 'opening' | 'window';
  wallStartCornerId: string;       // the wall that starts at this corner
  offset: Mm;                      // wall start → opening centre
  width: Mm;
  height: Mm;                      // top above floor
  sillHeight: Mm;                  // bottom above floor (windows)
  hinge: 'start' | 'end';          // doors
  swing: 'in' | 'out';             // doors
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
  category?: string;
  assetRef?: string;               // SIS catalog id → model, mounting, weight
  position: Point;
  size: Size3D;
  rotation: Radians;
}

interface PlanUnderlay {           // imported PDF page / image to trace
  src: string;                     // JPEG data URL, so files are self-contained
  fileName: string;
  position: Point;                 // top-left, world mm
  width: Mm;                       // height = width * aspect
  aspect: number;
  opacity: number;
  locked: boolean;
  calibrated: boolean;
}

interface ViewState {              // never serialised in export
  zoom: number;                    // pixels per mm
  pan: { x: number; y: number };   // screen px
  showGrid: boolean;
  snapToGrid: boolean;
  gridSize: Mm;                    // 100 default
  viewMode: '2d' | '3d';
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
  underlay?: PlanUnderlay | null;
  minAisle?: Mm;                   // layout check; 900 when absent
  // view is a UI concern — see ViewState — and is excluded from export.
}
```

**Why anchor openings to a corner, not a wall index.** Inserting or
deleting a corner renumbers the walls. A corner id + distance survives
that; `geometry/openings.ts` re-anchors openings when a wall is split or
merged, and clamps them onto the wall when it is shortened.

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
│            | 'add-opening' | 'calibrate'
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
Logos hang with their bottom edge at 2.4 m (`mountHeight`) and need walls
of at least 2.6 m (`minWallHeight`). Placing one raises a notice, which
becomes a warning that stays until dismissed if the room's walls are lower.

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

**Layout check.** `lib/layout.ts` derives everything from the project:
floor obstacles (pillars and inventory taller than 300 mm, not wall-hung),
the room's inner outline (walls' inside faces), door clearance zones, and
from those the issues (overlap, wall, door, aisle) and the distance guides
for the selected object. Nothing is stored; `useLayoutIssues()` memoises
on the project. The PDF export reuses the same functions.

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

## 7. Cloud plans

Plans can be saved to the shared SELECTED Supabase project, next to the
other internal Selected apps, and use the same accounts.

**Database** (`supabase/migrations/*_fp_cloud_projects.sql`): three tables,
`fp_projects` (the plan as JSON plus a `version`), `fp_project_members`
(email + `editor`/`viewer`) and `fp_share_links` (revocable tokens). The
tables have RLS on and no policies or grants: clients cannot touch them.
Everything goes through `fp_*` security-definer functions, each of which
checks the caller's role (`fp_require`) and that they are a confirmed
@bestseller.com account. `fp_get_shared_project(token)` is the only
function open to signed-out visitors. The migration touches nothing
outside its `fp_` objects.

**Client** (`src/lib/cloud/`): `api.ts` wraps the functions; the Supabase
client is loaded on demand and keeps its session under its own storage
key. The store keeps a `cloud` link (project id, version, role, dirty)
next to the autosaved project. `sync.ts` saves 1.5 s after the last edit
with the version it last saw; if the database has a newer version,
`fp_save_project` refuses and the UI offers to load theirs, keep mine
(overwrite) or save mine as a copy.

**Read-only** (viewer role or `?share=` link): the store's `set` wrapper
rolls back any change to the project or its history, and the UI hides
editing tools and disables the panels. A shared link never writes to the
visitor's own autosave.

**Tests** use `tests/e2e/fakeCloud.ts`, an in-memory stand-in for the auth
endpoints and the `fp_*` functions with the same rules, wired in with
`page.route`. `openFresh()` blocks all real Supabase traffic, so tests
never reach the shared database.

---

## 8. Testing

`npm test` runs two Playwright projects (see `playwright.config.ts`):

- `tests/unit` — pure functions in `geometry/` and `lib/` (wall snapping,
  wall resizing, openings, parts list / CSV). No browser.
- `tests/e2e` — the production build in headless Chromium, including the
  3D view (WebGL via SwiftShader). Tests read the autosaved project from
  localStorage (`helpers.saved()` flushes the batched autosave first)
  and locate the canvas transform via `g[data-layer="world"]`.

CI runs typecheck, unit tests, build and e2e tests on every pull request
and push to `main`. New features should come with a test in one of the
two folders.

---

## 9. Non-goals (MVP)

Quotes, real-time co-editing, room drawing in 3D.
Each is unblocked by the architecture above; none are built.

Shipped since the original MVP scope: the full SIS catalog with generated
3D models, an interactive 3D view, undo/redo, autosave, wall snapping, a
parts-list export (`lib/partsList.ts`), plan underlays with scale
calibration, exact wall lengths, doors / passages / windows, a layout
check with distance guides (`lib/layout.ts`), and PDF export
(`lib/pdfExport.ts`).
