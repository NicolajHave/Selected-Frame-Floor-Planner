import { test, expect } from '@playwright/test';
import { drawRoom, openFresh, place, saved, toScreen, trackErrors } from './helpers';

test('select several fixtures, move, align, duplicate and delete them together', async ({ page }) => {
  const errors = trackErrors(page);
  await openFresh(page);
  const room = await drawRoom(page);
  const a = await place(page, 'Floor Rack 1400', room.minX + 2500, room.minY + 3000);
  const b = await place(page, 'Floor Rack 1400', room.minX + 5000, room.minY + 3600);
  const c = await place(page, 'Floor Rack 700', room.minX + 7500, room.minY + 4200);
  await page.keyboard.press('Escape');

  // Shift-click two of them.
  const at = async (x: number, y: number) => toScreen(page, x, y);
  let s = await at(a.position.x, a.position.y);
  await page.keyboard.down('Shift');
  await page.mouse.click(s.x, s.y);
  s = await at(b.position.x, b.position.y);
  await page.mouse.click(s.x, s.y);
  await page.keyboard.up('Shift');
  await expect(page.getByTestId('group-count')).toHaveText('2 selected');

  // Drag one: both move by the same amount.
  const from = await at(b.position.x, b.position.y);
  const to = await at(b.position.x + 1000, b.position.y + 500);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
  let inv = (await saved(page)).inventory;
  expect(inv[0].position.x - a.position.x).toBeCloseTo(1000, -1);
  expect(inv[1].position.x - b.position.x).toBeCloseTo(1000, -1);
  expect(inv[0].position.y - a.position.y).toBeCloseTo(500, -1);
  expect(inv[2].position).toEqual(c.position); // not selected
  // One undo step for the whole drag.
  await page.keyboard.press('Control+z');
  inv = (await saved(page)).inventory;
  expect(inv[0].position).toEqual(a.position);
  expect(inv[1].position).toEqual(b.position);

  // Box-select all three with shift-drag on the floor, then align their tops.
  await page.keyboard.press('Escape');
  const boxA = await at(room.minX + 1000, room.minY + 2000);
  const boxB = await at(room.minX + 9000, room.minY + 5000);
  await page.keyboard.down('Shift');
  await page.mouse.move(boxA.x, boxA.y);
  await page.mouse.down();
  await page.mouse.move(boxB.x, boxB.y, { steps: 5 });
  await expect(page.locator('[data-marquee]')).toBeVisible();
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await expect(page.getByTestId('group-count')).toHaveText('3 selected');
  await page.getByRole('button', { name: 'Align top edges' }).click();
  inv = (await saved(page)).inventory;
  expect(new Set(inv.map((i: { position: { y: number } }) => i.position.y)).size).toBe(1);
  await page.getByRole('button', { name: 'Equal gaps across' }).click();

  // Duplicate and delete the whole selection.
  await page.keyboard.press('Control+d');
  expect((await saved(page)).inventory).toHaveLength(6);
  await expect(page.getByTestId('group-count')).toHaveText('3 selected');
  await page.keyboard.press('Delete');
  expect((await saved(page)).inventory).toHaveLength(3);

  // Select all.
  await page.keyboard.press('Control+a');
  await expect(page.getByTestId('group-count')).toHaveText('3 selected');
  expect(errors).toEqual([]);
});
