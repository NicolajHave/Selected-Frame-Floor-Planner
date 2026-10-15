import { test, expect, type Page } from '@playwright/test';
import { drawRoom, openFresh, saved, toScreen, trackErrors, type Bounds } from './helpers';
import { exportPdf, pageWith, pdfText } from './pdf';

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

async function placeAt(page: Page, title: string, x: number, y: number) {
  await page.getByTitle(`Place ${title}`, { exact: true }).click();
  const s = await toScreen(page, x, y);
  await page.mouse.click(s.x, s.y);
}

const points = async (page: Page) => (await saved(page)).electrical ?? [];

test('put sockets, data and logo power on the walls and a floor box on the floor', async ({ page }) => {
  await placeAt(page, 'Double socket', room.minX + 2500, room.minY + 100);
  let [socket] = await points(page);
  expect(socket).toMatchObject({ kind: 'double-socket', offset: 2500, height: 300 });
  expect(socket.wallStartCornerId).toBe((await saved(page)).room.corners[0].id);
  await expect(page.locator(`[data-electrical="${socket.id}"]`)).toBeVisible();

  // Height and a note for the electrician.
  await page.getByRole('spinbutton', { name: 'Height mm' }).fill('1200');
  await page.getByRole('spinbutton', { name: 'Height mm' }).press('Enter');
  await page.getByRole('textbox', { name: 'Note' }).fill('Behind the shelves');
  await page.getByRole('textbox', { name: 'Note' }).press('Enter');
  [socket] = await points(page);
  expect(socket).toMatchObject({ height: 1200, note: 'Behind the shelves' });

  // Drag it along its wall; it stays on that wall even when pulled past the corner.
  const from = await toScreen(page, room.minX + 2500, room.minY + 100);
  const to = await toScreen(page, room.minX - 300, room.minY + 200);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
  [socket] = await points(page);
  expect(socket.wallStartCornerId).toBe((await saved(page)).room.corners[0].id);
  expect(socket.offset).toBe(60); // the inside face of the side wall

  // A wall point needs a wall …
  await placeAt(page, 'LED logo power', (room.minX + room.maxX) / 2, (room.minY + room.maxY) / 2);
  expect(await points(page)).toHaveLength(1);
  await expect(page.getByRole('status')).toContainText('Click on a wall');
  // … a floor box goes anywhere on the floor.
  await page.getByTitle('Place Floor box', { exact: true }).click();
  const mid = await toScreen(page, room.minX + 5000, room.minY + 3500);
  await page.mouse.click(mid.x, mid.y);
  const box = (await points(page))[1];
  expect(box).toMatchObject({ kind: 'floor-box', height: 0, position: { x: room.minX + 5000, y: room.minY + 3500 } });

  await page.keyboard.press('Delete');
  expect(await points(page)).toHaveLength(1);
  await page.keyboard.press('Control+z');
  expect(await points(page)).toHaveLength(2);
});

test('notes with an arrow on the plan', async ({ page }) => {
  await placeAt(page, 'Note', room.minX + 4000, room.minY + 5000);
  const text = page.getByRole('textbox', { name: 'Note text' });
  await expect(text).toBeFocused();
  await text.fill('Power needed behind the shelves');
  await page.getByRole('button', { name: 'Add arrow' }).click();
  const [note] = (await saved(page)).annotations;
  expect(note).toMatchObject({ text: 'Power needed behind the shelves', position: { x: room.minX + 4000, y: room.minY + 5000 } });
  expect(note.target).toBeTruthy();
  await expect(page.locator(`[data-note="${note.id}"]`)).toContainText('Power needed behind the shelves');

  // Point the arrow somewhere else.
  const handle = page.locator(`[data-note-target="${note.id}"]`);
  const b = (await handle.boundingBox())!;
  const to = await toScreen(page, room.minX + 2000, room.minY + 600);
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
  const [moved] = (await saved(page)).annotations;
  expect(moved.target.x).toBeCloseTo(room.minX + 2000, -2);
  expect(moved.target.y).toBeCloseTo(room.minY + 600, -2);
});

test('the PDF has an electrical plan, outlets in the elevations and notes on the plan', async ({ page }) => {
  test.setTimeout(90_000);
  await placeAt(page, 'Double socket', room.minX + 2500, room.minY + 100);
  await placeAt(page, 'LED logo power', room.minX + 6000, room.minY + 100);
  await page.getByRole('textbox', { name: 'Note' }).fill('Hidden connection');
  await page.getByRole('textbox', { name: 'Note' }).press('Enter');
  await placeAt(page, 'Network', room.maxX - 100, room.minY + 2000);
  await placeAt(page, 'Note', room.minX + 4000, room.minY + 5000);
  await page.getByRole('textbox', { name: 'Note text' }).fill('Check the floor level');
  await page.getByRole('textbox', { name: 'Note text' }).blur();

  const pages = await pdfText((await exportPdf(page)).file);
  const electrical = pageWith(pages, 'Electrical Plan');
  expect(electrical).toContain('ELECTRICAL');
  for (const s of ['E1', 'E2', 'E3', 'Double socket', 'LED logo power', 'Network']) expect(electrical).toContain(s);
  expect(electrical).toContain('wall 1 · 2.500 mm up · Hidden connection');
  expect(pageWith(pages, 'Plan View')).toContain('Check the floor level');
  const elevations = pages.filter((p) => p.startsWith('Elevations')).join(' ');
  expect(elevations).toContain('E1');
  expect(elevations).toContain('2.500'); // logo power height on the ladder
});
