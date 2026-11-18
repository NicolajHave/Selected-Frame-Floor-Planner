import path from 'node:path';
import fs from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import { drawRoom, openFresh, place, saved } from './helpers';
import { FakeCloud, signIn } from './fakeCloud';

const PLAN_PDF = path.join(__dirname, '../fixtures/sample-plan.pdf');
const ME = 'planner@bestseller.com';
const COLLEAGUE = 'colleague@bestseller.com';
const REF = /^asset:a[0-9a-f]{28}$/;

const drawing = (page: Page) => page.locator('[data-layer="underlay"] image');
const status = (page: Page) => page.getByTestId('cloud-status');

async function importPlan(page: Page) {
  await page.getByTestId('underlay-file').setInputFiles(PLAN_PDF);
  await page.getByRole('dialog').getByRole('button', { name: 'Use whole page' }).click();
  await expect(drawing(page)).toHaveAttribute('href', /^data:image\/jpeg/);
  await page.keyboard.press('Escape'); // leave "set scale"
}

/** What the browser's autosave holds, as text. */
const autosaved = (page: Page) =>
  page.evaluate(() => {
    window.__sfFlushAutosave?.();
    return localStorage.getItem('sf-planner:project') ?? '';
  });

async function saveToCloud(page: Page) {
  await page.getByRole('button', { name: 'Cloud', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Cloud plans' });
  await dialog.getByRole('button', { name: 'Save to cloud' }).click();
  await expect(dialog).toContainText('syncs automatically');
  await page.keyboard.press('Escape');
  await expect(status(page)).toContainText('Saved');
}

test('the drawing is kept outside the plan in this browser; a file copy carries it along', async ({ page, browser }) => {
  await openFresh(page);
  await importPlan(page);

  // The plan refers to the drawing; the autosave is small again.
  await expect.poll(async () => (await saved(page)).underlay.src).toMatch(REF);
  expect((await autosaved(page)).length).toBeLessThan(20_000);

  // After a reload the drawing is still there (from the browser's own store).
  await page.reload();
  await expect(drawing(page)).toHaveAttribute('href', /^data:image\/jpeg/);
  expect((await saved(page)).underlay.fileName).toBe('sample-plan.pdf');

  // A saved file stands on its own: the picture is in it …
  await page.getByRole('button', { name: 'File' }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: /Save file copy/ }).click()]);
  const file = await download.path();
  const inFile = JSON.parse(fs.readFileSync(file!, 'utf8'));
  expect(inFile.underlay.src).toMatch(/^data:image\/jpeg;base64,/);

  // … so it opens with its drawing in a browser that has never seen it.
  const other = await browser.newContext();
  const fresh = await other.newPage();
  await openFresh(fresh);
  await fresh.locator('input[type="file"][accept*=".sf"]').setInputFiles(file!);
  await expect(drawing(fresh)).toHaveAttribute('href', /^data:image\/jpeg/);
  await expect.poll(async () => (await saved(fresh)).underlay.src).toMatch(REF);
  await other.close();
});

