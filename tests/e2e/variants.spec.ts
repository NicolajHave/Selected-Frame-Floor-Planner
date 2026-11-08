import { test, expect, type Page } from '@playwright/test';
import { drawRoom, openFresh, place, saved, trackErrors } from './helpers';
import { FakeCloud } from './fakeCloud';

const tabs = (page: Page) => page.getByRole('tablist', { name: 'Layouts' }).getByRole('tab');
const tab = (page: Page, name: string) => page.getByRole('tab', { name, exact: false });

test('layout variants: copy, change, switch, compare, rename, delete and undo', async ({ page }) => {
  const errors = trackErrors(page);
  await openFresh(page);
  const r = await drawRoom(page);
  await place(page, 'Floor Rack 1400', r.minX + 2000, r.minY + 2000);

  // A second layout, as a copy of the first.
  await page.getByRole('button', { name: '+ Layout variant' }).click();
  await page.getByRole('menuitem', { name: 'Copy of this layout' }).click();
  await expect(tabs(page)).toHaveText(['Layout A', /Layout B/]);
  await expect(tab(page, 'Layout B')).toHaveAttribute('aria-selected', 'true');
  expect((await saved(page)).inventory).toHaveLength(1);

  // B gets one more rack; A keeps its one.
  await place(page, 'Floor Rack 1400', r.minX + 5000, r.minY + 2000);
  let p = await saved(page);
  expect(p.inventory).toHaveLength(2);
  await tab(page, 'Layout A').click();
  p = await saved(page);
  expect(p.inventory).toHaveLength(1);
  expect(p.variants.find((v: { name: string }) => v.name === 'Layout B').inventory).toHaveLength(2);

  // Compare side by side.
  await page.getByRole('button', { name: 'Compare', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Compare layouts' });
  const table = dialog.getByTestId('compare-table');
  await expect(table.locator('tr', { hasText: 'Fixtures' })).toContainText(/1\s*2/);
  await expect(table.locator('tr', { hasText: 'Hanger capacity' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Show' }).click();
  await expect(tab(page, 'Layout B')).toHaveAttribute('aria-selected', 'true');

  // Rename the active layout from its menu.
  await tab(page, 'Layout B').click();
  await page.getByRole('menuitem', { name: 'Rename…' }).click();
  await page.getByLabel('Layout name').fill('Volume shop');
  await page.keyboard.press('Enter');
  await expect(tabs(page)).toHaveText(['Layout A', /Volume shop/]);

  // Delete it; Undo brings it back.
  page.once('dialog', (d) => d.accept());
  await tab(page, 'Volume shop').click();
  await page.getByRole('menuitem', { name: 'Delete layout' }).click();
  await expect(page.getByRole('tablist', { name: 'Layouts' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '+ Layout variant' })).toBeVisible();
  p = await saved(page);
  expect(p.variants).toBeUndefined();
  expect(p.inventory).toHaveLength(1);
  await page.keyboard.press('Control+z');
  await expect(tabs(page)).toHaveText(['Layout A', /Volume shop/]);
  expect((await saved(page)).inventory).toHaveLength(2);
  expect(errors).toEqual([]);
});

test('an empty layout starts with just the room', async ({ page }) => {
  await openFresh(page);
  const r = await drawRoom(page);
  await place(page, 'Floor Rack 1400', r.minX + 2000, r.minY + 2000);
  await page.getByRole('button', { name: '+ Layout variant' }).click();
  await page.getByRole('menuitem', { name: 'Empty layout (just the room)' }).click();
  const p = await saved(page);
  expect(p.inventory).toHaveLength(0);
  expect(p.room.closed).toBe(true);
});

test('someone with a view-only link can look at every layout', async ({ page }) => {
  const fake = new FakeCloud();
  await openFresh(page);
  await fake.install(page);
  const rack = (id: string) => ({
    id, type: 'inventory', name: 'Rack', position: { x: 0, y: 0 }, size: { width: 1400, depth: 500, height: 1500 }, rotation: 0,
  });
  const plan = {
    schemaVersion: 1, id: 'p', name: 'Store 12', createdAt: '', updatedAt: '', units: 'mm', room: null, pillars: [],
    inventory: [rack('a')],
    variants: [{ id: 'va', name: 'Brand shop' }, { id: 'vb', name: 'Volume shop', inventory: [rack('b1'), rack('b2'), rack('b3')] }],
    activeVariantId: 'va',
  };
  const id = fake.seed('owner@bestseller.com', 'Store 12', plan);
  fake.links.set('tokvariants', { project_id: id, created_at: new Date().toISOString(), created_by_email: 'owner@bestseller.com', revoked: false });
  await page.goto('/?share=tokvariants');
  await expect(tab(page, 'Brand shop')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('button', { name: 'Add a layout' })).toHaveCount(0);
  const summary = page.locator('aside').last();
  await expect(summary.locator('div', { hasText: /^Inventory items/ }).last()).toContainText('1');
  await tab(page, 'Volume shop').click();
  await expect(tab(page, 'Volume shop')).toHaveAttribute('aria-selected', 'true');
  await expect(summary.locator('div', { hasText: /^Inventory items/ }).last()).toContainText('3');
  // Looking around changes nothing in the cloud.
  expect(fake.calls.some((c) => c.fn === 'fp_save_project')).toBe(false);
});
