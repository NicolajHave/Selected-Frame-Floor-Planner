import { test, expect } from '@playwright/test';
import { drawRoom, openFresh, saved, toScreen, trackErrors } from './helpers';
import { exportPdf, pdfText } from './pdf';

test('measuring tape: corners snap, Shift keeps it straight, keep it on the plan and in the PDF', async ({ page }) => {
  const errors = trackErrors(page);
  await openFresh(page);
  const r = await drawRoom(page);
  const width = r.maxX - r.minX;

  await page.getByRole('button', { name: 'Measure' }).click();
  await expect(page.getByTestId('measure-panel')).toContainText('Click where to measure from');

  // Near two corners of the room: they snap, so it's the wall's length exactly.
  let a = await toScreen(page, r.minX - 15, r.minY - 10);
  let b = await toScreen(page, r.maxX + 20, r.minY - 15);
  await page.mouse.click(a.x, a.y);
  await page.mouse.move(b.x, b.y);
  await expect(page.locator('[data-live-measure]')).toHaveCount(1);
  await page.mouse.click(b.x, b.y);
  await expect(page.getByTestId('measure-result')).toHaveText(`${Math.round(width).toLocaleString('da-DK')} mm`);

  // Shift: straight across, wherever the pointer drifts.
  a = await toScreen(page, r.minX + 1000, r.minY + 2000);
  b = await toScreen(page, r.minX + 4333, r.minY + 2600);
  await page.mouse.click(a.x, a.y);
  await page.keyboard.down('Shift');
  await page.mouse.move(b.x, b.y);
  await page.mouse.click(b.x, b.y);
  await page.keyboard.up('Shift');
  const text = await page.getByTestId('measure-result').textContent();
  const straight = Number(text!.replace(/\D/g, ''));
  expect(Math.abs(straight - 3333)).toBeLessThan(40);

  await page.getByRole('button', { name: 'Keep on plan' }).click();
  const p = await saved(page);
  expect(p.dimensions).toHaveLength(1);
  expect(p.dimensions[0].a.y).toBe(p.dimensions[0].b.y);
  await expect(page.locator('[data-kept-dimension]')).toHaveCount(1);

  // Out of the tool, the dimension stays; it goes into the PDF.
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-kept-dimension]')).toHaveCount(1);
  const { file } = await exportPdf(page);
  expect((await pdfText(file)).join(' ')).toContain(straight.toLocaleString('da-DK'));

  // Back in the tool, × removes it; Undo brings it back.
  await page.getByRole('button', { name: 'Measure' }).click();
  await page.getByRole('button', { name: /Remove the \d+ mm dimension/ }).dispatchEvent('pointerdown');
  await expect(page.locator('[data-kept-dimension]')).toHaveCount(0);
  await page.keyboard.press('Control+z');
  await expect(page.locator('[data-kept-dimension]')).toHaveCount(1);
  expect(errors).toEqual([]);
});
