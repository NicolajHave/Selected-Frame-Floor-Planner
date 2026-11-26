import { test, expect, type Page } from '@playwright/test';
import { drawRoom, openFresh, saved, trackErrors } from './helpers';
import { FakeCloud, signIn } from './fakeCloud';

const ME = 'planner@bestseller.com';
const VIEWER = 'store@bestseller.com';
const TOKEN = 'tokfinish';

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

/** A plan with a room in the cloud, and a view-only link to it. */
async function planWithLink(page: Page, finish?: Record<string, unknown>, members: Record<string, 'editor' | 'viewer'> = {}) {
  await drawRoom(page);
  const plan = await saved(page);
  if (finish) plan.room.finish = finish;
  const id = fake.seed(ME, 'Store 12', { ...plan, name: 'Store 12' }, members);
  fake.links.set(TOKEN, { project_id: id, created_at: new Date().toISOString(), created_by_email: ME, revoked: false, expires_at: new Date(Date.now() + 864e5).toISOString() });
  return id;
}

async function openLink(page: Page) {
  const visitor = await page.context().newPage();
  await fake.install(visitor);
  await visitor.goto(`/?share=${TOKEN}`);
  await expect(visitor.getByRole('button', { name: 'Floor & walls' })).toBeVisible();
  return visitor;
}

