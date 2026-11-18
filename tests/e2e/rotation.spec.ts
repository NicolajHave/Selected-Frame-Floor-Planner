import { expect, test } from '@playwright/test';
import { deg, drawRoom, openFresh, place, saved, toScreen, trackErrors } from './helpers';

test('the rotation arrows: a click turns one degree, holding keeps turning, and a hold is one undo step', async ({ page }) => {
  const errors = trackErrors(page);
  await openFresh(page);
  const room = await drawRoom(page);
  const rack = await place(page, 'Floor Rack 1400', room.minX + 4000, room.minY + 3000);
  await page.keyboard.press('Escape');
  const at = await toScreen(page, rack.position.x, rack.position.y);
  await page.mouse.click(at.x, at.y);
  const turn = async () => deg((await saved(page)).inventory.find((i: { id: string }) => i.id === rack.id).rotation);
  expect(await turn()).toBe(0);

  const up = page.getByRole('button', { name: 'Rotation up' });
  const down = page.getByRole('button', { name: 'Rotation down' });
  // The arrows are not part of the field's own name (its label and unit).
  const field = page.getByRole('spinbutton', { name: 'Rotation °', exact: true });
  await expect(field).toHaveValue('0');

  // One click, one degree; down from 0° goes round to 359°.
  await up.click();
  expect(await turn()).toBe(1);
  await expect(field).toHaveValue('1');
  await down.click();
  await down.click();
  expect(await turn()).toBe(359);
  await up.click();
  expect(await turn()).toBe(0);

  // Held down, it keeps turning a degree at a time until it is let go.
  const box = (await up.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect.poll(turn).toBeGreaterThan(10);
  await page.mouse.up();
  const held = await turn();
  expect(held).toBe(Math.round(held)); // whole degrees
  await page.waitForTimeout(200);
  expect(await turn()).toBe(held); // and it stopped

  // The whole hold undoes in one step.
  await page.keyboard.press('ControlOrMeta+z');
  expect(await turn()).toBe(0);

  // From the keyboard too.
  await up.focus();
  await page.keyboard.press('Enter');
  expect(await turn()).toBe(1);

  // A locked fixture does not turn.
  await page.getByRole('button', { name: 'Lock fixture' }).click();
  await expect(up).toBeDisabled();
  expect(errors).toEqual([]);
});
