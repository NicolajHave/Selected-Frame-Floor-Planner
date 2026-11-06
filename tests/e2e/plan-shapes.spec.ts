import { expect, test } from '@playwright/test';
import { canvas, drawRoom, openFresh, place } from './helpers';
import { exportPdf, pageWith, pdfText } from './pdf';

test('the plan shows each fixture as its model seen from above', async ({ page }, info) => {
  await openFresh(page);
  const b = await drawRoom(page, 300, 220);
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  await place(page, 'Carpet Size 1', cx - 1800, cy, { alt: true });
  await place(page, 'Iconic Table', cx + 900, cy - 300, { alt: true });
  await place(page, 'Long Torso Female', cx + 2400, cy + 1600, { alt: true });
  await place(page, 'Wall Unit 1400 - Shelves', cx, b.minY + 300);

  // One drawn shape per fixture, made of the model's own outline.
  const shapes = canvas(page).getByTestId('plan-shape');
  await expect(shapes).toHaveCount(4);
  const carpet = await shapes.first().locator('path').first().getAttribute('d');
  // The carpet from the production drawing: an organic outline, not a box.
  expect(carpet!.split('L').length).toBeGreaterThan(60);

  await page.keyboard.press('Escape');
  await canvas(page).screenshot({ path: info.outputPath('plan-shapes.png') });

  // The PDF's plan draws the same shapes.
  const { file } = await exportPdf(page, { views: false });
  expect(pageWith(await pdfText(file), 'Plan View')).toContain('Carpet Size 1');
});
