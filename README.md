# Selected Frame — Shop Planner

Internal tool for planning Selected Frame shop layouts in 2D and 3D.

Import the store's floor plan, trace the room with exact wall lengths,
add doors and windows, place fixtures from the SIS catalog, check the
layout and the result in 3D, and export a scaled PDF drawing with parts
list.

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
npm test           # unit + end-to-end tests (run `npm run build` first)
npm run test:unit  # pure TypeScript tests, no browser
npm run test:e2e   # drives the production build in headless Chromium
```

The first e2e run needs a browser: `npx playwright install chromium`.
CI (`.github/workflows/ci.yml`) runs typecheck, unit tests, build and
e2e tests on every pull request and push to `main`.

## Deploy

Vercel deploys `main` to production and every pull request to a preview
URL. No environment variables are needed.

## How it works

1. **Import the plan** (right panel, nothing selected): a PDF (first
   page) or image of the store. Click two ends of a known distance — a
   dimension line or a wall — and type its real length to set the scale.
   Use **Move** to drag the plan, the slider to fade it.
2. **Draw the room**: click **Draw area**, click the first corner, then
   click further corners — or type a length in mm and press `Enter` to
   place the next wall exactly, in the cursor's direction (snapped to
   45°). Close by clicking the first corner or pressing `Esc`.
3. **Fix the walls**: click the room to number its walls and edit each
   length in the panel. The room keeps its shape — the opposite parallel
   wall absorbs the change.
4. **Doors & windows**: pick one at the top of the library and click a
   wall. Drag it along the wall or onto another; set width, height,
   sill, hinge and swing in the panel.
5. **Fixtures**: pick a catalog item and click the floor. Wall units and
   logos snap to the nearest wall (`Alt` places freely); logos hang at
   2.4 m and need walls of at least 2.6 m.
6. **Distances and layout check**: the selected object shows its
   distance to the nearest wall or object in each direction. The panel
   (nothing selected) lists overlaps, objects in walls, blocked doors and
   aisles narrower than the minimum (900 mm by default, editable); they
   are marked on the plan and counted in the footer.
7. **3D View** shows the room with openings and the catalog models;
   objects can be selected, dragged and placed there too.
8. **Parts list** (right panel, nothing selected) totals units, weight
   and hanger capacity, and exports a CSV for Excel.
9. **PDF** (top bar) exports an A3 drawing to scale with numbered
   fixtures, wall dimensions and a title block, followed by the parts
   list and the layout check.

The plan autosaves in the browser. **Save** / **Load** round-trip a file;
**Export** writes the plan plus derived metrics for other tools.

### Shortcuts

| Action                              | Shortcut                 |
| ----------------------------------- | ------------------------ |
| Undo / redo                         | `Cmd/Ctrl + Z` / `Shift + Cmd/Ctrl + Z` |
| Rotate selected ±90°                | `R` / `Shift + R`        |
| Door: flip hinge / swing            | `R` / `Shift + R`        |
| Exact wall length while drawing     | type mm, then `Enter`    |
| Place without wall snapping         | hold `Alt`               |
| Duplicate selected                  | `Cmd/Ctrl + D`           |
| Delete selected                     | `Delete` / `Backspace`   |
| Cancel tool / clear selection       | `Esc`                    |
| Finish drawing room                 | `Esc` (≥ 3 corners)      |
| Save project file                   | `Cmd/Ctrl + S`           |

## File formats

- **Save** (`*.sf.json`) — the raw `Project`, including the plan
  underlay as an embedded image, for round-tripping via **Load**.
- **Export** (`*.export.json`) — `ExportPayload`: the `Project` plus
  derived metrics (wall lengths, corner angles, area) and a timestamp.
- **Parts list** (`*-parts-list.csv`) — semicolon-separated with decimal
  commas, for Excel with Danish regional settings.
- **PDF** (`*-plan.pdf`) — A3 landscape: the plan at the largest
  standard scale that fits (a calibrated underlay is drawn faintly),
  then the parts list, layout check and notes.

Projects carry `schemaVersion`; `src/lib/schema.ts` validates and
upgrades older files.

## Catalog and 3D models

The SIS catalog lives in `src/lib/assetCatalog.ts` (dimensions, item
numbers, materials, weights, HS codes, hanger counts, mounting). The
models in `public/assets/3d/*.glb` are generated from those dimensions
by `node scripts/generate-assets.mjs`; replace any file with a real CAD
export to upgrade it.

## Design language

Calm, architectural, precise: warm off-white walls (NCS S 1005-G30Y
inspired), a muted sage accent (NCS S 2010-G20Y inspired) and charcoal
ink for lines and text.
