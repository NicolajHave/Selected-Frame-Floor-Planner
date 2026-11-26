import { test, expect, type Locator, type Page } from '@playwright/test';
import { drawRoom, openFresh, saved, toScreen, trackErrors } from './helpers';
import { exportPdf, pageWith, pdfText } from './pdf';

const finish = async (page: Page) => (await saved(page)).room.finish;

/** The colour in the middle of a small patch of a picture taken of `target`, as [r, g, b]. */
async function colourAt(page: Page, target: Locator, fx: number, fy: number): Promise<number[]> {
  const png = (await target.screenshot()).toString('base64');
  return page.evaluate(
    async ([data, x, y]) => {
      const img = new Image();
      img.src = `data:image/png;base64,${data}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(Math.round(img.width * (x as number)) - 6, Math.round(img.height * (y as number)) - 6, 12, 12).data;
      const sum = [0, 0, 0];
      for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) sum[k]! += d[i + k]!;
      return sum.map((v) => Math.round(v / (d.length / 4)));
    },
    [png, fx, fy] as const,
  );
}

test('choose the floor and the colour of the walls: in the panel, the 3D view and the PDF', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = trackErrors(page);
  await openFresh(page);
  await drawRoom(page);
  await page.keyboard.press('Escape');
  const floor = page.getByTestId('floor-finish');
  const walls = page.getByTestId('wall-finish');

  // Nothing chosen yet: the plain neutral floor, warm white walls, and nothing saved.
  await expect(floor.getByRole('radio', { name: 'Plain', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect(walls.getByRole('radio', { name: 'Warm white', exact: true })).toHaveAttribute('aria-checked', 'true');
  expect(await finish(page)).toBeUndefined();

  // A kind of floor, then one of its colours; each swatch is a small picture of that floor.
  await floor.getByRole('radio', { name: 'Wood', exact: true }).click();
  expect(await finish(page)).toEqual({ floor: { kind: 'wood' } });
  await expect(floor).toContainText('Wood · Light oak — planks, 200 mm wide.');
  const smoked = floor.getByRole('radio', { name: 'Wood: Smoked oak', exact: true });
  await expect(smoked).toHaveCSS('background-image', /^url\("data:image\/jpeg/);
  await smoked.click();
  expect(await finish(page)).toEqual({ floor: { kind: 'wood', tone: 'smoked-oak' } });
  await floor.getByRole('checkbox', { name: 'Lay it the other way' }).check();
  expect(await finish(page)).toEqual({ floor: { kind: 'wood', tone: 'smoked-oak', turned: true } });

  await walls.getByRole('radio', { name: 'Sage', exact: true }).click();
  expect((await finish(page)).wall).toBe('#A8B399');
  await expect(walls).toContainText('Sage.');

  // The 3D view shows them: the floor has gone dark brown, the far wall green.
  await page.getByRole('button', { name: '3D View' }).click();
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  await page.waitForTimeout(2000);
  const [fr, fg, fb] = await colourAt(page, canvas, 0.6, 0.7);
  expect(fr! - fb!, 'a brown floor').toBeGreaterThan(40);
  expect(fr!).toBeLessThan(200);
  const [wr, wg, wb] = await colourAt(page, canvas, 0.45, 0.32);
  expect(wg! - wb!, 'a green wall').toBeGreaterThan(10);
  expect(wg! - wr!).toBeGreaterThanOrEqual(0);

  // Still there after a reload, and in the PDF's title block.
  await page.reload();
  await expect(page.getByTestId('floor-finish')).toContainText('Wood · Smoked oak');
  const { file } = await exportPdf(page, { views: false });
  const plan = pageWith(await pdfText(file), 'Plan View');
  expect(plan).toContain('Wood · Smoked oak');
  expect(plan).toMatch(/WALLS\s+Sage/);

  // Back to the neutral ones: nothing is left in the plan. Each choice was one undo step.
  await page.getByTestId('wall-finish').getByRole('radio', { name: 'Warm white', exact: true }).click();
  await page.getByTestId('floor-finish').getByRole('radio', { name: 'Plain', exact: true }).click();
  expect(await finish(page)).toBeUndefined();
  await page.keyboard.press('Control+z');
  expect(await finish(page)).toEqual({ floor: { kind: 'wood', tone: 'smoked-oak', turned: true } });
  expect(errors).toEqual([]);
});

test('every kind of floor can be chosen, each with its own colours', async ({ page }) => {
  const errors = trackErrors(page);
  await openFresh(page);
  await drawRoom(page);
  await page.keyboard.press('Escape');
  const floor = page.getByTestId('floor-finish');
  for (const [kind, colours] of [['Herringbone', 4], ['Concrete', 4], ['Tiles', 5], ['Linoleum', 6], ['Terrazzo', 3], ['Carpet', 4]] as const) {
    await floor.getByRole('radio', { name: kind, exact: true }).click();
    const swatches = floor.getByRole('radiogroup', { name: `${kind} colour` }).getByRole('radio');
    await expect(swatches).toHaveCount(colours);
    await swatches.last().click();
    expect((await finish(page)).floor.kind).toBe(kind.toLowerCase());
    expect((await finish(page)).floor.tone).toBeTruthy();
  }
  // Only what has a direction can be laid the other way.
  await expect(floor.getByRole('checkbox', { name: 'Lay it the other way' })).toHaveCount(0);
  // A colour of one's own: the floor's pattern in that colour.
  await floor.getByLabel('Carpet colour: a colour of your own').fill('#336699');
  await expect.poll(async () => (await finish(page)).floor).toEqual({ kind: 'carpet', tone: '#336699' });
  await expect(floor).toContainText('Carpet · #336699');
  expect(errors).toEqual([]);
});

test('a wall can have a colour of its own', async ({ page }) => {
  await openFresh(page);
  const room = await drawRoom(page);
  await page.keyboard.press('Escape');
  await page.getByTestId('wall-finish').getByRole('radio', { name: 'Light grey', exact: true }).click();

  // Click the top wall on the plan.
  const w = await toScreen(page, (room.minX + room.maxX) / 2, room.minY);
  await page.mouse.click(w.x, w.y);
  const colour = page.getByTestId('wall-colour');
  await expect(colour).toContainText("Light grey, as the room's walls");
  await expect(colour.getByRole('radio', { name: 'Light grey', exact: true })).toHaveAttribute('aria-checked', 'true');
  await colour.getByRole('radio', { name: 'Terracotta', exact: true }).click();
  const r = (await saved(page)).room;
  expect(r.walls[r.corners[0].id]).toEqual({ color: '#B76E51' });
  expect(r.finish.wall).toBe('#D8D7D3');
  await expect(colour).toContainText('Terracotta: this wall has its own colour.');

  // The colour is not part of the floor plan: it can be changed while that is locked.
  await page.getByRole('button', { name: 'Use the room’s (Light grey)' }).or(page.getByRole('button', { name: "Use the room's (Light grey)" })).click();
  expect((await saved(page)).room.walls ?? {}).toEqual({});
});
