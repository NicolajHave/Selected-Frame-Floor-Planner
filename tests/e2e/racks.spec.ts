import { test, expect } from '@playwright/test';
import { drawRoom, openFresh, saved, toScreen, trackErrors } from './helpers';
import { exportPdf, pageWith, pdfText } from './pdf';

test('build a wall rack, place it on a wall as one piece, then edit it', async ({ page }) => {
  const errors = trackErrors(page);
  await openFresh(page);
  const room = await drawRoom(page);

  await page.getByRole('button', { name: 'Build a wall rack…' }).click();
  const builder = page.getByRole('dialog', { name: 'Wall rack builder' });
  await expect(builder.getByRole('button', { name: 'Place on plan' })).toBeDisabled();
  await builder.getByTitle('Add Wall Unit Sidehang').click();
  await builder.getByTitle('Add Wall Unit 1400 - Shelves').click();
  await builder.getByTitle('Add Wall Unit 700 - Shelf').click();
  await expect(builder.getByTestId('rack-run').locator('li')).toHaveCount(3);
  await expect(builder.getByTestId('rack-summary')).toContainText('3,80 m');
  await expect(builder.getByTestId('rack-summary')).toContainText('35');
  // Swap the last two.
  await builder.getByRole('button', { name: 'Move unit 3 left' }).click();
  await builder.getByLabel('Rack name').fill('Denim wall');
  await builder.getByRole('button', { name: 'Place on plan' }).click();
  await expect(builder).toBeHidden();

  // Click near the top wall: the whole rack snaps flat against it.
  const s = await toScreen(page, room.minX + 4000, room.minY + 500);
  await page.mouse.click(s.x, s.y);
  let [rack] = (await saved(page)).inventory;
  expect(rack).toMatchObject({
    name: 'Denim wall',
    category: 'Wall rack',
    modules: ['105-99-003', '105-99-010', '105-99-004'],
    size: { width: 3802, depth: 517, height: 2288 },
    rotation: 0,
  });
  expect(rack.position.y - rack.size.depth / 2).toBe(room.minY + 60); // back on the wall's inside face

  // One fixture on the plan, three units in the parts list.
  const panel = page.locator('aside').last();
  await expect(panel.getByTestId('rack-units').locator('li')).toHaveCount(3);
  await page.keyboard.press('Escape');
  // Three units plus their columns: left, two between, right.
  await expect(page.locator('aside').last()).toContainText('Units7');
  await expect(page.locator('aside').last()).toContainText('Wall rack column – middle');
  // 252 + 1126 + 1586 + 4 × 419
  await expect(page.locator('aside').last()).toContainText('Total price4.640 €');
  await expect(page.locator('aside').last()).toContainText('Per m² floor');
  await expect(page.locator('aside').last()).toContainText('Hanger capacity35');

  // Edit: drop the 1400 shelves. It gets narrower; the back stays on the wall.
  const at = await toScreen(page, rack.position.x, rack.position.y);
  await page.mouse.click(at.x, at.y);
  await page.getByRole('button', { name: 'Edit rack…' }).click();
  const editor = page.getByRole('dialog', { name: 'Edit wall rack' });
  await editor.getByRole('button', { name: 'Remove unit 3' }).click();
  await editor.getByRole('button', { name: 'Save rack' }).click();
  [rack] = (await saved(page)).inventory;
  expect(rack.modules).toEqual(['105-99-003', '105-99-010']);
  expect(rack.size).toEqual({ width: 2306, depth: 517, height: 2288 });
  expect(rack.position.y - rack.size.depth / 2).toBe(room.minY + 60);

  await page.keyboard.press('Control+z');
  expect((await saved(page)).inventory[0].modules).toHaveLength(3);

  // The PDF plan marks it R1 and lists what it is made of; the parts list counts the units.
  const pages = await pdfText((await exportPdf(page, { views: false })).file);
  const plan = pageWith(pages, 'Plan View');
  expect(plan).toContain('R1');
  expect(plan).toContain('Denim wall');
  expect(plan).toContain('1× Wall Unit Sidehang, 1× Wall Unit 700 - Shelf, 1× Wall Unit 1400 - Shelves');
  const list = pageWith(pages, 'Parts list & checks');
  expect(list).toContain('Wall Unit 700 - Shelf');
  expect(list).not.toContain('Total €'); // prices only when asked for
  const priced = pageWith(await pdfText((await exportPdf(page, { views: false, prices: true })).file), 'Parts list & checks');
  expect(priced).toContain('Total €');
  expect(priced).toContain('4.640,00');

  await page.getByRole('button', { name: '3D View' }).click();
  await expect(page.locator('canvas')).toBeVisible();
  await page.waitForTimeout(1000);
  expect(errors).toEqual([]);
});
