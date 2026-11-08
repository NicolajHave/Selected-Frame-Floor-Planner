import { test, expect, type Page } from '@playwright/test';
import { drawRoom, openFresh, place, saved, toScreen, trackErrors } from './helpers';

/** Drag inventory item `id` so its centre ends at world (x, y). */
async function dragTo(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, alt = false) {
  const a = await toScreen(page, from.x, from.y);
  const b = await toScreen(page, to.x, to.y);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  if (alt) await page.keyboard.down('Alt');
  for (let i = 1; i <= 8; i++) await page.mouse.move(a.x + ((b.x - a.x) * i) / 8, a.y + ((b.y - a.y) * i) / 8);
  return {
    release: async () => {
      await page.mouse.up();
      if (alt) await page.keyboard.up('Alt');
    },
  };
}

test('dragging next to a fixture keeps the 900 mm aisle and lines up', async ({ page }) => {
  const errors = trackErrors(page);
  await openFresh(page);
  const r = await drawRoom(page);
  const a = await place(page, 'Floor Rack 1400', r.minX + 2500, r.minY + 2500);
  const b = await place(page, 'Floor Rack 1400', r.minX + 2500, r.minY + 6500);
  const w = a.size.width;

  // Bring B to the right of A, roughly an aisle away and a little off its line.
  const drag = await dragTo(page, b.position, { x: a.position.x + w + 940, y: a.position.y + 40 });
  await expect(page.locator('[data-snap="gap"]')).toHaveCount(1);
  await expect(page.locator('[data-snap="gap"]')).toContainText('900');
  expect(await page.locator('[data-snap="align"]').count()).toBeGreaterThan(0);
  await drag.release();
  await expect(page.locator('[data-layer="snap-guides"]')).toHaveCount(0);

  const moved = (await saved(page)).inventory.find((x: { id: string }) => x.id === b.id);
  expect(moved.position.x - a.position.x).toBeCloseTo(w + 900, 0);
  expect(moved.position.y).toBeCloseTo(a.position.y, 0);
  expect(errors).toEqual([]);
});

test('holding Alt places freely', async ({ page }) => {
  await openFresh(page);
  const r = await drawRoom(page);
  const a = await place(page, 'Floor Rack 1400', r.minX + 2500, r.minY + 2500);
  const b = await place(page, 'Floor Rack 1400', r.minX + 2500, r.minY + 6500);
  const target = { x: a.position.x + a.size.width + 940, y: a.position.y + 40 };
  const drag = await dragTo(page, b.position, target, true);
  await drag.release();
  const moved = (await saved(page)).inventory.find((x: { id: string }) => x.id === b.id);
  expect(Math.abs(moved.position.x - a.position.x - a.size.width - 900)).toBeGreaterThan(15);
});
