# `src/render/three/` — Future 3D adapter

This folder is **intentionally empty** in the MVP. It exists to mark the
boundary that the 3D view will live behind.

## Contract

A 3D adapter should consume the same `Project` slice the SVG canvas
consumes — see `src/store/plannerStore.ts` and the `Project` type in
`src/model/project.ts`. It must not introduce any new domain fields; if
it needs information that isn't there yet, add the field to the model
first so both renderers see it.

## Mapping (planned)

| Domain                       | Three.js                                            |
|------------------------------|-----------------------------------------------------|
| `RoomPolygon.corners`        | `Shape` → `ExtrudeGeometry`, `depth = wallHeight`   |
| Wall segments                | `BoxGeometry(length, wallHeight, wallThickness)`    |
| `Pillar.size` + position     | `BoxGeometry(width, height, depth)` mesh            |
| `InventoryItem.size`         | `BoxGeometry`, swap to GLTF when `assetRef` is set  |
| `ViewState.zoom / pan`       | `OrbitControls`                                     |

## File plan

```
three/
├── ThreeCanvas.tsx          # <Canvas/> from @react-three/fiber
├── scene/
│   ├── Walls.tsx            # extrudes the polygon
│   ├── Pillars.tsx
│   ├── InventoryMeshes.tsx
│   └── Lights.tsx
└── controls/
    └── OrbitView.tsx
```

The top bar already reserves a 2D / 3D view toggle slot.
