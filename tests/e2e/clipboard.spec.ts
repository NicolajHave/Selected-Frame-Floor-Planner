import { test, expect } from '@playwright/test';
import { drawRoom, openFresh, place, saved, toScreen, trackErrors } from './helpers';

test('copy fixtures with Ctrl+C and paste them into another layout and another plan', async ({ page }) => {
  const errors = trackErrors(page);
  await openFresh(page);
  const r = await drawRoom(page);
  const rack = await place(page, 'Floor Rack 1400', r.minX + 2000, r.minY + 2000);
  await place(page, 'Floor Rack 1400', r.minX + 4500, r.minY + 2000);

  // Select both (Ctrl+A) and copy.
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+c');
  await expect(page.getByText('Copied 2 items')).toBeVisible();

  // An empty layout B: paste under the pointer.
  await page.getByRole('button', { name: '+ Layout variant' }).click();
  await page.getByRole('menuitem', { name: 'Empty layout (just the room)' }).click();
  expect((await saved(page)).inventory).toHaveLength(0);
  const at = await toScreen(page, r.minX + 5000, r.minY + 5000);
  await page.mouse.move(at.x, at.y);
  await page.keyboard.press('Control+v');
  await expect(page.getByText('Pasted 2 items')).toBeVisible();
  let p = await saved(page);
  expect(p.inventory).toHaveLength(2);
  expect(p.inventory.map((x: { name: string }) => x.name)).toEqual(['Floor Rack 1400', 'Floor Rack 1400']);
  // Centred on the pointer, the same distance apart, with new ids.
  const xs = p.inventory.map((x: { position: { x: number } }) => x.position.x).sort((a: number, b: number) => a - b);
  expect(xs[1] - xs[0]).toBeCloseTo(2500, 0);
  expect((xs[0] + xs[1]) / 2).toBeCloseTo(r.minX + 5000, -2);
  expect(p.inventory.map((x: { id: string }) => x.id)).not.toContain(rack.id);
  // Layout A is untouched.
  expect(p.variants.find((v: { name: string }) => v.name === 'Layout A').inventory).toHaveLength(2);

  // Undo takes the paste back.
  await page.keyboard.press('Control+z');
  expect((await saved(page)).inventory).toHaveLength(0);

  // A brand new plan still has the clipboard.
  await page.getByRole('button', { name: 'File' }).click();
  page.once('dialog', (d) => d.accept());
  await page.getByRole('menuitem', { name: 'New plan' }).click();
  await drawRoom(page);
  await page.keyboard.press('Control+v');
  p = await saved(page);
  expect(p.inventory).toHaveLength(2);
  expect(errors).toEqual([]);
});

test('Ctrl+V with nothing copied says so', async ({ page }) => {
  await openFresh(page);
  await drawRoom(page);
  await page.evaluate(() => localStorage.removeItem('sf-planner:clipboard'));
  await page.keyboard.press('Control+v');
  await expect(page.getByText('Nothing to paste yet')).toBeVisible();
});
