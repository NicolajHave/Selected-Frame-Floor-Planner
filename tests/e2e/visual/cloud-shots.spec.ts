import { test } from '@playwright/test';
import { drawRoom, openFresh, place } from '../helpers';
import { FakeCloud, signIn } from '../fakeCloud';

const OUT = process.env.SHOTS_DIR!;

test.skip(!OUT, 'screenshots only on demand');

test('cloud screenshots', async ({ page }) => {
  const fake = new FakeCloud();
  await openFresh(page);
  await fake.install(page);
  const room = await drawRoom(page);
  await place(page, 'Floor Rack 1400', room.minX + 2500, room.minY + 3000);
  await page.keyboard.press('Escape');
  await page.screenshot({ path: `${OUT}/topbar-signed-out.png`, clip: { x: 0, y: 0, width: 1500, height: 60 } });
  await signIn(page, 'planner@bestseller.com');
  await page.getByRole('button', { name: 'Cloud', exact: true }).click();
  await page.getByRole('button', { name: 'Save to cloud' }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/cloud-dialog.png` });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  const share = page.getByRole('dialog', { name: /Share/ });
  await share.getByLabel('Invite by email').fill('colleague@bestseller.com');
  await share.getByRole('button', { name: 'Invite' }).click();
  await share.getByRole('button', { name: 'Create link' }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/share-dialog.png` });
  await page.keyboard.press('Escape');
  for (const width of [1500, 1366, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({ path: `${OUT}/topbar-${width}.png`, clip: { x: 0, y: 0, width, height: 60 } });
  }
});
