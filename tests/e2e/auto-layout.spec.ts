import { test, expect } from '@playwright/test';
import { drawRoom, openFresh, place, saved, trackErrors } from './helpers';

test('automatic proposal: a new layout tab, the own layout untouched, no layout problems', async ({ page }) => {
  const errors = trackErrors(page);
  await openFresh(page);
  const r = await drawRoom(page, 300, 200);
  await place(page, 'Floor Rack 1400', r.minX + 2000, r.minY + 2000);
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: '+ Layout variant' }).click();
  await page.getByRole('menuitem', { name: 'Automatic proposal…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Automatic layout' });
  await expect(dialog.getByLabel('Minimum aisle (mm)')).toHaveValue('900');
  await dialog.getByText('Volume shop', { exact: true }).click();
  await dialog.getByRole('button', { name: 'Make proposal' }).click();

  await expect(page.getByRole('tab', { name: /Proposal – volume shop/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText(/at least 900 mm apart/)).toBeVisible();
  const p = await saved(page);
  expect(p.inventory.length).toBeGreaterThan(8);
  expect(p.inventory.some((i: { modules?: string[] }) => i.modules?.length)).toBe(true);
  // The original layout is still there, with its one rack.
  expect(p.variants.find((v: { name: string }) => v.name === 'Layout A').inventory).toHaveLength(1);
  // The layout check has nothing to say.
  await expect(page.locator('footer')).not.toContainText(/issue|problem/i);

  // A brand proposal next to it, with a wider aisle: fewer fixtures.
  await page.getByRole('button', { name: 'Add a layout' }).click();
  await page.getByRole('menuitem', { name: 'Automatic proposal…' }).click();
  await dialog.getByText('Brand shop', { exact: true }).click();
  await dialog.getByLabel('Minimum aisle (mm)').fill('1200');
  await dialog.getByRole('button', { name: 'Make proposal' }).click();
  await expect(page.getByRole('tab', { name: /Proposal – brand shop/ })).toHaveAttribute('aria-selected', 'true');
  const b = await saved(page);
  expect(b.inventory.length).toBeLessThan(p.inventory.length);

  // Undo takes the proposal away again.
  await page.keyboard.press('Control+z');
  await expect(page.getByRole('tab', { name: /Proposal – brand shop/ })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('an aisle outside 600–3000 mm is refused', async ({ page }) => {
  await openFresh(page);
  await drawRoom(page);
  await page.getByRole('button', { name: '+ Layout variant' }).click();
  await page.getByRole('menuitem', { name: 'Automatic proposal…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Automatic layout' });
  await dialog.getByLabel('Minimum aisle (mm)').fill('300');
  await expect(dialog.getByRole('button', { name: 'Make proposal' })).toBeDisabled();
  await expect(dialog).toContainText('between 600 and 3000 mm');
});
