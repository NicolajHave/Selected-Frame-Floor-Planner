# Selected Frame — Shop Planner

Internal MVP planning tool for shop layouts. **2D-first, 3D-ready.**

Draw a shop area as a polygon, place pillars and inventory placeholders,
edit everything, and export structured plan data as JSON. The data model
is built so a 3D view can be added later without schema changes.

> Read [`ARCHITECTURE.md`](./ARCHITECTURE.md) before changing the data
> model or adding a new render adapter.

## Quick start

```bash
npm install
npm run dev
# open http://localhost:3000
```

Other scripts:

```bash
npm run build      # production build
npm run start      # serve the production build
npm run typecheck  # tsc --noEmit
npm run lint       # next lint
```

## Deploy to Vercel

The repo is a stock Next.js 14 app. From the project root:

1. Push to GitHub.
2. Import the repo in Vercel — accept the defaults; no env vars needed.
3. Deploy.

## How it works

- **Top bar** — brand slot, project name, file actions (New/Save/Load/Export),
  tool buttons (Select / Draw area / + Pillar / + Inventory),
  view toggles (Grid / Snap / Fit to plan), and a 2D / 3D toggle stub.
- **Canvas** — SVG editor with pan, cursor-anchored zoom, two-tier grid,
  and live measurements (wall lengths, corner angles, total area).
- **Right panel** — selection-driven property forms for the room,
  individual corners, pillars, and inventory items.

### Key shortcuts

| Action                  | Shortcut          |
| ----------------------- | ----------------- |
| Cancel tool / clear sel | `Esc`             |
| Finish drawing room     | `Esc` (≥ 3 corners) |
| Delete selected         | `Delete` / `Backspace` |
| Duplicate selected      | `Cmd/Ctrl + D`    |
| Save project            | `Cmd/Ctrl + S`    |

### Drawing a room

1. Click **Draw area** in the top bar.
2. Click on the canvas to drop corners.
3. Click the first corner (or press `Esc`) once you have at least three.

After closing, hover an edge to insert a corner mid-edge, drag any
corner handle to move it, or click the room body to edit wall thickness
/ height in the right panel.

## File formats

Two distinct outputs:

- **Save** (`*.sf.json`) — raw `Project` for round-tripping into the
  app via **Load**.
- **Export** (`*.export.json`) — `ExportPayload` containing the
  `Project` plus precomputed `derived` metrics (wall lengths, corner
  angles, area) and an `exportedAt` timestamp. This is the format
  downstream consumers (3D viewer, quote engine) should read.

Both are versioned with `schemaVersion` (`Project.schemaVersion`).
Migrations live in `src/lib/schema.ts`.

## Folder structure

```
app/                        # Next.js App Router shell
src/
├── model/                  # Pure types (mm, geometry, objects, project)
├── geometry/               # Pure functions (area, walls, corners, snap…)
├── store/                  # Zustand store + memoized selectors
├── render/
│   ├── svg/                # MVP 2D renderer (Canvas, Room, Pillar, …)
│   └── three/              # Stub for the future 3D adapter (README only)
├── components/
│   ├── editor/             # PlannerShell, ToolOverlay
│   ├── topbar/             # TopBar
│   ├── panels/             # RightPanel + property forms
│   └── ui/                 # Button, NumberField, TextField, Section
├── hooks/                  # useKeyboard, useFileIO, usePanZoom
└── lib/                    # id, io, schema
```

## Design language

The palette and typography aim for "calm, architectural, precise":

- **Wall** — soft warm off-white, NCS S 1005-G30Y inspired.
- **Sage** — muted green accent, NCS S 2010-G20Y inspired.
- **Ink** — charcoal for lines, text, handles.
- Display: **Fraunces** (italic optical-size axis). Body: **Inter**.

## Roadmap (post-MVP)

- 3D view via `react-three-fiber`, behind the existing 2D / 3D toggle.
  All extrusion data (`wallThickness`, `wallHeight`, object `height`)
  is already on the model.
- Replace inventory placeholders with SVG / GLTF assets via `assetRef`.
- Snapping: edge / midpoint / object-edge alignment.
- Inventory library + categories.
- Backend persistence and multi-user.
- Quote / PDF export pipeline reading `ExportPayload`.

## Non-goals (MVP)

3D editor, quotes, PDFs, auth, backend, full catalog, advanced snapping.
Each is unblocked by the architecture in `ARCHITECTURE.md`.
