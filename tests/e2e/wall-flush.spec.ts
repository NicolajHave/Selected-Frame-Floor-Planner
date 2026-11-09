import { test, expect } from '@playwright/test';
import { drawRoom, openFresh, place, saved, toScreen, trackErrors } from './helpers';

test('a floor rack dragged near a wall stands flush against it, with no warning', async ({ page }) => {
  const errors = trackErrors(page);
  await openFresh(page);
  const r = await drawRoom(page);
  const rack = await place(page, 'Floor Rack 1400', r.minX + 4000, r.minY + 3000);
  const p = await saved(page);
  const half = p.room.wallThickness / 2;
  const face = r.minY + half;

  // Drag it so its back is ~100 mm from the top wall's inside face.
  const a = await toScreen(page, rack.position.x, rack.position.y);
  const b = await toScreen(page, rack.position.x, face + rack.size.depth / 2 + 100);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(a.x, a.y + ((b.y - a.y) * i) / 8);
  await page.mouse.up();
  let moved = (await saved(page)).inventory[0];
  expect(moved.position.y - rack.size.depth / 2).toBeCloseTo(face, 0);
  expect(moved.rotation).toBe(rack.rotation);
  // No "only … between … and the wall".
  await page.keyboard.press('Escape');
  await expect(page.locator('footer')).not.toContainText(/issue/i);

  // Dragged into the wall, it comes back out flush.
  const c = await toScreen(page, moved.position.x, moved.position.y);
  const d = await toScreen(page, moved.position.x, face + 100); // half of it in the wall
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(c.x, c.y + ((d.y - c.y) * i) / 8);
  await page.mouse.up();
  moved = (await saved(page)).inventory[0];
  expect(moved.position.y - rack.size.depth / 2).toBeCloseTo(face, 0);
  expect(errors).toEqual([]);
});
