import { test, expect, type Page } from '@playwright/test';
import { drawRoom, openFresh, place, saved, trackErrors } from './helpers';
import { FakeCloud, signIn } from './fakeCloud';
import { exportPdf, pdfText } from './pdf';

const ME = 'planner@bestseller.com';
const COLLEAGUE = 'colleague@bestseller.com';

let fake: FakeCloud;
let errors: string[];

test.beforeEach(async ({ page }) => {
  errors = trackErrors(page);
  fake = new FakeCloud();
  await openFresh(page);
  await fake.install(page);
});

test.afterEach(() => {
  // Expected 4xx responses from the fake show up as console errors; ignore those.
  expect(errors.filter((e) => !/status of 4\d\d/.test(e))).toEqual([]);
});

const status = (page: Page) => page.getByTestId('cloud-status');

async function openCloudDialog(page: Page) {
  await page.getByRole('button', { name: 'Cloud', exact: true }).click();
  return page.getByRole('dialog', { name: 'Cloud plans' });
}

test('sign in, save a plan to the cloud, and edits sync automatically', async ({ page }) => {
  const room = await drawRoom(page);
  await signIn(page, ME);

  const dialog = await openCloudDialog(page);
  await dialog.getByRole('button', { name: 'Save to cloud' }).click();
  await expect(dialog).toContainText('is saved in the cloud and syncs automatically');
  await expect(dialog.getByTestId('cloud-projects')).toContainText('Untitled plan');
  await page.keyboard.press('Escape');
  await expect(status(page)).toContainText('Saved');

  const [id] = [...fake.projects.keys()];
  expect(fake.projects.get(id!)!.owner_email).toBe(ME);

  // Edit → marked unsaved → saved a moment later as version 2.
  await place(page, 'Floor Rack 1400', room.minX + 2000, room.minY + 3000);
  await expect(status(page)).toContainText(/Unsaved changes|Saving/);
  await expect(status(page)).toContainText('Saved', { timeout: 10_000 });
  const p = fake.projects.get(id!)!;
  expect(p.version).toBe(2);
  expect((p.data as { inventory: unknown[] }).inventory).toHaveLength(1);

  // The link survives a reload.
  await page.reload();
  await expect(status(page)).toContainText('Saved');
  expect((await saved(page)).inventory).toHaveLength(1);
});

