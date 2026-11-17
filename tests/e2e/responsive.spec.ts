import { test, expect, type Page } from '@playwright/test';
import { drawRoom, openFresh, place, saved } from './helpers';
import { FakeCloud, signIn } from './fakeCloud';
import { exportPdf } from './pdf';

const ME = 'planner@bestseller.com';

/** Nothing in the top bar may reach past the window's edge. */
async function barFits(page: Page) {
  const measure = () =>
    page.evaluate(() => {
      const h = document.querySelector('header')!;
      const right = Math.max(...[...h.querySelectorAll('button')].map((b) => b.getBoundingClientRect().right));
      return Math.max(h.scrollWidth - h.clientWidth, right - window.innerWidth);
    });
  // The bar refolds just after the window changes size.
  await expect.poll(measure).toBeLessThanOrEqual(1);
}

async function savedCloudPlan(page: Page, fake: FakeCloud) {
  await openFresh(page);
  await fake.install(page);
  const room = await drawRoom(page);
  await place(page, 'Volume Table', (room.minX + room.maxX) / 2, (room.minY + room.maxY) / 2);
  await signIn(page, ME);
  await page.getByRole('button', { name: 'Cloud', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Cloud plans' });
  await dialog.getByRole('button', { name: 'Save to cloud' }).click();
  await expect(dialog).toContainText('syncs automatically');
  await page.keyboard.press('Escape');
}

test('the top bar folds into menus on smaller screens; nothing is cut off', async ({ page }) => {
  const fake = new FakeCloud();
  await savedCloudPlan(page, fake);

  // Wide: everything has its own button.
  await barFits(page);
  await expect(page.getByRole('button', { name: 'Versions' })).toBeVisible();
  await expect(page.getByRole('button', { name: '+ Pillar' })).toBeVisible();

  // A 13" laptop: still every tool, the switch and the cloud buttons within reach.
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(page.locator('header')).toHaveAttribute('data-fold', /[1-3]/);
  await barFits(page);
  await expect(page.getByRole('button', { name: '3D View' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Lock room' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Draw area' })).toBeVisible();

  // Narrower: "+ Pillar / + Box / + Note" and the cloud buttons become menus.
  await page.setViewportSize({ width: 1024, height: 700 });
  await barFits(page);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('menuitemcheckbox', { name: 'Pillar' }).click();
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('menuitemcheckbox', { name: 'Pillar' })).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Cloud', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Versions' })).toBeVisible();
  await page.getByRole('menuitem', { name: 'Share' }).click();
  await expect(page.getByRole('dialog', { name: /Share/ })).toBeVisible();
  await page.keyboard.press('Escape');

  // Narrow: one Tools menu, and the side panels are drawers.
  await page.setViewportSize({ width: 760, height: 900 });
  await barFits(page);
  await page.getByRole('button', { name: 'Tools', exact: true }).click();
  await page.getByRole('menuitemcheckbox', { name: 'Measure' }).click();
  await page.getByRole('button', { name: 'Tools', exact: true }).click();
  await expect(page.getByRole('menuitemcheckbox', { name: 'Measure' })).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  await expect(page.getByTestId('library-panel')).toBeHidden();
  await expect(page.getByTestId('details-panel')).toBeHidden();
  await page.getByRole('button', { name: 'Library' }).click();
  await expect(page.getByTestId('library-panel')).toBeVisible();
  // Picking a fixture closes the drawer so the floor is free.
  await page.getByTitle('Place Volume Table', { exact: true }).click();
  await expect(page.getByTestId('library-panel')).toBeHidden();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Details' }).click();
  await expect(page.getByTestId('details-panel')).toContainText('Parts list');
  expect((await saved(page)).inventory).toHaveLength(1);
});

test('a shared link on a phone shows the shop full-screen, with the parts list in a drawer', async ({ page, browser }) => {
  const fake = new FakeCloud();
  await savedCloudPlan(page, fake);
  await exportPdf(page, { views: false });
  const [token] = [...fake.links.keys()];

  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const visitor = await phone.newPage();
  await visitor.route(/supabase\.co/, (r) => r.abort());
  await fake.install(visitor);
  await visitor.goto(`/?share=${token}&view=3d`);
  await expect(visitor.getByTestId('cloud-banner')).toContainText('view only');

  // The 3D view has the whole width; the panels are out of the way.
  const stage = await visitor.locator('[data-stage]').boundingBox();
  expect(stage!.width).toBe(390);
  expect(stage!.height).toBeGreaterThan(600);
  await expect(visitor.locator('[data-stage] canvas')).toBeVisible();
  await expect(visitor.getByTestId('library-panel')).toBeHidden();
  await expect(visitor.getByTestId('details-panel')).toBeHidden();
  await barFits(visitor);

  // Both views are one tap away, and so is the parts list.
  await visitor.getByRole('button', { name: '2D Plan' }).tap();
  await expect(visitor.locator('g[data-layer="world"]')).toBeVisible();
  await visitor.getByRole('button', { name: 'Parts & details' }).tap();
  await expect(visitor.getByTestId('details-panel')).toContainText('Volume Table');
  await visitor.getByRole('button', { name: 'Close panel' }).tap({ position: { x: 10, y: 300 } });
  await expect(visitor.getByTestId('details-panel')).toBeHidden();
  await phone.close();
});
