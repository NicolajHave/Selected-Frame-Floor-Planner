import { test, expect, type Page } from '@playwright/test';
import { drawRoom, openFresh, saved, toScreen, trackErrors, type Bounds } from './helpers';

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

async function placeOpening(page: Page, name: string, x: number, y: number) {
  await page.getByTitle(`Place ${name}`, { exact: true }).click();
  const s = await toScreen(page, x, y);
  await page.mouse.click(s.x, s.y);
}

const openings = async (page: Page) => (await saved(page)).room.openings;
const cornerId = async (page: Page, i: number) => (await saved(page)).room.corners[i].id;

test('place a door on a wall and adjust it in the panel', async ({ page }) => {
  // Click just inside the top wall.
  await placeOpening(page, 'Door', room.minX + 3000, room.minY + 150);
  const [door] = await openings(page);
  expect(door).toMatchObject({ kind: 'door', width: 900, height: 2100, hinge: 'start', swing: 'in' });
  expect(door.wallStartCornerId).toBe(await cornerId(page, 0));
  expect(door.offset).toBeCloseTo(3000, -2);
  await expect(page.locator(`[data-opening="${door.id}"]`)).toBeVisible();

  const panel = page.locator('aside').last();
  await expect(panel).toContainText('On wall 1');
  await page.getByRole('spinbutton', { name: 'From wall start mm' }).fill('1000');
  await page.getByRole('spinbutton', { name: 'From wall start mm' }).press('Enter');
  await page.getByRole('spinbutton', { name: 'Width mm' }).fill('1000');
  await page.getByRole('spinbutton', { name: 'Width mm' }).press('Enter');
  // Offset is the centre: 1000 from the start + half the new width.
  await expect.poll(async () => (await openings(page))[0]).toMatchObject({ width: 1000, offset: 1450 });

  await page.getByRole('radio', { name: 'Outwards' }).click();
  expect((await openings(page))[0].swing).toBe('out');
  await page.keyboard.press('r');
  expect((await openings(page))[0].hinge).toBe('end');
  await page.keyboard.press('Control+z');
  expect((await openings(page))[0].hinge).toBe('start');
});

test('drag a door along its wall and onto another wall', async ({ page }) => {
  await placeOpening(page, 'Double door', room.minX + 3000, room.minY + 150);
  const [door] = await openings(page);

  const start = await toScreen(page, room.minX + 3000, room.minY);
  const along = await toScreen(page, room.minX + 6000, room.minY);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(along.x, along.y, { steps: 6 });
  await page.mouse.up();
  let [moved] = await openings(page);
  expect(moved.wallStartCornerId).toBe(door.wallStartCornerId);
  expect(moved.offset).toBeGreaterThan(5000);

  // Onto the right wall (starts at corner 1).
  const from = await toScreen(page, room.minX + moved.offset, room.minY);
  const right = await toScreen(page, room.maxX - 100, room.minY + 3000);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(right.x, right.y, { steps: 8 });
  await page.mouse.up();
  [moved] = await openings(page);
  expect(moved.wallStartCornerId).toBe(await cornerId(page, 1));
  expect(moved.offset).toBeCloseTo(3000, -2);

  // The whole drag is one undo step.
  await page.keyboard.press('Control+z');
  expect((await openings(page))[0].wallStartCornerId).toBe(door.wallStartCornerId);
});

test('windows get a sill; deleting removes the opening', async ({ page }) => {
  await placeOpening(page, 'Window', room.maxX - 150, room.minY + 3000);
  const [win] = await openings(page);
  expect(win).toMatchObject({ kind: 'window', sillHeight: 900, height: 2100 });
  await expect(page.getByRole('spinbutton', { name: 'Sill height mm' })).toHaveValue('900');
  await page.keyboard.press('Delete');
  expect(await openings(page)).toHaveLength(0);
});

test('clicking away from any wall explains where doors go', async ({ page }) => {
  await placeOpening(page, 'Door', (room.minX + room.maxX) / 2, (room.minY + room.maxY) / 2);
  expect(await openings(page)).toHaveLength(0);
  await expect(page.getByRole('status')).toContainText('Click on a wall');
});

