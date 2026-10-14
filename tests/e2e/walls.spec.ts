import { test, expect } from '@playwright/test';
import { canvas, drawRoom, openFresh, saved, toScreen, trackErrors } from './helpers';

type Pt = { point: { x: number; y: number } };
const lengths = (corners: Pt[]) =>
  corners.map((c, i) => {
    const n = corners[(i + 1) % corners.length]!;
    return Math.round(Math.hypot(n.point.x - c.point.x, n.point.y - c.point.y));
  });

test('type exact wall lengths in the room panel', async ({ page }) => {
  const errors = trackErrors(page);
  await openFresh(page);
  const room = await drawRoom(page);
  const s = await toScreen(page, room.maxX - 600, room.maxY - 600);
  await page.mouse.click(s.x, s.y); // select the room

  await expect(page.locator('[data-wall-number]')).toHaveCount(4);
  const before = lengths((await saved(page)).room.corners);

  await page.getByRole('spinbutton', { name: 'Wall 1 mm' }).fill('12340');
  await page.getByRole('spinbutton', { name: 'Wall 1 mm' }).press('Enter');
  await expect.poll(async () => lengths((await saved(page)).room.corners)).toEqual([12340, before[1], 12340, before[3]]);

  await page.getByRole('spinbutton', { name: 'Wall 2 mm' }).fill('6500');
  await page.getByRole('spinbutton', { name: 'Wall 2 mm' }).press('Enter');
  await expect.poll(async () => lengths((await saved(page)).room.corners)).toEqual([12340, 6500, 12340, 6500]);

  // Hovering a row highlights that wall's badge on the plan.
  await page.getByRole('spinbutton', { name: 'Wall 3 mm' }).hover();
  await expect(page.locator('[data-wall-number="3"] circle')).toHaveAttribute('fill', '#B45309');

  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  expect(lengths((await saved(page)).room.corners)).toEqual(before);
  expect(errors).toEqual([]);
});

test('draw walls by typing their lengths', async ({ page }) => {
  const errors = trackErrors(page);
  await openFresh(page);
  await page.getByRole('button', { name: 'Draw area' }).click();
  const box = (await canvas(page).boundingBox())!;
  const x0 = box.x + box.width / 2 - 200;
  const y0 = box.y + box.height / 2 - 150;
  await page.mouse.click(x0, y0);

  // Point the cursor roughly in each direction; typed walls snap to 45°.
  const steps: [number, number, string][] = [
    [x0 + 300, y0 + 12, '6000'],
    [x0 + 290, y0 + 260, '4250,5'],
    [x0 - 50, y0 + 230, '6000'],
  ];
  for (const [mx, my, len] of steps) {
    await page.mouse.move(mx, my);
    await page.keyboard.type(len);
    await expect(page.getByText(`Next wall: ${len.replace(',', '.')} mm`)).toBeVisible();
    await page.keyboard.press('Enter');
  }
  await page.keyboard.press('Escape'); // close the outline

  const p = await saved(page);
  expect(p.room.closed).toBe(true);
  expect(lengths(p.room.corners)).toEqual([6000, 4251, 6000, 4251]);
  const [a, b, c] = p.room.corners as Pt[];
  expect(b!.point.y).toBeCloseTo(a!.point.y, 6);
  expect(c!.point.x).toBeCloseTo(b!.point.x, 6);
  expect(errors).toEqual([]);
});
