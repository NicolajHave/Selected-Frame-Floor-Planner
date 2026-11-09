import { test, expect } from '@playwright/test';
import { drawRoom, openFresh, saved, toScreen } from './helpers';

test('the library starts folded; groups unfold, and stay so after a reload', async ({ page }) => {
  await openFresh(page);
  await page.evaluate(() => localStorage.removeItem('sf-planner:library-open'));
  await page.reload();
  const doors = page.getByRole('button', { name: /Doors & windows/ });
  await expect(doors).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByTitle('Place Door 900 mm', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Electrical/ })).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('button', { name: /^Racks/ })).toHaveAttribute('aria-expanded', 'false');

  await doors.click();
  await expect(doors).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByTitle(/Place Door/).first()).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: /Doors & windows/ })).toHaveAttribute('aria-expanded', 'true');
  // The note is in the toolbar now, not the library.
  await expect(page.getByRole('button', { name: '+ Note' })).toBeVisible();
});

test('shift-dragging a corner scales the whole room in proportion', async ({ page }) => {
  await openFresh(page);
  const r = await drawRoom(page);
  const before = (await saved(page)).room.corners.map((c: { point: { x: number; y: number } }) => c.point);
  const w0 = r.maxX - r.minX;
  const h0 = r.maxY - r.minY;
  const a = await toScreen(page, r.maxX, r.maxY);
  const b = await toScreen(page, r.minX + w0 * 1.2, r.minY + h0 * 1.2);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.keyboard.down('Shift');
  for (let i = 1; i <= 8; i++) await page.mouse.move(a.x + ((b.x - a.x) * i) / 8, a.y + ((b.y - a.y) * i) / 8);
  await page.mouse.up();
  await page.keyboard.up('Shift');
  const after = (await saved(page)).room.corners.map((c: { point: { x: number; y: number } }) => c.point);
  const xs = after.map((p: { x: number }) => p.x);
  const ys = after.map((p: { y: number }) => p.y);
  const w = Math.max(...xs) - Math.min(...xs);
  const h = Math.max(...ys) - Math.min(...ys);
  expect(w / h).toBeCloseTo(w0 / h0, 2);
  expect(w / w0).toBeCloseTo(1.2, 1);
  // The opposite corner stayed put.
  expect(after[0]).toEqual(before[0]);
  // One undo step takes it all back.
  await page.keyboard.press('Control+z');
  expect((await saved(page)).room.corners.map((c: { point: unknown }) => c.point)).toEqual(before);
});
