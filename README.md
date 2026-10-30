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
   wall absorbs the change. **Click a wall** to give it its own height,
   make it **transparent** (glass or an open side: dashed on the plan,
   see-through in 3D) or add a door or window to it. Double-click a wall
   to add a corner there.
4. **Doors & windows**: pick one in the library and click a wall — a
   preview shows where it goes. Openings stay clear of corners and of
   each other. Drag one along its wall (or onto another), drag its
   square ends to change the width, and set height, sill (windows),
   hinge and swing in the panel.
5. **Wall racks**: **Build a wall rack…** at the top of the library puts
   wall units together side by side with a 3D preview. **Place on plan**
   and click next to a wall: the rack snaps to it as one piece. Select it
   and **Edit rack…** to change its units later; the parts list and PDF
   count each unit.
6. **Electrical & notes** (library): sockets, double sockets, network,
   LED logo power, screens and switches go on a wall at a height you set
   (with a note for the electrician); floor boxes go anywhere on the
   floor. **Note** writes text on the plan, with an arrow if you want
   one. The PDF gets an **Electrical Plan** page (E1, E2… with type,
   wall, height and note), the outlets are drawn into the wall
   elevations at their height, and notes appear on the plan view.
7. **Fixtures**: pick a catalog item and click the floor. Wall units and
   logos snap to the nearest wall (`Alt` places freely); logos hang at
   2.4 m and need walls of at least 2.6 m.
8. **Several at once**: shift-click fixtures, pillars or notes, or
   shift-drag a box on the floor (`⌘A` selects all). Drag one to move
   them all; the panel lines them up (left, centre, right, top, middle,
   bottom), spaces them out evenly, rotates, duplicates or deletes them.
9. **Distances and layout check**: the selected object shows its
   distance to the nearest wall or object in each direction. The panel
   (nothing selected) lists overlaps, objects in walls, blocked doors and
   aisles narrower than the minimum (900 mm by default, editable); they
   are marked on the plan and counted in the footer.
10. **3D View** shows the room with openings and the catalog models;
   objects can be selected, dragged and placed there too. Walls facing
   the camera are cut away so you can always see into the shop.
11. **Parts list** (right panel, nothing selected) totals units, weight,
   hanger capacity and **price** (EUR, with €/m² of floor), and exports a
   CSV for Excel with SKU, unit and total price, price source and
   supplier. Wall rack columns are added automatically: one at each end
   of a run of wall units and one between units. Prices come from
   `src/lib/prices.ts` (the &elements quote; wall units, columns and
   accessories, which the quote prices part by part, from the system
   price list, marked †); a shared view-only link never shows them, and
   the PDF includes them only when you tick **Prices in the parts list**.
12. **PDF** (top bar) exports an A3 presentation: cover, what the concept
   asks of the site plus your notes for this draft, the shop in 3D from
   four sides and as an isometric, the plan to scale (numbered fixtures,
   wall dimensions, title block), an elevation of every wall with a
   height ladder (wall top, fixture tops, logo bottom/top, door heads),
   then the parts list and layout check. For a cloud plan the cover
   carries the shop's **live 3D link** with a QR code: a view-only link
   (the same one on every export) that opens the latest version straight
   in 3D, so a partner or sales rep can walk around the shop while
   reading the PDF.
13. **Cloud plans** (sign in with the same @bestseller.com account as the
    other Selected tools): **Cloud → Save to cloud** keeps the plan in the
    shared database and saves every change automatically. **Share**
    invites colleagues as editors or viewers, or creates a view-only link
    for people without an account (e.g. the store or the installer);
    links can be revoked. If someone else saved a newer version while you
    had unsaved changes, you choose: load theirs, keep yours, or save
    yours as a copy.

The plan autosaves in the browser. **File → Save file copy / Open file**
round-trip a file; **File → Export data** writes the plan plus derived
metrics for other tools.

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
- **PDF** (`*-plan.pdf`) — A3 landscape: cover (live 3D link + QR for
  cloud plans), concept and notes, 3D views, isometric, the plan at the
  largest standard scale that fits (a calibrated underlay is drawn
  faintly), wall elevations with heights, parts list, layout check.

Projects carry `schemaVersion`; `src/lib/schema.ts` validates and
upgrades older files.

## Catalog and 3D models

The SIS catalog lives in `src/lib/assetCatalog.ts` (dimensions, item
numbers, materials, weights, HS codes, hanger counts, mounting). The
models in `public/assets/3d/*.glb` are generated from those dimensions
by `node scripts/generate-assets.mjs`; replace any file with a real CAD
export to upgrade it.

Models are being rebuilt in **Blender** from the catalog renders and the
&elements parts list (profiles, plate thicknesses, materials). Each one is
a script in `scripts/blender/`; build them with Blender as a Python module
(Python 3.11):

    pip install bpy==4.5.14
    python scripts/blender/build.py            # all Blender models → public/assets/3d
    python scripts/blender/build.py --blend    # also .blend files to edit by hand
    python scripts/blender/build.py --preview DIR   # plus a Cycles still per model

`scripts/generate-assets.mjs` skips every item that has a Blender script.

Where the supplier's STEP file exists, the model *is* the STEP: it is
converted with OpenCascade (`scripts/blender/step-to-obj.mjs`, needs
`occt-import-js`) and imported into Blender (`step_models.py`), which
drops bolts and felt pads, merges flat faces and smooths rounded edges.
Variants are derived from it: the 700 racks are the 1400 rack with its
rails 510 mm shorter, the H1700 racks have their posts 200 mm longer, and
the short oak podium is the tall one at 400 mm.

Done so far:
- From STEP: Floor Rack 1400 / 700 / 1400 H1700 / 700 H1700, Tall and
  Short Oak Podium; the three jeans racks are the STEP rack frame with
  shelf sections added
- Modelled (`wall_units.py`, one shared frame with shelves, hanging
  rails, beams, mirror box, jeans unit or screen): all ten wall units

## Design language

Calm, architectural, precise: warm off-white walls (NCS S 1005-G30Y
inspired), a muted sage accent (NCS S 2010-G20Y inspired) and charcoal
ink for lines and text.