test('a corner inserted into the wall keeps the door in place', async ({ page }) => {
  await placeOpening(page, 'Door', room.minX + 7000, room.minY + 150);
  await page.keyboard.press('Escape');
  // A click selects the wall; a double-click inserts a corner there.
  const split = await toScreen(page, room.minX + 3000, room.minY);
  await page.mouse.click(split.x, split.y);
  expect((await saved(page)).room.corners).toHaveLength(4);
  await expect(page.locator('aside').last()).toContainText('Wall 1');
  await page.mouse.dblclick(split.x, split.y);
  const p = await saved(page);
  expect(p.room.corners).toHaveLength(5);
  const [door] = p.room.openings;
  const anchor = p.room.corners.find((c: { id: string }) => c.id === door.wallStartCornerId);
  expect(anchor.point.x + door.offset).toBeCloseTo(room.minX + 7000, -2);
});

test('openings cut holes in the 3D walls', async ({ page }) => {
  await placeOpening(page, 'Door', room.minX + 3000, room.minY + 150);
  await placeOpening(page, 'Window', room.maxX - 150, room.minY + 3000);
  await page.getByRole('button', { name: '3D View' }).click();
  await expect(page.locator('canvas')).toBeVisible();
  await page.waitForTimeout(1500);
  expect(await openings(page)).toHaveLength(2);
});

test('doors keep clear of corners and of each other; a full wall says so', async ({ page }) => {
  // Clicked right on the corner: placed (not grabbing the corner), slid out
  // to the inside face of the side wall.
  await placeOpening(page, 'Door', room.minX + 30, room.minY + 10);
  expect((await saved(page)).room.corners[0].point).toEqual({ x: room.minX, y: room.minY });
  expect((await openings(page))[0].offset).toBe(510);
  // A window clicked onto the door lands next to it instead.
  await placeOpening(page, 'Window', room.minX + 600, room.minY + 100);
  const [d, w] = await openings(page);
  expect(w.offset - w.width / 2).toBeGreaterThanOrEqual(d.offset + d.width / 2 + 50);

  // The placement preview follows the pointer along the wall.
  await page.getByTitle('Place Double door', { exact: true }).click();
  const s = await toScreen(page, room.minX + 6000, room.minY + 100);
  await page.mouse.move(s.x, s.y);
  await expect(page.locator('[data-opening-preview="double-door"]')).toBeVisible();
  await page.keyboard.press('Escape');
});

test('drag the ends of a window to resize it, and set its height and sill', async ({ page }) => {
  await placeOpening(page, 'Window', room.minX + 5000, room.minY + 100);
  const [win] = await openings(page);
  expect(win).toMatchObject({ offset: 5000, width: 1200 });

  // Pull the end handle 400 mm further along the wall: the start stays put.
  const handle = page.locator(`[data-opening="${win.id}"] [data-opening-end="end"]`);
  const box = (await handle.boundingBox())!;
  const to = await toScreen(page, room.minX + 6000, room.minY);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => (await openings(page))[0]).toMatchObject({ width: 1600, offset: 5200 });

  // Window height and sill: the top follows.
  const height = page.getByRole('spinbutton', { name: 'Window height mm' });
  await expect(height).toHaveValue('1200');
  await height.fill('1500');
  await height.press('Enter');
  await expect.poll(async () => (await openings(page))[0]).toMatchObject({ sillHeight: 900, height: 2400 });
  const sill = page.getByRole('spinbutton', { name: 'Sill height mm' });
  await sill.fill('600');
  await sill.press('Enter');
  await expect.poll(async () => (await openings(page))[0]).toMatchObject({ sillHeight: 600, height: 2100 });
  await expect(page.locator('aside').last()).toContainText('Top of the window at 2.100 mm');
});

test('dragging a door towards a corner keeps it on its wall', async ({ page }) => {
  await placeOpening(page, 'Door', room.minX + 3000, room.minY + 100);
  const [door] = await openings(page);
  const from = await toScreen(page, room.minX + 3000, room.minY);
  // Past the corner and a little down the side wall: still on wall 1, stopped at the corner.
  const to = await toScreen(page, room.minX - 200, room.minY + 300);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
  const [moved] = await openings(page);
  expect(moved.wallStartCornerId).toBe(door.wallStartCornerId);
  expect(moved.offset).toBe(510);
});
