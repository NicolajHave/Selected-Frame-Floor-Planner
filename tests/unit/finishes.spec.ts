import { test, expect } from '@playwright/test';
import {
  DEFAULT_FLOOR_COLOR,
  DEFAULT_WALL_COLOR,
  FLOOR_TYPES,
  WALL_COLORS,
  cleanFinish,
  finishInWords,
  isColor,
  overlayFinish,
  resolveFloor,
  roomFloor,
  roomWallColor,
  sameFinish,
  wallColorName,
  wallColorOf,
} from '@/lib/finishes';
import type { RoomPolygon } from '@/model/objects';
import type { Mm } from '@/model/units';

const room = (more: Partial<RoomPolygon> = {}): RoomPolygon => ({
  id: 'r',
  closed: true,
  wallThickness: 120 as Mm,
  wallHeight: 2700 as Mm,
  corners: [[0, 0], [10000, 0], [10000, 7000], [0, 7000]].map(([x, y], i) => ({ id: `c${i}`, point: { x: x as Mm, y: y as Mm } })),
  openings: [],
  ...more,
});

test('a room with nothing chosen has the planner\'s neutral floor and walls', () => {
  const floor = roomFloor(room());
  expect(floor).toMatchObject({ color: DEFAULT_FLOOR_COLOR, label: 'Plain · Neutral', turn: 0 });
  expect(floor.type.kind).toBe('plain');
  expect(roomWallColor(room())).toBe(DEFAULT_WALL_COLOR);
  expect(roomFloor(null).type.kind).toBe('plain');
});

test('a floor is a kind in one of its colours', () => {
  const oak = resolveFloor({ kind: 'wood', tone: 'smoked-oak' });
  expect(oak).toMatchObject({ label: 'Wood · Smoked oak', color: '#8B6B49', turn: 0 });
  // No colour named: the kind's first.
  expect(resolveFloor({ kind: 'tiles' }).label).toBe('Tiles · Light grey');
  // A colour of one's own: the kind's pattern in that colour.
  expect(resolveFloor({ kind: 'linoleum', tone: '#336699' })).toMatchObject({ color: '#336699', tone: null, label: 'Linoleum · #336699' });
  // Planks can be laid the other way; herringbone runs on the diagonal and has no other way.
  expect(resolveFloor({ kind: 'wood', turned: true }).turn).toBe(90);
  expect(resolveFloor({ kind: 'herringbone' }).turn).toBe(45);
  expect(resolveFloor({ kind: 'herringbone', turned: true }).turn).toBe(45);
  expect(resolveFloor({ kind: 'concrete', turned: true }).turn).toBe(0);
});

test('what a newer planner saved and this one does not know falls back to what it does', () => {
  expect(resolveFloor({ kind: 'cork', tone: 'dark' }).label).toBe('Plain · Neutral');
  expect(resolveFloor({ kind: 'wood', tone: 'zebrano' }).label).toBe('Wood · Light oak');
  expect(roomWallColor(room({ finish: { wall: 'purple' } }))).toBe(DEFAULT_WALL_COLOR);
});

test('a wall has the room\'s colour unless it has its own', () => {
  const r = room({ finish: { wall: '#A8B399' }, walls: { c1: { color: '#B76E51' }, c2: { color: 'nonsense' }, c3: { height: 2400 as Mm } } });
  expect(roomWallColor(r)).toBe('#A8B399');
  expect(wallColorOf(r, 0)).toBe('#A8B399');
  expect(wallColorOf(r, 1)).toBe('#B76E51');
  expect(wallColorOf(r, 2)).toBe('#A8B399');
  expect(wallColorOf(r, 3)).toBe('#A8B399');
  expect(wallColorName('#a8b399')).toBe('Sage');
  expect(wallColorName('#123abc')).toBe('#123ABC');
});

test('the lists hold together: every colour is a colour, every name is told apart', () => {
  for (const type of FLOOR_TYPES) {
    expect(type.tones.length).toBeGreaterThan(0);
    expect(new Set(type.tones.map((t) => t.id)).size).toBe(type.tones.length);
    for (const tone of type.tones) expect(isColor(tone.color), `${type.name} ${tone.name}`).toBe(true);
    expect(type.tile).toBeGreaterThan(0);
  }
  expect(new Set(FLOOR_TYPES.map((t) => t.kind)).size).toBe(FLOOR_TYPES.length);
  expect(FLOOR_TYPES.map((t) => t.name)).toEqual(['Plain', 'Wood', 'Herringbone', 'Concrete', 'Tiles', 'Linoleum', 'Terrazzo', 'Carpet']);
  for (const c of WALL_COLORS) expect(isColor(c.color), c.name).toBe(true);
  expect(new Set(WALL_COLORS.map((c) => c.color)).size).toBe(WALL_COLORS.length);
  expect(WALL_COLORS[0]!.color).toBe(DEFAULT_WALL_COLOR);
  expect(isColor('#12345')).toBe(false);
  expect(isColor(undefined)).toBe(false);
});

test('a finish from outside keeps only what a finish may hold', () => {
  expect(cleanFinish({ floor: { kind: 'wood', tone: 'smoked-oak', turned: true, extra: 1 }, wall: '#A8B399', more: 'x' })).toEqual({
    floor: { kind: 'wood', tone: 'smoked-oak', turned: true },
    wall: '#A8B399',
  });
  expect(cleanFinish({ floor: { kind: 'tiles', tone: '#336699', turned: 'yes' } })).toEqual({ floor: { kind: 'tiles', tone: '#336699' } });
  // Nothing of it a finish: nothing.
  expect(cleanFinish({ floor: { kind: 'Wood <script>' }, wall: 'red' })).toBeNull();
  expect(cleanFinish({ floor: { tone: 'grey' } })).toBeNull();
  expect(cleanFinish('wood')).toBeNull();
  expect(cleanFinish(null)).toBeNull();
  expect(cleanFinish({ wall: '#fff' })).toBeNull();
});

test('a visitor\'s choice lies over the plan\'s: what it says wins, the rest is the plan\'s', () => {
  const plan = { floor: { kind: 'concrete', tone: 'grey' }, wall: '#D8D7D3' };
  expect(overlayFinish(plan, { wall: '#B76E51' })).toEqual({ floor: { kind: 'concrete', tone: 'grey' }, wall: '#B76E51' });
  expect(overlayFinish(plan, { floor: { kind: 'plain' } })).toEqual({ floor: { kind: 'plain' }, wall: '#D8D7D3' });
  expect(overlayFinish(plan, null)).toEqual(plan);
  expect(overlayFinish(undefined, { floor: { kind: 'wood' } })).toEqual({ floor: { kind: 'wood' } });
  expect(overlayFinish(undefined, null)).toBeUndefined();
  expect(sameFinish(overlayFinish(plan, { wall: '#D8D7D3' }), plan)).toBe(true);
  expect(sameFinish(overlayFinish(plan, { wall: '#B76E51' }), plan)).toBe(false);
  expect(sameFinish(undefined, null)).toBe(true);
});

test('a finish in words says only what it says', () => {
  expect(finishInWords({ floor: { kind: 'wood', tone: 'smoked-oak' }, wall: '#A8B399' })).toBe('Wood · Smoked oak · walls Sage');
  expect(finishInWords({ wall: '#123abc' })).toBe('walls #123ABC');
  expect(finishInWords({ floor: { kind: 'plain' } })).toBe('Plain · Neutral');
  expect(finishInWords(undefined)).toBe('');
});
