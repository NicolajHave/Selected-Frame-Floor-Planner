import { test, expect } from '@playwright/test';
import { elevationShots, overviewShots, projectToPicture, wallHeights, wallLabels } from '@/lib/views';
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
    item('shelves', '105-99-004', 2000, 320, [1506, 517, 2288]),
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
      // Seen from beyond everything in front of the wall, with nothing cut through:
      // the picture starts right at the viewer and reaches through the wall.
      expect(s.shot.kind === 'ortho' && s.shot.near).toBeLessThan(0.1);
    }
    // Wall 1 (y = 0) is seen from the shop's side, from past the far wall at y = 7 m.
    const [w1, w2, w3] = shots;
    expect(w1!.shot.target[2]).toBe(0);
    expect(w1!.shot.position[2]).toBeGreaterThan(7);
    expect(w1!.shot.kind === 'ortho' && w1!.shot.far).toBeGreaterThan(w1!.shot.position[2]);
    // Wall 3 (y = 7 m) from the other side.
    expect(w3!.shot.position[2]).toBeLessThan(0);
    // Wall 2 (x = 10 m) from past the left wall.
    expect(w2!.shot.position[0]).toBeLessThan(0);
  });

  test('an elevation knows what stands at its wall, and what hangs on a wall behind the viewer', () => {
    const rack = (id: string, x: number, y: number, rotation: number): InventoryItem => ({
      ...item(id, '', x, y, [2917, 517, 2288]),
      assetRef: undefined,
      modules: ['105-99-005', '105-99-005'],
      rotation: rotation as Radians,
    });
    const shop: Project = {
      ...project,
      inventory: [
        rack('top', 5000, 60 + 258, 0), // against wall 1, facing into the shop (+y)
        rack('bottom', 5000, 7000 - 60 - 258, Math.PI), // against wall 3, facing −y
        rack('right', 10000 - 60 - 258, 3500, Math.PI / 2), // against wall 2
        item('floor', '105-06-001', 5000, 3500, [1310, 500, 1508]),
        item('logo', '105-13-015', 2000, 70, [1200, 20, 225]), // hangs on wall 1
      ],
    };
    const [w1, w2, w3] = elevationShots(shop, 3);
    // Wall 1: its own rack and logo in full; the rack on the opposite wall has its back to us and is left out.
    expect(w1!.atWall.sort()).toEqual(['logo', 'top']);
    expect(w1!.behindViewer).toEqual(['bottom']);
    // Wall 3: the other way round — rack and logo of wall 1 are behind the viewer.
    expect(w3!.atWall).toEqual(['bottom']);
    expect(w3!.behindViewer.sort()).toEqual(['logo', 'top']);
    // Wall 2: its own rack; those on the side walls are seen end-on and stay in, as does the floor rack.
    expect(w2!.atWall).toEqual(['right']);
    expect(w2!.behindViewer).toEqual([]);
  });

  test('a point in the scene lands where the camera sees it', () => {
    const [w1] = elevationShots(project, 3);
    const f = w1!.frustumMm;
    // An elevation: the wall's middle at the floor, and its top-left corner as seen from the shop.
    const floor = projectToPicture(w1!.shot, 3, [5, 0, 0])!;
    expect(floor.u).toBeCloseTo(0.5, 5);
    expect(floor.v).toBeCloseTo(f.top / (f.top - f.bottom), 5);
    // Looking towards y = 0 from the shop, plan x = 0 is on the left.
    const corner = projectToPicture(w1!.shot, 3, [0, 2.7, 0])!;
    expect(corner.u).toBeCloseTo((-5000 - f.left) / (f.right - f.left), 5);
    expect(corner.v).toBeCloseTo((f.top - 2700) / (f.top - f.bottom), 5);
    // A perspective view: what it looks at is in the middle; what is behind it is nowhere.
    const [front] = overviewShots(project, 1.6);
    const centre = projectToPicture(front!.shot, 1.6, front!.shot.target)!;
    expect(centre.u).toBeCloseTo(0.5, 5);
    expect(centre.v).toBeCloseTo(0.5, 5);
    const behind = front!.shot.position.map((p, i) => p + (p - front!.shot.target[i]!)) as [number, number, number];
    expect(projectToPicture(front!.shot, 1.6, behind)).toBeNull();
  });

  test('the walls are numbered in the 3D pictures as on the plan', () => {
    const views = overviewShots(project, 1.6);
    for (const v of views) {
      const labels = wallLabels(project, v.shot, 1.6);
      expect(labels.map((l) => l.text)).toEqual(['W1', 'W2', 'W3', 'W4']);
      for (const l of labels) {
        expect(l.u).toBeGreaterThan(0);
        expect(l.u).toBeLessThan(1);
        expect(l.v).toBeGreaterThan(0);
        expect(l.v).toBeLessThan(1);
      }
    }
    // From the front (plan bottom): wall 1 is the back wall, tagged above its top;
    // wall 3 is cut away towards the camera, tagged down on the floor line.
    const labels = wallLabels(project, views[0]!.shot, 1.6);
    const at = (text: string) => labels.find((l) => l.text === text)!;
    expect(at('W1').v).toBeLessThan(at('W3').v);
    // Left and right as on the plan.
    expect(at('W4').u).toBeLessThan(at('W2').u);
    expect(wallLabels({ ...project, room: null }, views[0]!.shot, 1.6)).toEqual([]);
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
