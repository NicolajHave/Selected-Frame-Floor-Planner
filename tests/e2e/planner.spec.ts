import fs from 'node:fs';
import { test, expect } from '@playwright/test';
import { deg, drawRoom, openFresh, place, saved, toScreen, trackErrors, type Bounds } from './helpers';

let room: Bounds;
let errors: string[];

test.beforeEach(async ({ page }) => {
  errors = trackErrors(page);
  await openFresh(page);
  room = await drawRoom(page);
});

test.afterEach(() => {
  expect(errors, 'console errors').toEqual([]);
});

test.describe('wall snapping', () => {
  test('wall unit snaps flush to the top wall, back to the wall', async ({ page }) => {
    const wu = await place(page, 'Wall Unit 1400 - Shelves', (room.minX + room.maxX) / 2, room.minY + 400);
    // half wall thickness (60) + half depth (517 / 2)
    expect(wu.position.y).toBeCloseTo(room.minY + 60 + 517 / 2, 0);
    expect(deg(wu.rotation)).toBe(0);
  });

  test('wall unit snaps to the left wall facing into the room', async ({ page }) => {
    const wu = await place(page, 'Wall Unit 700 - Sidehang', room.minX + 300, (room.minY + room.maxY) / 2);
    expect(wu.position.x).toBeCloseTo(room.minX + 60 + 389 / 2, 0);
    expect(deg(wu.rotation)).toBe(270);
  });

  test('Alt places a wall unit freely', async ({ page }) => {
    const wu = await place(page, 'Wall Unit 700 - Sidehang', room.minX + 300, room.maxY - 1500, { alt: true });
    expect(deg(wu.rotation)).toBe(0);
    expect(wu.position.x).toBeGreaterThan(room.minX + 250);
  });

  test('floor items do not snap', async ({ page }) => {
    const rack = await place(page, 'Floor Rack 1400', room.minX + 500, (room.minY + room.maxY) / 2);
    expect(deg(rack.rotation)).toBe(0);
  });
});

test.describe('rotation and history', () => {
  const rackOf = async (page: import('@playwright/test').Page, id: string) =>
    (await saved(page)).inventory.find((i: { id: string }) => i.id === id);

  test('R rotates; undo and redo step through it', async ({ page }) => {
    const { id } = await place(page, 'Floor Rack 1400', (room.minX + room.maxX) / 2, (room.minY + room.maxY) / 2);
    await page.keyboard.press('r');
    expect(deg((await rackOf(page, id)).rotation)).toBe(90);
    await page.keyboard.press('Control+z');
    expect(deg((await rackOf(page, id)).rotation)).toBe(0);
    await page.keyboard.press('Control+Shift+z');
    expect(deg((await rackOf(page, id)).rotation)).toBe(90);
  });

  test('a drag is a single undo step', async ({ page }) => {
    const rack = await place(page, 'Floor Rack 1400', (room.minX + room.maxX) / 2, (room.minY + room.maxY) / 2);
    const s = await toScreen(page, rack.position.x, rack.position.y);
    await page.mouse.move(s.x, s.y);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) await page.mouse.move(s.x + i * 8, s.y + i * 4);
    await page.mouse.up();
    const moved = await rackOf(page, rack.id);
    expect(Math.hypot(moved.position.x - rack.position.x, moved.position.y - rack.position.y)).toBeGreaterThan(500);
    await page.getByRole('button', { name: 'Undo' }).click();
    expect((await rackOf(page, rack.id)).position).toEqual(rack.position);
  });

  test('rotate handle snaps to 15° steps', async ({ page }) => {
    const rack = await place(page, 'Floor Rack 1400', (room.minX + room.maxX) / 2, (room.minY + room.maxY) / 2);
    const s = await toScreen(page, rack.position.x, rack.position.y);
    const handle = page.locator('circle[data-handle="rotate"]');
    await expect(handle).toHaveCount(1);
    const hb = (await handle.boundingBox())!;
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await page.mouse.down();
    await page.mouse.move(s.x - 80, s.y + 40, { steps: 6 });
    await page.mouse.up();
    const r = deg((await rackOf(page, rack.id)).rotation);
    expect(r % 15).toBe(0);
    expect(r).not.toBe(0);
  });
});

test('parts list totals and CSV export', async ({ page }) => {
  await place(page, 'Wall Unit 1400 - Shelves', (room.minX + room.maxX) / 2, room.minY + 400);
  await place(page, 'Wall Unit 700 - Sidehang', room.minX + 300, (room.minY + room.maxY) / 2);
  await place(page, 'Wall Unit 700 - Sidehang', room.minX + 300, room.maxY - 1500, { alt: true });
  await place(page, 'Floor Rack 1400', (room.minX + room.maxX) / 2, (room.minY + room.maxY) / 2);
  await page.keyboard.press('Escape');

  const panel = page.locator('aside').last();
  await expect(panel).toContainText('2×');
  await expect(panel).toContainText('151,4 kg');
  await expect(panel).toContainText('Hanger capacity');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export parts list (CSV)' }).click(),
  ]);
  const csv = fs.readFileSync((await download.path())!, 'utf8');
  expect(csv.startsWith('﻿Item number;Name')).toBe(true);
  expect(csv).toContain('105-99-012;Wall Unit 700 - Sidehang;Wall Units;2');
  // 71,3 + 2 × 31,9 + 16,3 = 151,4 kg; hangers 2 × 13 + 50 = 76
  expect(csv).toMatch(/Total;Untitled plan;;4;;;;;;151,4;;76;/);
});

test.describe('logo mounting', () => {
  test('placing a logo snaps it and states the 2.6 m wall requirement', async ({ page }) => {
    const logo = await place(page, 'Corona Light Logo', (room.minX + room.maxX) / 2, room.minY + 300);
    expect(deg(logo.rotation)).toBe(0);
    expect(logo.position.y).toBeCloseTo(room.minY + 70, 0);
    const note = page.getByRole('status').filter({ hasText: 'Walls must' });
    await expect(note).toContainText('2.4 m');
    await expect(note).toContainText('2.6 m');
    await expect(page.locator('aside').last()).toContainText('at least 2.6 m');
  });

  test('low walls turn the notice into a dismissable warning', async ({ page }) => {
    const empty = await toScreen(page, room.maxX - 700, room.maxY - 700);
    await page.mouse.click(empty.x, empty.y); // select the room
    await page.getByLabel('Wall height').fill('2500');
    await page.getByLabel('Wall height').press('Enter');
    await place(page, 'LED Logo', room.maxX - 2500, room.minY + 300);
    const warning = page.getByRole('alert').filter({ hasText: 'Walls must' });
    await expect(warning).toContainText('only 2.5 m');
    await warning.getByRole('button', { name: 'Dismiss' }).click();
    await expect(warning).toHaveCount(0);
  });
});

test('the plan survives a reload', async ({ page }) => {
  await place(page, 'Floor Rack 1400', (room.minX + room.maxX) / 2, (room.minY + room.maxY) / 2);
  await place(page, 'Tall Oak Podium', room.minX + 1500, room.minY + 1500);
  await page.reload();
  await expect(page.locator('footer')).toContainText(/autosaved/i);
  await expect(page.locator('aside').last()).toContainText('Inventory items');
  expect((await saved(page)).inventory).toHaveLength(2);
  await expect(page.locator('aside').last()).toContainText('Floor Rack 1400');
});