test('only company addresses, and wrong passwords, are refused', async ({ page }) => {
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Sign in' });
  await dialog.getByLabel('Email').fill(ME);
  await dialog.getByLabel('Password').fill('wrong');
  await dialog.getByRole('button', { name: 'Sign in' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Invalid login credentials');

  await dialog.getByRole('button', { name: 'Create account' }).click();
  const signup = page.getByRole('dialog', { name: 'Create account' });
  await signup.getByLabel('Email').fill('someone@gmail.com');
  await signup.getByLabel('Password').fill('long enough password');
  await signup.getByRole('button', { name: 'Create account' }).click();
  await expect(signup.getByRole('alert')).toContainText('@bestseller.com');
});

test('a plan shared with me as viewer opens read-only', async ({ page }) => {
  const plan = { schemaVersion: 1, id: 'p', name: 'Store 12', createdAt: '', updatedAt: '', units: 'mm',
    room: null, pillars: [], inventory: [] };
  fake.seed(COLLEAGUE, 'Store 12', plan, { [ME]: 'viewer' });
  await signIn(page, ME);

  const dialog = await openCloudDialog(page);
  const row = dialog.getByTestId('cloud-projects').locator('li', { hasText: 'Store 12' });
  await expect(row).toContainText('View only');
  await expect(row).toContainText(COLLEAGUE);
  await row.getByRole('button', { name: 'Open' }).click();

  await expect(page.getByTestId('cloud-banner')).toContainText('You can view this plan but not change it');
  await expect(status(page)).toContainText('View only');
  await expect(page.getByRole('button', { name: 'Draw area' })).toHaveCount(0);
  await expect(page.getByTitle('Place Floor Rack 1400', { exact: true })).toBeDisabled();
  // Keyboard edits are ignored too.
  await page.keyboard.press('Control+z');
  expect((await saved(page)).name).toBe('Store 12');
  expect(fake.calls.some((c) => c.fn === 'fp_save_project')).toBe(false);
});

test('invite a colleague and share a view-only link', async ({ page, context }) => {
  await drawRoom(page);
  await signIn(page, ME);
  const cloudDialog = await openCloudDialog(page);
  await cloudDialog.getByRole('button', { name: 'Save to cloud' }).click();
  await expect(cloudDialog).toContainText('syncs automatically');
  await page.keyboard.press('Escape');
  const [id] = [...fake.projects.keys()];

  await page.getByRole('button', { name: 'Share', exact: true }).click();
  const share = page.getByRole('dialog', { name: /Share/ });
  await share.getByLabel('Invite by email').fill('someone@gmail.com');
  await share.getByRole('button', { name: 'Invite' }).click();
  await expect(share.getByRole('alert')).toContainText('Only @bestseller.com');

  await share.getByLabel('Invite by email').fill(COLLEAGUE);
  await share.getByLabel('Role for the invite').selectOption('viewer');
  await share.getByRole('button', { name: 'Invite' }).click();
  await expect(share.getByTestId('share-members')).toContainText(COLLEAGUE);
  expect(fake.members.get(id!)!.get(COLLEAGUE)).toBe('viewer');

  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await share.getByRole('button', { name: 'Create link' }).click();
  await expect(share.getByTestId('share-links')).toBeVisible();
  const [token] = [...fake.links.keys()];
  const myPlan = await saved(page);

  // Someone opens the link in another tab: read-only, and this browser's own plan is untouched.
  const visitor = await context.newPage();
  await visitor.route(/supabase\.co/, (r) => r.abort());
  await fake.install(visitor);
  await visitor.goto(`/?share=${token}`);
  await expect(visitor.getByTestId('cloud-banner')).toContainText(`shared by ${ME}`);
  await expect(visitor.getByTestId('cloud-banner')).toContainText('view only');
  await visitor.getByRole('button', { name: 'File' }).click();
  await expect(visitor.getByRole('menuitem', { name: 'Export data (JSON)' })).toBeVisible();
  await expect(visitor.getByRole('menuitem', { name: 'New plan' })).toHaveCount(0);
  await visitor.keyboard.press('Escape');
  await expect(visitor.getByRole('button', { name: 'PDF', exact: true })).toBeVisible();
  expect(await saved(visitor)).toEqual(myPlan);

  // After revoking, the link stops working.
  await share.getByRole('button', { name: 'Revoke' }).click();
  await expect(share.getByTestId('share-links')).toHaveCount(0);
  await visitor.reload();
  await expect(visitor.getByRole('alert').filter({ hasText: 'revoked' })).toContainText('revoked or does not exist');
});

test('a conflicting save offers to load the other version', async ({ page }) => {
  const room = await drawRoom(page);
  await signIn(page, ME);
  const dialog = await openCloudDialog(page);
  await dialog.getByRole('button', { name: 'Save to cloud' }).click();
  await expect(dialog).toContainText('syncs automatically');
  await page.keyboard.press('Escape');
  const [id] = [...fake.projects.keys()];

  // A colleague saves a version with a different name in the meantime.
  const theirs = { ...(fake.projects.get(id!)!.data as object), name: 'Their version', inventory: [] as unknown[] };
  fake.members.get(id!)!.set(COLLEAGUE, 'editor');
  fake.saveAs(COLLEAGUE, id!, theirs);

  await place(page, 'Tall Oak Podium', room.minX + 2000, room.minY + 2000);
  const banner = page.getByTestId('cloud-banner');
  await expect(banner).toContainText(`${COLLEAGUE} saved a newer version`, { timeout: 10_000 });
  await expect(status(page)).toContainText('Conflict');

  await banner.getByRole('button', { name: 'Load theirs' }).click();
  await expect(status(page)).toContainText('Saved');
  const p = await saved(page);
  expect(p.name).toBe('Their version');
  expect(p.inventory).toHaveLength(0);
});

test('the PDF carries the shop’s own live 3D link, the same on every export', async ({ page, context }) => {
  await drawRoom(page);
  await signIn(page, ME);
  const cloudDialog = await openCloudDialog(page);
  await cloudDialog.getByRole('button', { name: 'Save to cloud' }).click();
  await expect(cloudDialog).toContainText('syncs automatically');
  await page.keyboard.press('Escape');

  // First export creates the link …
  const first = await pdfText((await exportPdf(page, { views: false })).file);
  expect(fake.links.size).toBe(1);
  const [token] = [...fake.links.keys()];
  const url = `/?share=${token}&view=3d`;
  expect(first[0]).toContain('LIVE 3D VIEW');
  expect(first[0]!.replace(/\s/g, '')).toContain(url);

  // … later exports reuse it, so a shop keeps one address.
  const second = await pdfText((await exportPdf(page, { views: false })).file);
  expect(fake.links.size).toBe(1);
  expect(second[0]!.replace(/\s/g, '')).toContain(url);

  // The partner opens it: read-only, straight into 3D, and can export the same PDF.
  const visitor = await context.newPage();
  await visitor.route(/supabase\.co/, (r) => r.abort());
  await fake.install(visitor);
  await visitor.goto(url);
  await expect(visitor.getByTestId('cloud-banner')).toContainText('view only');
  await expect(visitor.getByText('Drag to look around')).toBeVisible();
  const theirs = await pdfText((await exportPdf(visitor, { views: false })).file);
  expect(theirs[0]!.replace(/\s/g, '')).toContain(url);
  expect(fake.links.size).toBe(1);
});
