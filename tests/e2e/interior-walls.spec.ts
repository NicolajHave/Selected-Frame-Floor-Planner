import { test, expect } from '@playwright/test';
import { drawRoom, openFresh, place, saved, toScreen, trackErrors } from './helpers';

test('draw an interior wall with two clicks; adjust it; fixtures keep clear of it', async ({ page }) => {
  const errors = trackErrors(page);
  await openFresh(page);
  const r = await drawRoom(page);

  await page.getByRole('button', { name: '+ Wall' }).click();
  await expect(page.getByText(/Interior wall: click where it starts/)).toBeVisible();
  const from = await toScreen(page, r.minX + 3000, r.minY + 1000);
  const to = await toScreen(page, r.minX + 3120, r.minY + 4000); // a little off plumb
  await page.mouse.click(from.x, from.y);
  await expect(page.getByText(/click where the interior wall ends/)).toBeVisible();

  // The wall follows the pointer with its length; Shift keeps it plumb.
  await page.keyboard.down('Shift');
  await page.mouse.move(to.x, to.y);
  await expect(page.getByTestId('partition-draft')).toContainText('3.00 m');
  await page.mouse.click(to.x, to.y);
  await page.keyboard.up('Shift');

  let [wall] = (await saved(page)).pillars;
  expect(wall.kind).toBe('wall');
  expect(Math.abs(wall.size.width - 3000)).toBeLessThan(30);
  expect(wall.size.depth).toBe(100);
  expect(Math.abs(Math.abs(wall.rotation) - Math.PI / 2)).toBeLessThan(0.001);
  expect(Math.abs(wall.position.x - (r.minX + 3000))).toBeLessThan(30);

  // It is selected and has its own panel: length and thickness.
  const panel = page.getByTestId('details-panel');
  await expect(panel).toContainText('Interior wall');
  await panel.getByLabel('Length').fill('2500');
  await panel.getByLabel('Length').press('Enter');
  await panel.getByLabel('Thickness').fill('150');
  await panel.getByLabel('Thickness').press('Enter');
  [wall] = (await saved(page)).pillars;
  expect(wall.size).toMatchObject({ width: 2500, depth: 150 });
  // A wall on its own in the room is no layout problem.
  await expect(page.locator('footer')).not.toContainText(/issue/i);

  // A rack standing across it is.
  await page.keyboard.press('Escape');
  await place(page, 'Floor Rack 1400', wall.position.x, wall.position.y);
  await page.keyboard.press('Escape');
  await expect(page.locator('footer')).toContainText(/1 layout issue/);
  await expect(panel).toContainText(/Interior wall and Floor Rack 1400 overlap|Floor Rack 1400 and Interior wall overlap/);

  // It shows in 3D, and the room lock holds it like the other walls.
  await page.getByRole('button', { name: '3D View' }).click();
  await expect(page.locator('[data-stage] canvas')).toBeVisible();
  await page.getByRole('button', { name: '2D Plan' }).click();
  await page.getByRole('button', { name: 'Lock room' }).click();
  await expect(page.getByRole('button', { name: '+ Wall' })).toBeDisabled();
  expect(errors).toEqual([]);
});

test('an interior wall may run into the room walls and meet another; right-click starts one', async ({ page }) => {
  await openFresh(page);
  const r = await drawRoom(page);

  // Start from the floor with a right-click, end at the room's corner: the end
  // snaps to the corner of the wall's inside face (60 mm in, half the wall).
  const start = await toScreen(page, r.minX + 4000, r.minY + 3000);
  await page.mouse.click(start.x, start.y, { button: 'right' });
  await page.getByRole('menuitem', { name: 'Start interior wall here' }).click();
  const corner = await toScreen(page, r.minX, r.minY);
  await page.mouse.click(corner.x + 3, corner.y + 3);
  let walls = (await saved(page)).pillars;
  expect(walls).toHaveLength(1);
  expect(Math.round(walls[0].size.width)).toBe(Math.round(Math.hypot(4000 - 60, 3000 - 60)));

  // A second wall crossing the first: still no layout problem.
  await page.getByRole('button', { name: '+ Wall' }).click();
  const a = await toScreen(page, r.minX + 1000, r.minY + 2500);
  const b = await toScreen(page, r.minX + 3500, r.minY + 500);
  await page.mouse.click(a.x, a.y);
  await page.mouse.click(b.x, b.y);
  walls = (await saved(page)).pillars;
  expect(walls).toHaveLength(2);
  await expect(page.locator('footer')).not.toContainText(/issue/i);

  // Esc while drawing leaves nothing behind; undo takes the last wall away.
  await page.getByRole('button', { name: '+ Wall' }).click();
  await page.mouse.click(a.x + 80, a.y + 80);
  await page.keyboard.press('Escape');
  expect((await saved(page)).pillars).toHaveLength(2);
  await page.keyboard.press('Control+z');
  expect((await saved(page)).pillars).toHaveLength(1);
});
