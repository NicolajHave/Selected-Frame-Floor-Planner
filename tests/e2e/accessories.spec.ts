import { expect, test } from '@playwright/test';
import { canvas, drawRoom, openFresh, place, saved, trackErrors } from './helpers';

test('accessories are added from the fixture they belong to, not from the library', async ({ page }, info) => {
  const errors = trackErrors(page);
  await openFresh(page);

  // Not in the library on their own; the jeans rack has its new name.
  for (const name of ['Floor Rack Acrylic Sign', 'Leather Tray', 'Accessories Tray 3x3', 'Table Sign A5', 'Floor Price Sign A5']) {
    await expect(page.getByTitle(`Place ${name}`, { exact: true })).toHaveCount(0);
  }
  await expect(page.getByTitle('Place Single Shelf Floor Rack', { exact: true })).toBeVisible();

  const room = await drawRoom(page, 300, 220);
  await place(page, 'Floor Rack 1400', room.minX + 2500, room.minY + 3000);
  const panel = page.getByTestId('accessories');
  await panel.getByRole('button', { name: 'Add Floor Rack Acrylic Sign' }).click();
  await expect(panel.getByRole('button', { name: 'Add Floor Rack Acrylic Sign' })).toBeDisabled(); // one per rack
  let rack = (await saved(page)).inventory[0];
  expect(rack.accessories).toEqual([expect.objectContaining({ assetRef: '105-06-011-22-C' })]);

  // Shelf trays: two 3x3 on a 700 shelf, then the next one moves to another shelf.
  await place(page, 'Wall Unit 700 - Shelf', room.minX + 6000, room.minY + 300);
  const addTray = panel.getByRole('button', { name: 'Add Accessories Tray 3x3' });
  await addTray.click();
  await addTray.click();
  await addTray.click();
  const unit = (await saved(page)).inventory[1];
  expect(unit.accessories.map((a: { shelf: number }) => a.shelf)).toEqual([2, 2, 1]);
  // Move the third to the top shelf.
  await panel.getByLabel('Shelf for Accessories Tray 3x3 3').selectOption('3');
  expect((await saved(page)).inventory[1].accessories[2].shelf).toBe(3);
  await panel.getByRole('button', { name: 'Remove Accessories Tray 3x3 1' }).click();
  expect((await saved(page)).inventory[1].accessories).toHaveLength(2);

  // A sign in front of a mannequin; it counts in the parts list.
  await place(page, 'Long Torso Female', room.minX + 4000, room.minY + 5000, { alt: true });
  await panel.getByRole('button', { name: 'Add Floor Price Sign A5' }).click();
  await expect(canvas(page).getByTestId('plan-accessories')).toHaveCount(3);

  // Duplicating the rack copies its sign; undo takes it back.
  await canvas(page).getByTestId('plan-shape').first().click({ force: true });
  rack = (await saved(page)).inventory[0];
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+y');

  await page.keyboard.press('Escape');
  await canvas(page).screenshot({ path: info.outputPath('accessories-plan.png') });
  await page.getByRole('button', { name: '3D View' }).click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: info.outputPath('accessories-3d.png') });
  expect(errors, 'console errors').toEqual([]);
});