test('a cloud plan stores its drawing once; saves, colleagues and view-only links use the reference', async ({ page, browser }) => {
  const fake = new FakeCloud();
  await openFresh(page);
  await fake.install(page);
  const room = await drawRoom(page);
  await importPlan(page);
  await signIn(page, ME);
  await saveToCloud(page);

  const [id] = [...fake.projects.keys()];
  const stored = () => fake.projects.get(id!)!.data as { underlay: { src: string }; inventory: unknown[] };
  // The drawing went up on its own, and the plan in the cloud only refers to it.
  await expect.poll(() => fake.assets.size).toBe(1);
  await expect.poll(() => stored().underlay.src).toMatch(REF);
  const [key, picture] = [...fake.assets][0]!;
  expect(key).toBe(`${id}:${stored().underlay.src.slice('asset:'.length)}`);
  expect(picture).toMatch(/^data:image\/jpeg;base64,/);

  // An edit saves the plan without sending the drawing again.
  const before = fake.calls.length;
  await place(page, 'Floor Rack 1400', room.minX + 2000, room.minY + 3000);
  await expect(status(page)).toContainText('Saved', { timeout: 10_000 });
  await expect.poll(() => stored().inventory.length).toBe(1);
  const later = fake.calls.slice(before);
  const save = later.find((c) => c.fn === 'fp_save_project')!;
  expect(JSON.stringify(save.args).length).toBeLessThan(20_000);
  expect(later.some((c) => c.fn === 'fp_put_asset')).toBe(false);
  expect(fake.assets.size).toBe(1);

  // A colleague on another computer gets the drawing from the cloud.
  fake.members.get(id!)!.set(COLLEAGUE, 'viewer');
  const theirs = await browser.newContext();
  const colleague = await theirs.newPage();
  await openFresh(colleague);
  await fake.install(colleague);
  await signIn(colleague, COLLEAGUE);
  await colleague.getByRole('button', { name: 'Cloud', exact: true }).click();
  await colleague.getByRole('dialog', { name: 'Cloud plans' }).getByRole('button', { name: 'Open' }).click();
  await expect(drawing(colleague)).toHaveAttribute('href', /^data:image\/jpeg/);
  expect(fake.calls.some((c) => c.fn === 'fp_get_asset' && c.email === COLLEAGUE)).toBe(true);
  await theirs.close();

  // So does someone with a view-only link, without signing in.
  fake.links.set('tokdrawing', {
    project_id: id!, created_at: new Date().toISOString(), created_by_email: ME, revoked: false,
    expires_at: new Date(Date.now() + 864e5).toISOString(),
  });
  const anyone = await browser.newContext();
  const visitor = await anyone.newPage();
  await visitor.route(/supabase\.co/, (r) => r.abort());
  await fake.install(visitor);
  await visitor.goto('/?share=tokdrawing');
  await expect(visitor.getByTestId('cloud-banner')).toContainText('view only');
  await expect(drawing(visitor)).toHaveAttribute('href', /^data:image\/jpeg/);
  expect(fake.calls.some((c) => c.fn === 'fp_get_shared_asset' && c.email === null)).toBe(true);
  await anyone.close();
});

test('a database without the drawing store keeps the drawing inside the plan, as before', async ({ page }) => {
  const fake = new FakeCloud();
  fake.assetsSupported = false;
  await openFresh(page);
  await fake.install(page);
  const room = await drawRoom(page);
  await importPlan(page);
  await signIn(page, ME);
  await saveToCloud(page);
  await place(page, 'Floor Rack 1400', room.minX + 2000, room.minY + 3000);
  await expect(status(page)).toContainText('Saved', { timeout: 10_000 });

  const [id] = [...fake.projects.keys()];
  const stored = fake.projects.get(id!)!.data as { underlay: { src: string }; inventory: unknown[] };
  expect(stored.inventory).toHaveLength(1);
  expect(stored.underlay.src).toMatch(/^data:image\/jpeg;base64,/);
  expect(fake.assets.size).toBe(0);
  await expect(drawing(page)).toBeVisible();
});

test('a plan saved with its drawing inside opens as before, and moves it out with the next save', async ({ page }) => {
  // The picture from a real import, put into a plan the old way.
  await openFresh(page);
  await importPlan(page);
  const picture = await drawing(page).getAttribute('href');
  const plan = {
    schemaVersion: 1, id: 'p', name: 'Store 12', createdAt: '', updatedAt: '', units: 'mm', room: null, pillars: [], inventory: [],
    underlay: {
      src: picture, fileName: 'old-plan.pdf', position: { x: 0, y: 0 }, width: 20000, aspect: 0.7, opacity: 0.6, locked: true, calibrated: true,
    },
  };
  const fake = new FakeCloud();
  const id = fake.seed(ME, 'Store 12', plan);

  await openFresh(page);
  await fake.install(page);
  await signIn(page, ME);
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Cloud', exact: true }).click();
  await page.getByRole('dialog', { name: 'Cloud plans' }).getByRole('button', { name: 'Open' }).click();
  await expect(drawing(page)).toHaveAttribute('href', /^data:image\/jpeg/);
  expect((await saved(page)).underlay.fileName).toBe('old-plan.pdf');
  await page.keyboard.press('Escape');

  // The next save stores the drawing on its own and the plan shrinks.
  await page.getByRole('button', { name: 'Rectangle' }).click();
  const box = (await page.locator('div.flex-1 > svg').boundingBox())!;
  await page.mouse.move(box.x + 200, box.y + 200);
  await page.mouse.down();
  await page.mouse.move(box.x + 500, box.y + 400, { steps: 4 });
  await page.mouse.up();
  await expect(status(page)).toContainText('Saved', { timeout: 10_000 });
  const stored = fake.projects.get(id)!.data as { underlay: { src: string } };
  expect(stored.underlay.src).toMatch(REF);
  expect(fake.assets.get(`${id}:${stored.underlay.src.slice('asset:'.length)}`)).toBe(picture);
});
