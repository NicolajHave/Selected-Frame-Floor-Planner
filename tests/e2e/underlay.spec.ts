import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { openFresh, saved, toScreen, trackErrors } from './helpers';

const PLAN_PDF = path.join(__dirname, '../fixtures/sample-plan.pdf');
const THREE_PAGES = path.join(__dirname, '../fixtures/three-pages.pdf');

// The fixture is A4 landscape (842 × 595 pt) at 1:100 with a 10 m dimension
// line from x = 60 pt to 60 + 283.46 pt, 55 pt above the bottom edge.
const PAGE_W_PT = 842;
const PAGE_H_PT = 595;
const DIM_X0_PT = 60;
const DIM_X1_PT = 60 + (10000 / 100) * (72 / 25.4);
const DIM_Y_PT = PAGE_H_PT - 55;

async function importPlan(page: Page) {
  await page.getByTestId('underlay-file').setInputFiles(PLAN_PDF);
  // One page: straight to "keep the plan"; take all of it.
  await page.getByRole('dialog').getByRole('button', { name: 'Use whole page' }).click();
  await expect(page.locator('[data-layer="underlay"] image')).toBeVisible();
  await expect(page.getByText('Set scale: click one end')).toBeVisible();
}

/** World mm of a point on the PDF page, given in PDF points from the top-left. */
async function planPoint(page: Page, xPt: number, yPt: number) {
  const u = (await saved(page)).underlay;
  return {
    x: u.position.x + (xPt / PAGE_W_PT) * u.width,
    y: u.position.y + (yPt / PAGE_H_PT) * u.width * u.aspect,
  };
}

test('import a PDF plan and calibrate its scale from a known dimension', async ({ page }) => {
  const errors = trackErrors(page);
  await openFresh(page);
  await importPlan(page);

  const u0 = (await saved(page)).underlay;
  expect(u0.fileName).toBe('sample-plan.pdf');
  expect(u0.src.startsWith('data:image/jpeg')).toBe(true);
  expect(u0.aspect).toBeCloseTo(PAGE_H_PT / PAGE_W_PT, 2);
  expect(u0.calibrated).toBe(false);

  // Click both ends of the 10 m dimension line and enter its real length.
  const a = await planPoint(page, DIM_X0_PT, DIM_Y_PT);
  const b = await planPoint(page, DIM_X1_PT, DIM_Y_PT);
  for (const p of [a, b]) {
    const s = await toScreen(page, p.x, p.y);
    await page.mouse.click(s.x, s.y);
  }
  await page.getByLabel('Real distance between the points').fill('10000');
  await page.getByRole('button', { name: 'Apply' }).click();

  const u1 = (await saved(page)).underlay;
  expect(u1.calibrated).toBe(true);
  // A4 is 297 mm wide; at 1:100 the whole page spans 29.7 m.
  expect(Math.abs(u1.width - 29700) / 29700).toBeLessThan(0.01);
  // The first clicked point stays where it was.
  const a1 = await planPoint(page, DIM_X0_PT, DIM_Y_PT);
  expect(Math.hypot(a1.x - a.x, a1.y - a.y)).toBeLessThan(150);
  await expect(page.locator('aside').last()).toContainText('Scale set');

  // Calibration is one undo step.
  await page.keyboard.press('Control+z');
  expect((await saved(page)).underlay.width).toBeCloseTo(u0.width, 3);
  await page.keyboard.press('Control+Shift+z');

  expect(errors).toEqual([]);
});

test('move, fade, persist and remove the underlay', async ({ page }) => {
  await openFresh(page);
  await importPlan(page);
  await page.keyboard.press('Escape'); // skip calibration

  // Locked by default: clicks go through to the canvas.
  await expect(page.locator('[data-layer="underlay"] image')).toHaveAttribute('pointer-events', 'none');

  await page.getByRole('button', { name: 'Move', exact: true }).click();
  const before = (await saved(page)).underlay.position;
  const box = (await page.locator('[data-layer="underlay"] image').boundingBox())!;
  const sx = box.x + box.width / 2;
  const sy = box.y + box.height / 2;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(sx + 60, sy + 30, { steps: 5 });
  await page.mouse.up();
  const after = (await saved(page)).underlay.position;
  expect(after.x - before.x).toBeGreaterThan(500);
  expect(after.y - before.y).toBeGreaterThan(200);
  await page.getByRole('button', { name: 'Done moving' }).click();

  await page.getByLabel('Underlay opacity').fill('30');
  expect((await saved(page)).underlay.opacity).toBeCloseTo(0.3);

  await page.reload();
  await expect(page.locator('[data-layer="underlay"] image')).toBeVisible();
  expect((await saved(page)).underlay.position).toEqual(after);

  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.locator('[data-layer="underlay"]')).toHaveCount(0);
  await page.keyboard.press('Control+z');
  await expect(page.locator('[data-layer="underlay"] image')).toBeVisible();
});

test('import a raster image', async ({ page }) => {
  await openFresh(page);
  const png = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 400;
    c.height = 200;
    const ctx = c.getContext('2d')!;
    ctx.strokeRect(20, 20, 360, 160);
    return c.toDataURL('image/png').split(',')[1]!;
  });
  await page.getByTestId('underlay-file').setInputFiles({
    name: 'plan.png',
    mimeType: 'image/png',
    buffer: Buffer.from(png, 'base64'),
  });
  await expect(page.locator('[data-layer="underlay"] image')).toBeVisible();
  const u = (await saved(page)).underlay;
  expect(u.fileName).toBe('plan.png');
  expect(u.aspect).toBeCloseTo(0.5, 3);
});

test('choose a page of a longer PDF and keep only the plan on it', async ({ page }) => {
  const errors = trackErrors(page);
  await openFresh(page);
  await page.getByTestId('underlay-file').setInputFiles(THREE_PAGES);
  const dialog = page.getByRole('dialog', { name: 'Choose the page with the floor plan' });
  await expect(dialog.getByRole('button', { name: /^Page \d$/ })).toHaveCount(3);
  await dialog.getByRole('button', { name: 'Page 3' }).click();

  // Drag a box around the lower-right quarter of the page.
  const crop = page.getByTestId('pdf-crop');
  await expect(page.getByRole('img', { name: 'Page 3' })).toBeVisible();
  const box = (await crop.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.95, box.y + box.height * 0.92, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByTestId('pdf-crop-box')).toBeVisible();
  await page.getByRole('button', { name: 'Use selection' }).click();

  await expect(page.locator('[data-layer="underlay"] image')).toBeVisible();
  const u = (await saved(page)).underlay;
  expect(u).toMatchObject({ page: 3, pageCount: 3, cropped: true });
  // The kept part is wider than tall, like the box that was drawn (0.40 × 0.42 of an A4 landscape page).
  expect(u.aspect).toBeCloseTo((0.42 * 595) / (0.4 * 842), 1);
  await expect(page.getByText('page 3 of 3 · part of the page')).toBeVisible();
  expect(errors, 'console errors').toEqual([]);
});
