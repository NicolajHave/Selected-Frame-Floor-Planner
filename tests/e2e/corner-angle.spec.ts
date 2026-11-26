import { test, expect, type Page } from '@playwright/test';
import { drawRoom, openFresh, saved, toScreen, trackErrors } from './helpers';

type Pt = { id: string; point: { x: number; y: number } };
const corners = async (page: Page): Promise<Pt[]> => (await saved(page)).room.corners;
const length = (c: Pt[], i: number) => {
  const a = c[i]!.point;
  const b = c[(i + 1) % c.length]!.point;
  return Math.hypot(b.x - a.x, b.y - a.y);
};
const TAN10 = Math.tan((10 * Math.PI) / 180);

test('type the angle of a corner: the chosen wall turns about it, and the plan shows which', async ({ page }) => {
  const errors = trackErrors(page);
  await openFresh(page);
  const room = await drawRoom(page);
  const w = room.maxX - room.minX;
  const h = room.maxY - room.minY;

  // A door on the bottom wall, which starts at the corner that is about to move.
  await page.getByTitle('Place Door', { exact: true }).click();
  const d = await toScreen(page, room.minX + 3000, room.maxY);
  await page.mouse.click(d.x, d.y);
  await expect.poll(async () => (await saved(page)).room.openings.length).toBe(1);
  const doorX = async () => {
    const r = (await saved(page)).room;
    const start = r.corners.find((c: Pt) => c.id === r.openings[0].wallStartCornerId).point;
    return start.x - r.openings[0].offset; // the bottom wall runs right to left
  };
  const doorAt = await doorX();

  // Select the top right corner: between wall 1 (the top) and wall 2 (the right side).
  const c = await toScreen(page, room.maxX, room.minY);
  await page.mouse.click(c.x, c.y);
  const panel = page.getByTestId('details-panel');
  await expect(panel).toContainText('Between wall 1 and wall 2');
  const angle = panel.getByRole('spinbutton', { name: 'Angle °', exact: true });
  await expect(angle).toHaveValue('90');
  // On the plan the wall that turns is picked out: wall 2, the one leaving the corner.
  const turning = page.locator('[data-turning-wall]');
  await expect(turning).toHaveAttribute('data-turning-wall', '2');
  await expect(page.locator('[data-wall-number="2"] circle')).toHaveAttribute('fill', '#B45309');
  await expect(page.locator('[data-wall-number="1"] circle')).not.toHaveAttribute('fill', '#B45309');
  await expect(panel).toContainText('Its far end follows wall 3, which keeps its direction');

  // 100°: wall 2 swings outwards about the corner; its far end slides along the bottom wall.
  const before = await corners(page);
  await angle.fill('100');
  await angle.press('Enter');
  await expect.poll(async () => (await corners(page))[2]!.point.x).toBeCloseTo(room.maxX + h * TAN10, 0);
  const wide = await corners(page);
  expect(wide[2]!.point.y).toBeCloseTo(room.maxY, 1);
  [0, 1, 3].forEach((i) => expect(wide[i]).toEqual(before[i]));
  await expect(angle).toHaveValue('100');
  // The door stayed where it was on the bottom wall, though that wall's start moved.
  expect(await doorX()).toBeCloseTo(doorAt, 1);

  // The other wall of the corner: now the top wall is the one marked, and the one that turns.
  await panel.getByRole('radio', { name: 'Wall 1' }).click();
  await expect(turning).toHaveAttribute('data-turning-wall', '1');
  await expect(panel).toContainText('Wall 1 turns about this corner and wall 2 stays');
  await angle.fill('90');
  await angle.press('Enter');
  // Square to the slanted wall 2 again: the top left corner slid down the left wall.
  await expect.poll(async () => (await corners(page))[0]!.point.y).toBeCloseTo(room.minY + w * TAN10, 0);
  const squared = await corners(page);
  expect(squared[0]!.point.x).toBeCloseTo(room.minX, 1);
  [1, 2, 3].forEach((i) => expect(squared[i]).toEqual(wide[i]));

  // Keeping the wall's length: it only swings, and the wall beyond turns with its end.
  await panel.getByRole('checkbox', { name: 'Wall 1 keeps its length' }).check();
  await expect(panel).toContainText('It keeps its length, so wall 4 turns with its far end');
  const top = length(squared, 0);
  await panel.getByRole('button', { name: 'Angle up' }).click();
  await expect(angle).toHaveValue('91');
  const swung = await corners(page);
  expect(length(swung, 0)).toBeCloseTo(top, 1);
  expect(swung[0]!.point.x).not.toBeCloseTo(room.minX, 0);

  // The square-corner button, and each change is one undo step.
  await panel.getByRole('button', { name: '90°' }).click();
  await expect(angle).toHaveValue('90');
  await expect(panel.getByRole('button', { name: '90°' })).toBeDisabled();
  for (let i = 0; i < 4; i++) await page.keyboard.press('Control+z');
  expect(await corners(page)).toEqual(before);
  expect(await doorX()).toBeCloseTo(doorAt, 1);
  expect(errors).toEqual([]);
});

test('an angle the wall beyond cannot follow: the wall keeps its length, and says so', async ({ page }) => {
  await openFresh(page);
  const room = await drawRoom(page);
  const h = room.maxY - room.minY;
  const c = await toScreen(page, room.maxX, room.minY);
  await page.mouse.click(c.x, c.y);
  const angle = page.getByTestId('details-panel').getByRole('spinbutton', { name: 'Angle °', exact: true });
  // Straight on from the top wall: wall 2 never meets the bottom wall's line.
  await angle.fill('180');
  await angle.press('Enter');
  await expect(page.getByText(/Wall 2 kept its length: at that angle it does not meet wall 3/)).toBeVisible();
  const now = await corners(page);
  expect(length(now, 1)).toBeCloseTo(h, 1);
  expect(now[2]!.point.y).toBeCloseTo(room.minY, 1);
});
