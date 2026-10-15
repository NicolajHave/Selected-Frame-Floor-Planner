import { test, expect } from '@playwright/test';
import { deg, drawRoom, openFresh, saved, trackErrors } from './helpers';

test('3D view: place from the library, drag, undo and rotate', async ({ page }) => {
  const errors = trackErrors(page);
  await openFresh(page);
  await drawRoom(page);

  await page.getByRole('button', { name: '3D View' }).click();
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  await page.waitForTimeout(1500); // first WebGL frames + model loads

  const cb = (await canvas.boundingBox())!;
  const fx = cb.x + cb.width * 0.5;
  const fy = cb.y + cb.height * 0.62;

  await page.getByTitle('Place Tall Oak Podium', { exact: true }).click();
  await page.mouse.click(fx, fy);
  await expect.poll(async () => (await saved(page)).inventory.length).toBe(1);
  const podium = (await saved(page)).inventory[0];
  expect(podium.name).toBe('Tall Oak Podium');

  await page.waitForTimeout(800); // let the GLB load so the ray hits the model
  await page.mouse.move(fx, fy - 10);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(fx + i * 12, fy - 10 + i * 3);
  await page.mouse.up();

  const moved = (await saved(page)).inventory[0].position;
  expect(Math.hypot(moved.x - podium.position.x, moved.y - podium.position.y)).toBeGreaterThan(300);

  await page.keyboard.press('Control+z');
  expect((await saved(page)).inventory[0].position).toEqual(podium.position);

  await page.keyboard.press('Control+Shift+z');
  await page.keyboard.press('r');
  expect(deg((await saved(page)).inventory[0].rotation)).toBe(90);

  expect(errors).toEqual([]);
});
