import { expect, test, type Page } from '@playwright/test';
import { drawRoom, openFresh, place, saved, toScreen, trackErrors } from './helpers';

/** Press at one world point and drag to another. */
async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  const a = await toScreen(page, from.x, from.y);
  const b = await toScreen(page, to.x, to.y);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await page.mouse.up();
}

test('lock the floor layout: walls, doors and windows stay put, fixtures still move', async ({ page }) => {
  const errors = trackErrors(page);
  await openFresh(page);
  const room = await drawRoom(page);
  await page.getByTitle('Place Door', { exact: true }).click();
  const d = await toScreen(page, room.minX + 3000, room.minY + 150);
  await page.mouse.click(d.x, d.y);
  const rack = await place(page, 'Floor Rack 1400', room.minX + 4000, room.minY + 3000);
  await page.keyboard.press('Escape');

  const lock = page.getByRole('button', { name: 'Lock layout' });
  await lock.click();
  await expect(page.getByRole('button', { name: 'Layout locked' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Draw area' })).toBeDisabled();
  await expect(page.getByTitle('Place Window', { exact: true })).toBeDisabled();
  expect((await saved(page)).layoutLocked).toBe(true);

  // A corner can't be dragged; the plan says why.
  const before = await saved(page);
  const corner = before.room.corners[0].point;
  await drag(page, corner, { x: corner.x - 800, y: corner.y - 600 });
  await expect(page.getByText(/floor layout is locked/i).first()).toBeVisible();
  // Nor can the door be slid along its wall.
  const door = before.room.openings[0];
  await drag(page, { x: room.minX + door.offset, y: room.minY }, { x: room.minX + door.offset + 1500, y: room.minY });
  const after = await saved(page);
  expect(after.room.corners).toEqual(before.room.corners);
  expect(after.room.openings).toEqual(before.room.openings);
  // The door's panel is read-only.
  await expect(page.getByTestId('layout-locked')).toBeVisible();

  // The rack still moves.
  await drag(page, rack.position, { x: rack.position.x + 1000, y: rack.position.y });
  const moved = (await saved(page)).inventory[0];
  expect(moved.position.x - rack.position.x).toBeCloseTo(1000, -1);

  // Unlocked again, the corner drags.
  await page.getByRole('button', { name: 'Layout locked' }).click();
  await drag(page, corner, { x: corner.x - 800, y: corner.y - 600 });
  expect((await saved(page)).room.corners[0].point).not.toEqual(corner);
  expect(errors, 'console errors').toEqual([]);
});

test('lock single fixtures in place; a group move leaves them where they are', async ({ page }) => {
  const errors = trackErrors(page);
  await openFresh(page);
  const room = await drawRoom(page);
  const a = await place(page, 'Floor Rack 1400', room.minX + 2500, room.minY + 3000);
  const b = await place(page, 'Floor Rack 700', room.minX + 5500, room.minY + 3000);

  // b is selected after placing: L locks it.
  await page.keyboard.press('l');
  await expect(page.getByRole('button', { name: /Locked in place/ })).toBeVisible();
  await expect(page.getByTestId('lock-badge')).toHaveCount(1);
  expect((await saved(page)).inventory[1].locked).toBe(true);

  // It can't be dragged, turned or deleted.
  await drag(page, b.position, { x: b.position.x + 1000, y: b.position.y + 800 });
  await page.keyboard.press('r');
  await page.keyboard.press('Delete');
  let inv = (await saved(page)).inventory;
  expect(inv).toHaveLength(2);
  expect(inv[1].position).toEqual(b.position);
  expect(inv[1].rotation).toBe(b.rotation);
  await expect(page.getByText(/is locked in place/).first()).toBeVisible();
  await expect(page.getByLabel('X')).toBeDisabled();

  // Select both and drag: only the unlocked one moves.
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+a');
  await expect(page.getByTestId('group-locked')).toHaveText(/1 of them is locked/);
  await drag(page, a.position, { x: a.position.x, y: a.position.y + 1000 });
  inv = (await saved(page)).inventory;
  expect(inv[0].position.y - a.position.y).toBeCloseTo(1000, -1);
  expect(inv[1].position).toEqual(b.position);

  // Unlock all from the group panel; then both move.
  await page.getByRole('button', { name: 'Unlock all' }).click();
  expect((await saved(page)).inventory[1].locked).toBeUndefined();
  await expect(page.getByTestId('lock-badge')).toHaveCount(0);
  expect(errors, 'console errors').toEqual([]);
});
