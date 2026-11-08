import { expect, test } from '@playwright/test';
import { drawRoom, openFresh, place, saved, toScreen, trackErrors } from './helpers';

test('right-drag (or Space + drag) moves the view from anywhere, even over the room and fixtures', async ({ page }) => {
  const errors = trackErrors(page);
  await openFresh(page);
  const room = await drawRoom(page);
  const rack = await place(page, 'Floor Rack 1400', room.minX + 4000, room.minY + 3000);
  const world = page.locator('g[data-layer="world"]');
  const before = await world.getAttribute('transform');

  // Right-drag starting on the rack: the view moves, the rack doesn't.
  const s = await toScreen(page, rack.position.x, rack.position.y);
  await page.mouse.move(s.x, s.y);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(s.x + 120, s.y + 60, { steps: 5 });
  await page.mouse.up({ button: 'right' });
  const after = await world.getAttribute('transform');
  expect(after).not.toBe(before);
  expect((await saved(page)).inventory[0].position).toEqual(rack.position);

  // Space + left drag inside the room does the same, and nothing on the plan moves.
  const corners = (await saved(page)).room.corners;
  const c = await toScreen(page, room.minX + 2000, room.minY + 2000);
  await page.keyboard.down('Space');
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(c.x - 100, c.y - 50, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.up('Space');
  expect(await world.getAttribute('transform')).not.toBe(after);
  expect((await saved(page)).room.corners).toEqual(corners);
  expect(errors, 'console errors').toEqual([]);
});
