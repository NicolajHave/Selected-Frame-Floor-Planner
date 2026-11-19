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

test('3D view: electrical points are placed by clicking a wall or the floor, and can be selected', async ({ page }) => {
  const errors = trackErrors(page);
  await openFresh(page);
  await drawRoom(page);
  await page.getByRole('button', { name: '3D View' }).click();
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  await page.waitForTimeout(1500); // first WebGL frames
  const cb = (await canvas.boundingBox())!;
  const at = (fx: number, fy: number) => [cb.x + cb.width * fx, cb.y + cb.height * fy] as const;
  const points = async () => (await saved(page)).electrical ?? [];
  const panel = page.getByTestId('details-panel');

  // A floor box goes where the floor is clicked.
  await page.getByTitle('Place Floor box', { exact: true }).click();
  await expect(page.getByText('Click the floor to place the floor box.')).toBeVisible();
  await page.mouse.click(...at(0.5, 0.62));
  await expect.poll(async () => (await points()).length).toBe(1);
  expect((await points())[0]).toMatchObject({ kind: 'floor-box', height: 0 });
  expect((await points())[0].position).toBeTruthy();
  await expect(panel).toContainText('Floor box');

  // A click on nothing deselects; a click on the point selects it again, and Delete removes it.
  await page.mouse.click(...at(0.93, 0.93));
  await expect(panel).not.toContainText('Floor box');
  await page.mouse.click(...at(0.5, 0.62));
  await expect(panel).toContainText('Floor box');
  await page.keyboard.press('Delete');
  await expect.poll(async () => (await points()).length).toBe(0);

  // A socket goes on the wall that is clicked, at its usual height.
  await page.getByTitle('Place Socket', { exact: true }).click();
  await expect(page.getByText(/Click a wall to place the socket — it goes 300 mm above the floor/)).toBeVisible();
  await page.mouse.click(...at(0.3, 0.34));
  await expect.poll(async () => (await points()).length).toBe(1);
  const socket = (await points())[0];
  expect(socket).toMatchObject({ kind: 'socket', height: 300 });
  expect(socket.wallStartCornerId).toBeTruthy();
  await expect(panel).toContainText('Socket');
  await expect(panel).toContainText(/On wall \d/);

  // A screen point on the other wall in view, where a click high on the wall lands.
  await page.getByTitle('Place Screen', { exact: true }).click();
  await page.mouse.click(...at(0.62, 0.22));
  await expect.poll(async () => (await points()).length).toBe(2);
  const screen = (await points())[1];
  expect(screen).toMatchObject({ kind: 'screen-power', height: 1600 });
  expect(screen.wallStartCornerId).not.toBe(socket.wallStartCornerId);

  // Each placement is one undo step.
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  expect(await points()).toEqual([]);
  expect(errors).toEqual([]);
});
