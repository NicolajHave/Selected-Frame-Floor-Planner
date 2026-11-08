import { test, expect } from '@playwright/test';
import {
  activeVariantName,
  addVariant,
  deleteVariant,
  nextVariantName,
  renameVariant,
  switchVariant,
  variantInventory,
  variantList,
  withVariant,
  MAX_VARIANTS,
} from '@/lib/variants';
import type { Project } from '@/model/project';
import type { InventoryItem } from '@/model/objects';
import type { Mm, Radians } from '@/model/units';

const item = (id: string, x = 0): InventoryItem => ({
  id,
  type: 'inventory',
  name: `Rack ${id}`,
  position: { x: x as Mm, y: 0 as Mm },
  size: { width: 1400 as Mm, depth: 500 as Mm, height: 1500 as Mm },
  rotation: 0 as Radians,
  accessories: [{ id: `acc-${id}`, assetRef: 'x' } as never],
});

const project = (inventory: InventoryItem[]): Project => ({
  schemaVersion: 1,
  id: 'p',
  name: 'Shop',
  createdAt: '',
  updatedAt: '',
  units: 'mm',
  room: null,
  pillars: [],
  inventory,
});

test('names run A, B, C and skip names in use', () => {
  expect(nextVariantName([])).toBe('Layout A');
  expect(nextVariantName(['Layout A', 'Layout C'])).toBe('Layout B');
});

test('the first variant turns the current layout into A; a copy gets fresh ids', () => {
  const p = project([item('a1', 100), item('a2', 200)]);
  const b = addVariant(p, 'copy')!;
  expect(variantList(p).map((v) => [v.name, v.active])).toEqual([['Layout A', false], ['Layout B', true]]);
  expect(p.activeVariantId).toBe(b);
  expect(p.inventory.map((i) => i.position.x)).toEqual([100, 200]);
  expect(p.inventory.map((i) => i.id)).not.toContain('a1');
  expect(p.inventory[0]!.accessories![0]!.id).not.toBe('acc-a1');
  // A keeps its own fixtures, untouched.
  const a = p.variants![0]!.id;
  expect(variantInventory(p, a).map((i) => i.id)).toEqual(['a1', 'a2']);
  expect(activeVariantName(p)).toBe('Layout B');
});

test('switching swaps the fixtures in and out; edits stay with their layout', () => {
  const p = project([item('a1')]);
  addVariant(p, 'empty');
  expect(p.inventory).toEqual([]);
  p.inventory.push(item('b1', 999));
  const [a, b] = p.variants!.map((v) => v.id);
  expect(switchVariant(p, a!)).toBe(true);
  expect(p.inventory.map((i) => i.id)).toEqual(['a1']);
  expect(p.variants!.find((v) => v.id === a)!.inventory).toBeUndefined();
  expect(variantInventory(p, b!).map((i) => i.id)).toEqual(['b1']);
  expect(switchVariant(p, a!)).toBe(false); // already showing
  // withVariant shows another layout without changing the plan.
  expect(withVariant(p, b!).inventory.map((i) => i.id)).toEqual(['b1']);
  expect(p.inventory.map((i) => i.id)).toEqual(['a1']);
});

test('rename, delete, and back to a single layout', () => {
  const p = project([item('a1')]);
  addVariant(p, 'copy');
  addVariant(p, 'empty');
  const [a, b, c] = p.variants!.map((v) => v.id);
  expect(renameVariant(p, b!, '  Volume shop ')).toBe(true);
  expect(p.variants![1]!.name).toBe('Volume shop');
  expect(renameVariant(p, b!, '   ')).toBe(false);
  // Deleting the active one (C) shows its neighbour (B).
  expect(deleteVariant(p, c!)).toBe(true);
  expect(p.activeVariantId).toBe(b);
  expect(p.inventory).toHaveLength(1);
  // Down to one: no variants left, its fixtures stay on the plan.
  expect(deleteVariant(p, b!)).toBe(true);
  expect(p.variants).toBeUndefined();
  expect(p.activeVariantId).toBeUndefined();
  expect(p.inventory.map((i) => i.id)).toEqual(['a1']);
  expect(deleteVariant(p, a!)).toBe(false);
});

test('there is a limit to the number of layouts', () => {
  const p = project([]);
  for (let i = 1; i < MAX_VARIANTS; i++) expect(addVariant(p, 'empty')).not.toBeNull();
  expect(p.variants).toHaveLength(MAX_VARIANTS);
  expect(addVariant(p, 'empty')).toBeNull();
});
