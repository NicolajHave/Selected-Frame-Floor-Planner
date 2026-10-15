import { test, expect } from '@playwright/test';
import { drawRoom, openFresh, place, saved, toScreen, trackErrors, type Bounds } from './helpers';

let room: Bounds;
let errors: string[];

test.beforeEach(async ({ page }) => {
  errors = trackErrors(page);
  await openFresh(page);
  room = await drawRoom(page);
});

test.afterEach(() => {
  expect(errors, 'console errors').toEqual([]);
});

const issues = (page: import('@playwright/test').Page) => page.getByTestId('layout-issues');

test('narrow aisle, overlap and the configurable minimum', async ({ page }) => {
  const y = room.minY + 3000;
  const a = await place(page, 'Floor Rack 1400', room.minX + 2000, y);
  // 1310 wide racks, centres 1700 apart → 390 mm between them
  await place(page, 'Floor Rack 1400', room.minX + 3700, y);
  await page.keyboard.press('Escape');

  await expect(issues(page)).toContainText('Only 390 mm between Floor Rack 1400 and Floor Rack 1400.');
  await expect(page.locator('footer')).toContainText('1 layout issue');
  await expect(page.locator('[data-layer="issues"] [data-dimension="390"]')).toBeVisible();

  // Drag the first rack onto the second: now they overlap.
  const s = await toScreen(page, a.position.x, a.position.y);
  const t = await toScreen(page, a.position.x + 1000, a.position.y);
  await page.mouse.move(s.x, s.y);
  await page.mouse.down();
  await page.mouse.move(t.x, t.y, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.press('Escape');
  await expect(issues(page)).toContainText('overlap');
  await expect(page.locator('[data-issue-object]')).toHaveCount(2);

  // Clicking the issue selects the object; its panel repeats the problem.
  await issues(page).getByRole('button').first().click();
  await expect(page.locator('aside').last()).toContainText('Floor Rack 1400 and Floor Rack 1400 overlap.');

  await page.keyboard.press('Control+z');
  await page.keyboard.press('Escape');
  await expect(issues(page)).toContainText('Only 390 mm');

  await page.getByRole('spinbutton', { name: 'Minimum aisle mm' }).fill('300');
  await page.getByRole('spinbutton', { name: 'Minimum aisle mm' }).press('Enter');
  await expect(page.getByText('No overlaps, blocked doors or narrow aisles.')).toBeVisible();
  expect((await saved(page)).minAisle).toBe(300);

  // The plan marks can be hidden.
  await page.getByRole('spinbutton', { name: 'Minimum aisle mm' }).fill('900');
  await page.getByRole('spinbutton', { name: 'Minimum aisle mm' }).press('Enter');
  await expect(page.locator('[data-layer="issues"]')).toHaveCount(1);
  await page.getByLabel('Show problems on the plan').uncheck();
  await expect(page.locator('[data-layer="issues"]')).toHaveCount(0);
});

test('items in the swing of a door are flagged', async ({ page }) => {
  await page.getByTitle('Place Door', { exact: true }).click();
  const d = await toScreen(page, room.minX + 5000, room.minY + 150);
  await page.mouse.click(d.x, d.y);
  await place(page, 'Tall Oak Podium', room.minX + 5000, room.minY + 700);
  await page.keyboard.press('Escape');
  await expect(issues(page)).toContainText('Tall Oak Podium blocks a door.');
});

test('selected objects show distances to walls and neighbours', async ({ page }) => {
  const y = room.minY + 3000;
  await place(page, 'Floor Rack 1400', room.minX + 2000, y);
  await place(page, 'Floor Rack 1400', room.minX + 5000, y);
  // Last placed is selected: left face at 5000 − 655, neighbour's right face at 2000 + 655.
  const guides = page.locator('[data-layer="guides"] [data-dimension]');
  await expect(guides).toHaveCount(4);
  await expect(page.locator('[data-layer="guides"] [data-dimension="1690"]')).toBeVisible();
  // Right: inner face of the right wall is 60 mm inside it.
  const right = room.maxX - 60 - (room.minX + 5000 + 655);
  await expect(page.locator(`[data-layer="guides"] [data-dimension="${Math.round(right)}"]`)).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(guides).toHaveCount(0);
});