async function openCloudPlan(page: Page, email: string) {
  await signIn(page, email);
  await page.getByRole('button', { name: 'Cloud', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Cloud plans' });
  // The room drawn to make the plan is still on screen: yes, open the cloud plan instead.
  page.once('dialog', (d) => void d.accept());
  await dialog.getByRole('listitem').filter({ hasText: 'Store 12' }).getByRole('button', { name: 'Open' }).click();
  await expect(dialog).toBeHidden();
}

const panel = (page: Page) => page.getByRole('complementary', { name: 'Floor and walls' });

test('a visitor with the link chooses the floor and the wall colour of their shop; the planner takes it over', async ({ page }) => {
  const id = await planWithLink(page);
  const visitor = await openLink(page);

  // The plan says nothing, so neither does the link. The plan's own panel only tells, and points to the button.
  await expect(visitor.getByTestId('finish-summary')).toHaveText('Plain · Neutral · walls Warm white');
  await expect(visitor.getByTestId('details-panel')).toContainText('Choose them with “Floor & walls” above the plan');
  await visitor.getByRole('button', { name: 'Floor & walls' }).click();
  await expect(panel(visitor)).toContainText('It is up to you, and it changes nothing in the layout.');
  await expect(panel(visitor).getByTestId('link-finish-status')).toHaveText('Nothing chosen: this is what the plan says.');

  await panel(visitor).getByRole('radio', { name: 'Wood', exact: true }).click();
  await panel(visitor).getByRole('radio', { name: 'Wood: Smoked oak', exact: true }).click();
  await panel(visitor).getByRole('radio', { name: 'Sage', exact: true }).click();
  // Shown at once, and kept with the link a moment later.
  await expect(visitor.getByTestId('finish-summary')).toHaveText('Wood · Smoked oak · walls Sage');
  await expect.poll(() => fake.linkFinishes.get(id)?.finish).toEqual({ floor: { kind: 'wood', tone: 'smoked-oak' }, wall: '#A8B399' });
  expect(fake.linkFinishes.get(id)!.chosen_by).toBe('Someone with the link');
  await expect(panel(visitor).getByTestId('link-finish-status')).toHaveText(`Your choice is kept with this link, and ${ME} can see it.`);
  // The plan itself is untouched.
  expect((fake.projects.get(id)!.data as { room: { finish?: unknown } }).room.finish).toBeUndefined();

  // It is there the next time the link is opened.
  await visitor.reload();
  await expect(visitor.getByTestId('finish-summary')).toHaveText('Wood · Smoked oak · walls Sage');
  await visitor.close();

  // The planner sees it as a suggestion, takes it into the plan, and it is gone from the link's own store.
  await openCloudPlan(page, ME);
  const suggestion = page.getByTestId('link-finish-suggestion');
  await expect(suggestion).toContainText('Chosen on the link by Someone with the link');
  await expect(suggestion).toContainText('Wood · Smoked oak · walls Sage');
  await expect(suggestion).toContainText('The plan says nothing yet.');
  await suggestion.getByRole('button', { name: 'Use in the plan' }).click();
  await expect(suggestion).toHaveCount(0);
  expect((await saved(page)).room.finish).toEqual({ floor: { kind: 'wood', tone: 'smoked-oak' }, wall: '#A8B399' });
  expect(fake.linkFinishes.has(id)).toBe(false);
  // One undo step for the two of them.
  await page.keyboard.press('Control+z');
  expect((await saved(page)).room.finish).toBeUndefined();
});

test('over a plan that has a finish: the visitor changes one part, takes it back, and the planner can dismiss it', async ({ page }) => {
  const id = await planWithLink(page, { floor: { kind: 'concrete', tone: 'grey' }, wall: '#D8D7D3' });
  const visitor = await openLink(page);
  await expect(visitor.getByTestId('finish-summary')).toHaveText('Concrete · Grey · walls Light grey');
  await visitor.getByRole('button', { name: 'Floor & walls' }).click();

  // Only the walls: the floor stays the plan's.
  await panel(visitor).getByRole('radio', { name: 'Terracotta', exact: true }).click();
  await expect(visitor.getByTestId('finish-summary')).toHaveText('Concrete · Grey · walls Terracotta');
  await expect.poll(() => fake.linkFinishes.get(id)?.finish).toEqual({ wall: '#B76E51' });
  // The neutral floor, where the plan says concrete, is a choice too.
  await panel(visitor).getByRole('radio', { name: 'Plain', exact: true }).click();
  await expect(visitor.getByTestId('finish-summary')).toHaveText('Plain · Neutral · walls Terracotta');
  await expect.poll(() => fake.linkFinishes.get(id)?.finish).toEqual({ floor: { kind: 'plain' }, wall: '#B76E51' });

  // Back to what the plan says: nothing is kept any more.
  await panel(visitor).getByRole('button', { name: 'Back to what the plan says' }).click();
  await expect(visitor.getByTestId('finish-summary')).toHaveText('Concrete · Grey · walls Light grey');
  await expect.poll(() => fake.linkFinishes.has(id)).toBe(false);

  // Chosen again, with a name the visitor comments under.
  await visitor.evaluate(() => localStorage.setItem('sf-planner:comment-name', 'Anna, Store 12'));
  await panel(visitor).getByRole('radio', { name: 'Sand', exact: true }).click();
  await expect.poll(() => fake.linkFinishes.get(id)?.chosen_by).toBe('Anna, Store 12');
  await visitor.close();

  await openCloudPlan(page, ME);
  const suggestion = page.getByTestId('link-finish-suggestion');
  await expect(suggestion).toContainText('Chosen on the link by Anna, Store 12');
  await expect(suggestion).toContainText('walls Sand');
  await expect(suggestion).toContainText('The plan says Concrete · Grey · walls Light grey.');
  await suggestion.getByRole('button', { name: 'Dismiss' }).click();
  await expect(suggestion).toHaveCount(0);
  expect(fake.linkFinishes.has(id)).toBe(false);
  expect((await saved(page)).room.finish).toEqual({ floor: { kind: 'concrete', tone: 'grey' }, wall: '#D8D7D3' });
});

test('a colleague who can only view sees the choice but cannot take it over', async ({ page }) => {
  const id = await planWithLink(page, undefined, { [VIEWER]: 'viewer' });
  fake.linkFinishes.set(id, { finish: { wall: '#A8B399' }, chosen_by: 'Anna', chosen_at: new Date().toISOString() });
  await openCloudPlan(page, VIEWER);
  // Their panel only tells what the plan says; the choice on the link is not theirs to take.
  await expect(page.getByTestId('finish-summary')).toHaveText('Plain · Neutral · walls Warm white');
  await expect(page.getByRole('button', { name: 'Floor & walls' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Use in the plan' })).toHaveCount(0);
  expect(fake.linkFinishes.has(id)).toBe(true);
});

test('a database without it yet: the choice still works, kept in the visitor\'s browser', async ({ page }) => {
  fake.linkFinishSupported = false;
  const id = await planWithLink(page);
  const visitor = await openLink(page);
  await visitor.getByRole('button', { name: 'Floor & walls' }).click();
  await panel(visitor).getByRole('radio', { name: 'Tiles', exact: true }).click();
  await expect(visitor.getByTestId('finish-summary')).toHaveText('Tiles · Light grey · walls Warm white');
  await expect(panel(visitor).getByTestId('link-finish-status')).toHaveText('Your choice is kept in this browser.');
  expect(fake.linkFinishes.has(id)).toBe(false);
  await visitor.reload();
  await expect(visitor.getByTestId('finish-summary')).toHaveText('Tiles · Light grey · walls Warm white');
  await visitor.close();

  // And the planner's own panel is as it was: nothing to suggest, nothing broken.
  await openCloudPlan(page, ME);
  await expect(page.getByTestId('floor-finish')).toBeVisible();
  await expect(page.getByTestId('link-finish-suggestion')).toHaveCount(0);
});
