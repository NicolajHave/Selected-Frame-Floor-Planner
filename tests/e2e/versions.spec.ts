import { test, expect, type Page } from '@playwright/test';
import { drawRoom, openFresh, place, saved, trackErrors } from './helpers';
import { FakeCloud, signIn } from './fakeCloud';

const ME = 'planner@bestseller.com';

let fake: FakeCloud;
let errors: string[];

test.beforeEach(async ({ page }) => {
  errors = trackErrors(page);
  fake = new FakeCloud();
  await openFresh(page);
  await fake.install(page);
});

test.afterEach(() => {
  expect(errors.filter((e) => !/status of 4\d\d/.test(e))).toEqual([]);
});

const status = (page: Page) => page.getByTestId('cloud-status');

/** Draws a room, signs in and saves the plan to the cloud. Returns its id and the room. */
async function cloudPlan(page: Page) {
  const room = await drawRoom(page);
  await signIn(page, ME);
  await page.getByRole('button', { name: 'Cloud', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Cloud plans' });
  await dialog.getByRole('button', { name: 'Save to cloud' }).click();
  await expect(dialog).toContainText('syncs automatically');
  await page.keyboard.press('Escape');
  await expect(status(page)).toContainText('Saved');
  return { id: [...fake.projects.keys()][0]!, room };
}

async function openVersions(page: Page) {
  await page.getByRole('button', { name: 'Versions', exact: true }).click();
  return page.getByRole('dialog', { name: 'Version history' });
}

async function saveVersion(page: Page, label: string) {
  const dialog = page.getByRole('dialog', { name: 'Version history' });
  await dialog.getByLabel('Label (optional)').fill(label);
  await dialog.getByRole('button', { name: 'Save version' }).click();
  await expect(dialog.getByTestId('versions')).toContainText(label);
}

test('save a version, change the plan, restore it and undo the restore', async ({ page }) => {
  const { room } = await cloudPlan(page);
  let dialog = await openVersions(page);
  await expect(dialog).toContainText('No earlier versions yet.');
  await saveVersion(page, 'Just the room');
  await page.keyboard.press('Escape');

  await place(page, 'Floor Rack 1400', room.minX + 2000, room.minY + 3000);
  await expect(status(page)).toContainText('Saved', { timeout: 10_000 });
  expect((await saved(page)).inventory).toHaveLength(1);

  dialog = await openVersions(page);
  page.once('dialog', (d) => d.accept());
  await dialog.getByRole('button', { name: 'Restore' }).click();
  await expect(dialog.getByRole('status')).toContainText('Restored “Just the room”');
  await expect.poll(async () => (await saved(page)).inventory.length).toBe(0);
  await page.keyboard.press('Escape');
  // The restore syncs like any edit.
  await expect(status(page)).toContainText('Saved', { timeout: 10_000 });
  const id = [...fake.projects.keys()][0]!;
  expect((fake.projects.get(id)!.data as { inventory: unknown[] }).inventory).toHaveLength(0);

  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await saved(page)).inventory.length).toBe(1);
});

test('at most three versions: a fourth replaces the oldest', async ({ page }) => {
  const { id } = await cloudPlan(page);
  const dialog = await openVersions(page);
  for (const label of ['First', 'Second', 'Third']) await saveVersion(page, label);
  await expect(dialog).toContainText('All 3 are in use');
  await saveVersion(page, 'Fourth');
  const rows = dialog.getByTestId('versions').locator('li');
  await expect(rows).toHaveCount(3);
  await expect(dialog.getByTestId('versions')).not.toContainText('First');
  expect(fake.versions.get(id)).toHaveLength(3);
});

test('a version is kept automatically when work resumes after a break', async ({ page }) => {
  const { id, room } = await cloudPlan(page);
  fake.age(id, 45 * 60 * 1000);
  await place(page, 'Floor Rack 1400', room.minX + 2000, room.minY + 3000);
  await expect(status(page)).toContainText('Saved', { timeout: 10_000 });
  // The next save right after does not keep another one.
  await place(page, 'Floor Rack 1400', room.minX + 3500, room.minY + 3000);
  await expect(status(page)).toContainText('Saved', { timeout: 10_000 });

  const dialog = await openVersions(page);
  const rows = dialog.getByTestId('versions').locator('li');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Automatic');
  await expect(rows.first()).toContainText('before the next session');
  const v = fake.versions.get(id)![0]!;
  expect((v.data as { inventory: unknown[] }).inventory).toHaveLength(0);
});
