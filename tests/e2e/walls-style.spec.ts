import { test, expect } from '@playwright/test';
import { drawRoom, openFresh, saved, toScreen, trackErrors } from './helpers';

test('select a wall: give it its own height, make it transparent, add a window to it', async ({ page }) => {
  const errors = trackErrors(page);
  await openFresh(page);
  const room = await drawRoom(page);

  // Click the right-hand wall (wall 2).
  const s = await toScreen(page, room.maxX, room.minY + 3500);
  await page.mouse.click(s.x, s.y);
  const panel = page.locator('aside').last();
  await expect(panel).toContainText('Wall 2');
  expect((await saved(page)).room.corners).toHaveLength(4); // no corner added

  const height = page.getByRole('spinbutton', { name: 'Height mm' });
  await expect(height).toHaveValue('2700');
  await height.fill('3200');
  await height.press('Enter');
  await page.getByRole('radio', { name: 'Transparent' }).click();
  let p = await saved(page);
  const id = p.room.corners[1].id;
  expect(p.room.walls[id]).toEqual({ height: 3200, transparent: true });
  await expect(page.locator(`[data-wall="${id}"]`)).toBeAttached();

  await page.getByRole('button', { name: '+ Window' }).click();
  p = await saved(page);
  expect(p.room.openings).toHaveLength(1);
  expect(p.room.openings[0]).toMatchObject({ kind: 'window', wallStartCornerId: id, offset: 3500 });

  // Back to the room's height, and solid again; undo brings them back.
  await page.getByRole('button', { name: 'On wall 2' }).click();
  await page.getByRole('button', { name: /Use the room/ }).click();
  await page.getByRole('radio', { name: 'Solid' }).click();
  expect((await saved(page)).room.walls[id]).toBeUndefined();
  await page.keyboard.press('Control+z');
  expect((await saved(page)).room.walls[id]).toEqual({ transparent: true });

  // The 3D view draws it.
  await page.getByRole('button', { name: '3D View' }).click();
  await expect(page.locator('canvas')).toBeVisible();
  await page.waitForTimeout(800);
  expect(errors).toEqual([]);
});
