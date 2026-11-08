import { expect, test } from '@playwright/test';
import { drawRoom, openFresh, place, saved, trackErrors } from './helpers';

test('capacity (hangers, shelf metres) and a budget against the parts list total', async ({ page }) => {
  const errors = trackErrors(page);
  await openFresh(page);
  const room = await drawRoom(page);
  await place(page, 'Wall Unit 1400 - Shelves', room.minX + 2000, room.minY + 200);
  await place(page, 'Single Shelf Floor Rack', room.minX + 4000, room.minY + 3000, { alt: true });
  await page.keyboard.press('Escape');

  const capacity = page.getByTestId('capacity');
  // 5.22 m of shelf on the wall unit + 1.68 m on the rack; 25 hangers on the rack.
  await expect(capacity).toContainText('6,9 m');
  await expect(capacity).toContainText('25');

  const budget = page.getByLabel('Budget (EUR)');
  await budget.fill('100');
  await budget.press('Enter');
  await expect(page.getByTestId('budget-status')).toContainText('over budget');
  expect((await saved(page)).budgetEur).toBe(100);
  await budget.fill('1000000');
  await budget.press('Enter');
  await expect(page.getByTestId('budget-status')).toContainText('left');
  await budget.fill('');
  await budget.press('Enter');
  expect((await saved(page)).budgetEur).toBeUndefined();
  expect(errors, 'console errors').toEqual([]);
});
