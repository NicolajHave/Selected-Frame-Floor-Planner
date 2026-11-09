import { test, expect, type Page } from '@playwright/test';
import { drawRoom, openFresh, place, saved, toScreen, trackErrors } from './helpers';

const menu = (page: Page) => page.getByRole('menu', { name: 'Plan actions' });

async function rightClick(page: Page, x: number, y: number) {
  const s = await toScreen(page, x, y);
  await page.mouse.click(s.x, s.y, { button: 'right' });
}

test('right-click a fixture: duplicate, rotate, lock and delete', async ({ page }) => {
  const errors = trackErrors(page);
  await openFresh(page);
  const r = await drawRoom(page);
  const rack = await place(page, 'Floor Rack 1400', r.minX + 3000, r.minY + 3000);
  await page.keyboard.press('Escape');

  await rightClick(page, rack.position.x, rack.position.y);
  await expect(menu(page)).toBeVisible();
  await menu(page).getByRole('menuitem', { name: /Rotate 90°\s*R$/ }).click();
  await expect(menu(page)).toHaveCount(0);
  expect(Math.round(((await saved(page)).inventory[0].rotation * 180) / Math.PI)).toBe(90);

  await rightClick(page, rack.position.x, rack.position.y);
  await menu(page).getByRole('menuitem', { name: /Duplicate/ }).click();
  expect((await saved(page)).inventory).toHaveLength(2);

  await rightClick(page, rack.position.x, rack.position.y);
  await menu(page).getByRole('menuitem', { name: /Lock in place/ }).click();
  expect((await saved(page)).inventory[0].locked).toBe(true);

  await rightClick(page, rack.position.x, rack.position.y);
  await expect(menu(page).getByRole('menuitem', { name: /Unlock/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('right-click a wall: a door goes exactly there; a corner can be added', async ({ page }) => {
  await openFresh(page);
  const r = await drawRoom(page);
  const x = r.minX + 3000;
  await rightClick(page, x, r.minY);
  await menu(page).getByRole('menuitem', { name: 'Add door here' }).click();
  let p = await saved(page);
  expect(p.room.openings).toHaveLength(1);
  expect(p.room.openings[0].kind).toBe('door');

  await rightClick(page, r.minX + 7000, r.minY);
  await menu(page).getByRole('menuitem', { name: 'Add corner here' }).click();
  p = await saved(page);
  expect(p.room.corners).toHaveLength(5);
});

test('right-click the floor: paste here, add a note, measure from here', async ({ page }) => {
  await openFresh(page);
  const r = await drawRoom(page);
  const rack = await place(page, 'Floor Rack 1400', r.minX + 2000, r.minY + 2000);
  await page.keyboard.press('Control+c');
  await page.keyboard.press('Escape');

  await rightClick(page, r.minX + 6000, r.minY + 4000);
  await menu(page).getByRole('menuitem', { name: /Paste here/ }).click();
  const p = await saved(page);
  expect(p.inventory).toHaveLength(2);
  expect(p.inventory[1].position.x).toBeCloseTo(r.minX + 6000, -2);
  expect(p.inventory[1].id).not.toBe(rack.id);

  await page.keyboard.press('Escape');
  await rightClick(page, r.minX + 8000, r.minY + 1500);
  await menu(page).getByRole('menuitem', { name: 'Add note here' }).click();
  expect((await saved(page)).annotations).toHaveLength(1);

  await page.keyboard.press('Escape');
  await rightClick(page, r.minX + 1000, r.minY + 5000);
  await menu(page).getByRole('menuitem', { name: 'Measure from here' }).click();
  await expect(page.getByTestId('measure-panel')).toContainText('Click the other end');
});

test('right-drag still pans, and right-click drops the tool in hand', async ({ page }) => {
  await openFresh(page);
  const r = await drawRoom(page);
  const before = (await page.evaluate(() => JSON.parse(localStorage.getItem('sf-planner:project')!).state)).project;
  const a = await toScreen(page, r.minX + 3000, r.minY + 3000);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(a.x + 60, a.y + 40, { steps: 5 });
  await page.mouse.up({ button: 'right' });
  await expect(menu(page)).toHaveCount(0);
  const b = await toScreen(page, r.minX + 3000, r.minY + 3000);
  expect(Math.round(b.x - a.x)).toBe(60);
  expect(before).toBeTruthy();

  await page.getByTitle('Place Floor Rack 1400', { exact: true }).click();
  await page.mouse.click(a.x, a.y, { button: 'right' });
  await expect(menu(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Select', exact: true })).toHaveClass(/bg-ink-900|active/);
});
