import { expect, test } from '@playwright/test';
import { canvas, openFresh, saved, toScreen, trackErrors } from './helpers';

test('drag a rectangle to make a room, then edit it like any other', async ({ page }) => {
  const errors = trackErrors(page);
  await openFresh(page);
  await page.getByRole('button', { name: 'Rectangle' }).click();
  const a = await toScreen(page, 0, 0);
  const b = await toScreen(page, 8000, 5000);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
  // Its size shows while dragging.
  await expect(canvas(page).getByTestId('rect-draft')).toBeVisible();
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();

  let room = (await saved(page)).room;
  expect(room.closed).toBe(true);
  expect(room.corners).toHaveLength(4);
  const xs = room.corners.map((c: { point: { x: number } }) => c.point.x);
  const ys = room.corners.map((c: { point: { y: number } }) => c.point.y);
  expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(8000, -2);
  expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(5000, -2);
  // Back to Select, with the room's panel open for exact lengths.
  await expect(page.getByRole('button', { name: 'Select' })).toHaveClass(/bg-ink-900/);
  await page.getByLabel('Wall 1').fill('9000');
  await page.getByLabel('Wall 1').press('Enter');
  room = (await saved(page)).room;
  const xs2 = room.corners.map((c: { point: { x: number } }) => c.point.x);
  expect(Math.max(...xs2) - Math.min(...xs2)).toBeCloseTo(9000, -1);

  // A click without dragging makes nothing.
  await page.getByRole('button', { name: 'Rectangle' }).click();
  await page.mouse.click(a.x + 20, a.y + 20);
  expect((await saved(page)).room.corners).toHaveLength(4);
  expect(errors, 'console errors').toEqual([]);
});
