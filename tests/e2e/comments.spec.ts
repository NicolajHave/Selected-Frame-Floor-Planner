import { test, expect, type Page } from '@playwright/test';
import { drawRoom, openFresh, toScreen, trackErrors } from './helpers';
import { FakeCloud, signIn } from './fakeCloud';

const ME = 'planner@bestseller.com';
const VIEWER = 'store@bestseller.com';

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

const panel = (page: Page) => page.getByRole('complementary', { name: 'Comments' });

async function saveToCloud(page: Page) {
  await page.getByRole('button', { name: 'Cloud', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Cloud plans' });
  await dialog.getByRole('button', { name: 'Save to cloud' }).click();
  await expect(dialog).toContainText('syncs automatically');
  await page.keyboard.press('Escape');
  return [...fake.projects.keys()][0]!;
}

test('comments need a cloud plan; colleagues pin, post and resolve them', async ({ page }) => {
  const room = await drawRoom(page);
  await expect(page.getByRole('button', { name: 'Comments' })).toHaveCount(0);
  await signIn(page, ME);
  const id = await saveToCloud(page);

  await page.getByRole('button', { name: 'Comments' }).click();
  await expect(panel(page)).toContainText('No comments yet');

  // A general comment.
  await panel(page).getByLabel('Comment', { exact: true }).fill('Can we fit a second cash desk?');
  await panel(page).getByRole('button', { name: 'Post' }).click();
  await expect(panel(page).getByTestId('comment-list')).toContainText('Can we fit a second cash desk?');
  expect(fake.comments[0]).toMatchObject({ project_id: id, author_name: ME, x: null, via_link: false });

  // One pinned to a spot on the plan.
  await panel(page).getByRole('button', { name: 'Pin to the plan' }).click();
  const at = await toScreen(page, room.minX + 2000, room.minY + 1500);
  await page.mouse.click(at.x, at.y);
  await expect(panel(page)).toContainText('Pinned to the plan');
  await panel(page).getByLabel('Comment', { exact: true }).fill('Move this rack 50 cm left');
  await panel(page).getByRole('button', { name: 'Post' }).click();
  await expect(page.getByTestId('comment-pin')).toHaveCount(1);
  expect(fake.comments[1]!.x).toBeCloseTo(room.minX + 2000, -2);
  expect(fake.comments[1]!.y).toBeCloseTo(room.minY + 1500, -2);
  await expect(page.getByTestId('comment-count')).toHaveText('2');

  // Resolve: the pin goes, the count drops; it can be shown and reopened.
  const pinned = panel(page).locator('li', { hasText: 'Move this rack' });
  await pinned.getByRole('button', { name: 'Resolve' }).click();
  await expect(page.getByTestId('comment-pin')).toHaveCount(0);
  await expect(page.getByTestId('comment-count')).toHaveText('1');
  expect(fake.comments[1]!.resolved_by_email).toBe(ME);
  await panel(page).getByLabel(/Resolved/).check();
  await panel(page).locator('li', { hasText: 'Move this rack' }).getByRole('button', { name: 'Reopen' }).click();
  await expect(page.getByTestId('comment-pin')).toHaveCount(1);
});

test('someone with a view-only link comments under their name', async ({ page, context }) => {
  const plan = { schemaVersion: 1, id: 'p', name: 'Store 12', createdAt: '', updatedAt: '', units: 'mm', room: null, pillars: [], inventory: [] };
  const id = fake.seed(ME, 'Store 12', plan);
  fake.links.set('tokcomments', { project_id: id, created_at: new Date().toISOString(), created_by_email: ME, revoked: false });
  fake.comments.push({
    id: 'c-old', project_id: id, author_name: ME, author_email: ME, via_link: false, body: 'Here is the first layout',
    x: null, y: null, variant_id: null, created_at: new Date(Date.now() - 60_000).toISOString(), resolved_at: null, resolved_by_email: null,
  });

  const visitor = await context.newPage();
  await fake.install(visitor);
  await visitor.goto('/?share=tokcomments');
  await visitor.getByRole('button', { name: 'Comments' }).click();
  await expect(panel(visitor)).toContainText('Here is the first layout');
  // No resolving through a link.
  await expect(panel(visitor).getByRole('button', { name: 'Resolve' })).toHaveCount(0);

  await panel(visitor).getByLabel('Comment', { exact: true }).fill('The fitting rooms look too small');
  await panel(visitor).getByRole('button', { name: 'Post' }).click();
  await expect(panel(visitor)).toContainText('Give your name');
  await panel(visitor).getByLabel('Your name').fill('Anna, Store 12');
  await panel(visitor).getByRole('button', { name: 'Post' }).click();
  await expect(panel(visitor).getByTestId('comment-list')).toContainText('Anna, Store 12');
  await expect(panel(visitor).getByTestId('comment-list')).toContainText('(via link)');
  expect(fake.comments.at(-1)).toMatchObject({ author_name: 'Anna, Store 12', via_link: true, author_email: null });
  // The name is remembered for next time.
  await visitor.reload();
  await visitor.getByRole('button', { name: 'Comments' }).click();
  await expect(panel(visitor).getByLabel('Your name')).toHaveValue('Anna, Store 12');
  await visitor.close();
});

test('a viewer colleague can comment but not resolve', async ({ page }) => {
  const plan = { schemaVersion: 1, id: 'p', name: 'Store 12', createdAt: '', updatedAt: '', units: 'mm', room: null, pillars: [], inventory: [] };
  fake.seed(ME, 'Store 12', plan, { [VIEWER]: 'viewer' });
  await signIn(page, VIEWER);
  await page.getByRole('button', { name: 'Cloud', exact: true }).click();
  await page.getByRole('dialog', { name: 'Cloud plans' }).locator('li', { hasText: 'Store 12' }).getByRole('button', { name: 'Open' }).click();
  await page.getByRole('button', { name: 'Comments' }).click();
  await panel(page).getByLabel('Comment', { exact: true }).fill('Looks good to me');
  await panel(page).getByRole('button', { name: 'Post' }).click();
  await expect(panel(page).getByTestId('comment-list')).toContainText('Looks good to me');
  await expect(panel(page).getByRole('button', { name: 'Resolve' })).toHaveCount(0);
  expect(fake.comments[0]).toMatchObject({ author_name: VIEWER });
});
