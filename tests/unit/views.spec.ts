import { test, expect } from '@playwright/test';
import { elevationShots, overviewShots, wallHeights } from '@/lib/views';
import type { Project } from '@/model/project';
import type { InventoryItem, Opening } from '@/model/objects';
import type { Mm, Radians } from '@/model/units';

const P = (x: number, y: number) => ({ x: x as Mm, y: y as Mm });

function item(id: string, assetRef: string, x: number, y: number, [w, d, h]: number[]): InventoryItem {
  return {
    id,
    type: 'inventory',
    name: id,
    assetRef,
    position: P(x, y),
    size: { width: w as Mm, depth: d as Mm, height: h as Mm },
    rotation: 0 as Radians,
  };
}

const door: Opening = {
  id: 'd',
  kind: 'door',
  wallStartCornerId: 'c0',
  offset: 7000 as Mm,
  width: 900 as Mm,
  height: 2100 as Mm,
  sillHeight: 0 as Mm,
  hinge: 'start',
  swing: 'in',
};

// 10 × 7 m; wall 1 runs along the top (y = 0), wall 2 down the right side.
const project: Project = {
  schemaVersion: 1,
  id: 'p',
  name: 'Test',
  createdAt: '',
  updatedAt: '',
  units: 'mm',
  room: {
    id: 'r',
    closed: true,
    wallThickness: 120 as Mm,
    wallHeight: 2700 as Mm,
    corners: [P(0, 0), P(10000, 0), P(10000, 7000), P(0, 7000)].map((point, i) => ({ id: `c${i}`, point })),
    openings: [door],
  },
  pillars: [],
  inventory: [
    item('logo', '105-13-001', 5000, 70, [1200, 20, 225]), // hangs from 2.4 m
    item('shelves', '105-99-004', 2000, 320, [1496, 517, 2288]),
    item('rack', '105-06-001', 5000, 3500, [1310, 500, 1758]), // middle of the room
  ],
};

test.describe('elevation heights', () => {
  test('wall top, fixture tops, logo bottom and door head on the wall they stand against', () => {
    expect(wallHeights(project, 0)).toEqual([2100, 2288, 2400, 2625, 2700]);
    // Nothing stands against the right wall; the rack in the middle counts for no wall.
    expect(wallHeights(project, 1)).toEqual([2700]);
    expect(wallHeights(project, 2)).toEqual([2700]);
  });
});

test.describe('picture cameras', () => {
  test('one square-on elevation per wall, from inside, framing the whole wall', () => {
    const aspect = 3;
    const shots = elevationShots(project, aspect);
    expect(shots.map((s) => s.wallIndex)).toEqual([0, 1, 2, 3]);
    for (const s of shots) {
      const f = s.frustumMm;
      expect((f.right - f.left) / (f.top - f.bottom)).toBeCloseTo(aspect, 5);
      expect(f.left).toBeLessThanOrEqual(-s.length / 2);
      expect(f.right).toBeGreaterThanOrEqual(s.length / 2);
      expect(f.bottom).toBeLessThanOrEqual(0);
      expect(f.top).toBeGreaterThanOrEqual(s.height);
      // Camera inside the room (scene metres: x, z = plan x, y).
      const [x, , z] = s.shot.position;
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(10);
      expect(z).toBeGreaterThan(0);
      expect(z).toBeLessThan(7);
    }
    // Wall 1 is seen from the room side, looking towards y = 0.
    expect(shots[0]!.shot.position[2]).toBeGreaterThan(shots[0]!.shot.target[2]);
  });

  test('four views from outside and above, and an isometric', () => {
    const views = overviewShots(project, 1.6);
    expect(views.map((v) => v.shot.kind)).toEqual(['perspective', 'perspective', 'perspective', 'perspective', 'ortho']);
    for (const v of views.slice(0, 4)) {
      const [x, y, z] = v.shot.position;
      expect(y).toBeGreaterThan(2.7);
      const outside = x < 0 || x > 10 || z < 0 || z > 7;
      expect(outside).toBe(true);
    }
    // Front, right, back, left: each from a different side of the room.
    const [front, right, back, left] = views.map((v) => v.shot.position);
    expect(front![2]).toBeGreaterThan(7);
    expect(right![0]).toBeGreaterThan(10);
    expect(back![2]).toBeLessThan(0);
    expect(left![0]).toBeLessThan(0);
  });

  test('no room, no pictures', () => {
    const empty = { ...project, room: null, inventory: [] };
    expect(overviewShots(empty, 1.6)).toEqual([]);
    expect(elevationShots(empty, 3)).toEqual([]);
  });
});
