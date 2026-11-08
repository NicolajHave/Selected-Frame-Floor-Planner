import { readFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import { drawRoom, openFresh, trackErrors } from './helpers';

async function pose(page: Page) {
  const me = page.getByTestId('walk-me');
  return {
    x: Number(await me.getAttribute('data-x')),
    y: Number(await me.getAttribute('data-y')),
    yaw: Number(await me.getAttribute('data-yaw')),
  };
}

async function open3d(page: Page) {
  await page.getByRole('button', { name: '3D View' }).click();
  await expect(page.locator('canvas')).toBeVisible();
  await page.waitForTimeout(800);
}

test('walk through at eye level: start, walk, turn, stay inside, leave', async ({ page }) => {
  const errors = trackErrors(page);
  await openFresh(page);
  const room = await drawRoom(page);
  await open3d(page);

  await page.getByRole('button', { name: 'Walk through' }).click();
  await expect(page.getByTestId('walk-map')).toBeVisible();
  await expect(page.getByText('W A S D or the arrow keys to walk (Shift: faster)')).toBeVisible();
  const start = await pose(page);
  // No door: the middle of the room, looking along its longer side (x).
  expect(start.x).toBeCloseTo((room.minX + room.maxX) / 2, -2);
  expect(start.yaw).toBe(0);

  // Walk forward for a moment: x grows.
  await page.keyboard.down('w');
  await page.waitForTimeout(700);
  await page.keyboard.up('w');
  await expect.poll(async () => (await pose(page)).x).toBeGreaterThan(start.x + 300);

  // Turn with the arrow keys.
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(400);
  await page.keyboard.up('ArrowRight');
  await expect.poll(async () => (await pose(page)).yaw).toBeGreaterThan(0.3);

  // Run at the wall for a long time: you stop short of it.
  await page.keyboard.down('Shift');
  await page.keyboard.down('w');
  await page.waitForTimeout(3000);
  await page.keyboard.up('w');
  await page.keyboard.up('Shift');
  const p = await pose(page);
  expect(p.x).toBeLessThan(room.maxX);
  expect(p.y).toBeLessThan(room.maxY);
  expect(p.x).toBeGreaterThan(room.minX);
  expect(p.y).toBeGreaterThan(room.minY);

  // Back to the entrance, then out with Esc.
  await page.getByRole('button', { name: 'Entrance' }).click();
  await expect.poll(async () => (await pose(page)).x).toBeCloseTo(start.x, -1);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('walk-map')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Walk through' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('click the map to jump there', async ({ page }) => {
  await openFresh(page);
  await drawRoom(page);
  await open3d(page);
  await page.getByRole('button', { name: 'Walk through' }).click();
  const map = page.getByTestId('walk-map');
  const b = (await map.boundingBox())!;
  const before = await pose(page);
  await page.mouse.click(b.x + b.width * 0.25, b.y + b.height * 0.3);
  await expect.poll(async () => (await pose(page)).x).toBeLessThan(before.x - 1000);
});

test('snapshot saves the view as a PNG, in the overview and while walking', async ({ page }) => {
  await openFresh(page);
  await drawRoom(page);
  await open3d(page);

  for (const walking of [false, true]) {
    if (walking) await page.getByRole('button', { name: 'Walk through' }).click();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Snapshot' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe(walking ? 'Untitled plan - 3D walk-through.png' : 'Untitled plan - 3D.png');
    const bytes = readFileSync((await download.path())!);
    expect(bytes.subarray(1, 4).toString()).toBe('PNG');
    expect(bytes.length).toBeGreaterThan(5000); // a real picture, not a blank frame
  }
});

test('without a room there is nothing to walk through yet', async ({ page }) => {
  await openFresh(page);
  await open3d(page);
  await expect(page.getByRole('button', { name: 'Walk through' })).toBeDisabled();
});
