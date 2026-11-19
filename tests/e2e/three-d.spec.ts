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

test('3D view: electrical points are dragged along their wall, up and down it, and over the floor', async ({ page }) => {
  test.slow(); // five drags, each found again on screen first
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
  const drag = async (from: readonly [number, number], to: readonly [number, number]) => {
    await page.mouse.move(...from);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) await page.mouse.move(from[0] + ((to[0] - from[0]) * i) / 10, from[1] + ((to[1] - from[1]) * i) / 10);
    await page.mouse.up();
  };
  /** Where the point near (x, y) is on screen: the middle of where the pointer turns into a hand. */
  const handNear = async (x: number, y: number) => {
    const found = await canvas.evaluate(
      (c, [x0, y0]) => {
        let n = 0;
        let sx = 0;
        let sy = 0;
        for (let dy = -80; dy <= 80; dy += 3) {
          for (let dx = -60; dx <= 60; dx += 3) {
            c.dispatchEvent(new PointerEvent('pointermove', { clientX: x0! + dx, clientY: y0! + dy, bubbles: true, pointerId: 1, pointerType: 'mouse' }));
            if ((c as HTMLElement).style.cursor !== 'grab') continue;
            n++;
            sx += dx;
            sy += dy;
          }
        }
        return n ? ([x0! + sx / n, y0! + sy / n] as const) : null;
      },
      [x, y] as const,
    );
    expect(found, 'a point to take hold of').not.toBeNull();
    return found!;
  };

  // A socket is put 300 mm up the wall, below where the wall was clicked.
  await page.getByTitle('Place Socket', { exact: true }).click();
  await page.mouse.click(...at(0.3, 0.34));
  await expect.poll(async () => (await points()).length).toBe(1);
  const placed = (await points())[0];
  const [sx, sy] = await handNear(...at(0.3, 0.4));

  // A press without a drag selects and moves nothing.
  await page.mouse.click(sx, sy);
  expect((await points())[0]).toEqual(placed);

  // Level across the screen: along the wall. The wall runs at a slant in perspective, and the height stays as it was.
  await drag([sx, sy], [sx - cb.width * 0.1, sy + 4]);
  const along = (await points())[0];
  expect(along.wallStartCornerId).toBe(placed.wallStartCornerId);
  expect(Math.abs(along.offset - placed.offset)).toBeGreaterThan(1000);
  expect(along.offset % 10).toBe(0);
  expect(along.height).toBe(300);

  // Straight up: the height follows, in steps of 50 mm, where it is on the wall; the panel shows it.
  const [ax, ay] = await handNear(sx - cb.width * 0.1, sy + 30);
  await drag([ax, ay], [ax + 3, ay - cb.height * 0.12]);
  const up = (await points())[0];
  expect(up.height).toBeGreaterThan(1000);
  expect(up.height % 50).toBe(0);
  expect(up.offset).toBe(along.offset);
  expect(up.wallStartCornerId).toBe(placed.wallStartCornerId);
  await expect(page.getByTestId('details-panel').getByRole('spinbutton', { name: 'Height mm', exact: true })).toHaveValue(String(up.height));

  // Round the corner: on to the other wall in view, at the height it has.
  const [bx, by] = await handNear(ax, ay - cb.height * 0.12);
  await drag([bx, by], at(0.62, 0.3));
  const round = (await points())[0];
  expect(round.wallStartCornerId).not.toBe(placed.wallStartCornerId);
  expect(round.height).toBe(up.height);

  // Straight down, past the floor: to the foot of the wall, and no further.
  const [rx, ry] = await handNear(...at(0.62, 0.3));
  await drag([rx, ry], [rx + 2, ry + cb.height * 0.4]);
  const down = (await points())[0];
  expect(down).toMatchObject({ wallStartCornerId: round.wallStartCornerId, offset: round.offset, height: 50 });

  // Each drag is one undo step.
  await page.keyboard.press('Control+z');
  expect((await points())[0]).toEqual(round);
  await page.keyboard.press('Control+z');
  expect((await points())[0]).toEqual(up);
  await page.keyboard.press('Control+z');
  expect((await points())[0]).toEqual(along);
  await page.keyboard.press('Control+z');
  expect((await points())[0]).toEqual(placed);

  // A floor box is dragged over the floor.
  await page.getByTitle('Place Floor box', { exact: true }).click();
  await page.mouse.click(...at(0.5, 0.62));
  await expect.poll(async () => (await points()).length).toBe(2);
  const box = (await points())[1];
  await drag(at(0.5, 0.62), at(0.58, 0.7));
  const dragged = (await points())[1];
  expect(Math.hypot(dragged.position.x - box.position.x, dragged.position.y - box.position.y)).toBeGreaterThan(300);
  expect(dragged.height).toBe(0);
  await page.keyboard.press('Control+z');
  expect((await points())[1]).toEqual(box);

  expect(errors).toEqual([]);
});
