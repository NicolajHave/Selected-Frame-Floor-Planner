import { test, expect, type Page } from '@playwright/test';
import { drawRoom, openFresh, place } from './helpers';
import { FakeCloud, signIn } from './fakeCloud';

const ME = 'planner@bestseller.com';

/** Reports are off on a developer's machine (where the tests run) until they are switched on. */
const monitorOn = (page: Page) => page.evaluate(() => localStorage.setItem('sf-planner:monitor', 'on'));

/** Something goes wrong that nothing catches. */
const fail = (page: Page, message: string) =>
  page.evaluate((m) => {
    setTimeout(() => {
      throw new Error(m);
    }, 0);
  }, message);

const reports = (fake: FakeCloud) => fake.calls.filter((c) => c.fn === 'fp_report_error');

async function openLog(page: Page) {
  await page.getByRole('button', { name: 'File' }).click();
  await page.getByRole('menuitem', { name: 'Error log…' }).click();
  return page.getByRole('dialog', { name: 'Error log' });
}

test('errors are reported without the plan, counted together, and read in the error log', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const fake = new FakeCloud();
  await openFresh(page);
  await fake.install(page);

  // Not from a developer's own machine, unless switched on.
  await fail(page, 'Never sent');
  await page.waitForTimeout(300);
  expect(reports(fake)).toHaveLength(0);
  await monitorOn(page);

  const room = await drawRoom(page);
  await place(page, 'Floor Rack 1400', room.minX + 3000, room.minY + 3000);
  await page.keyboard.press('Escape');

  await fail(page, 'Boom for anna@bestseller.com');
  await expect.poll(() => fake.errors.length).toBe(1);
  const boom = fake.errors[0]!;
  expect(boom).toMatchObject({ kind: 'error', message: 'Boom for <email>', hits: 1, anonymous_hits: 1, users: [] });
  expect(boom.version).toBeTruthy();
  // How it came about — and nothing of the plan itself.
  expect(boom.context).toMatchObject({ view: '2d', tool: 'select', fixtures: 1, walls: 4, drawing: false, signedIn: false, sharedLink: false });
  expect(boom.context.trail).toEqual(expect.arrayContaining([expect.stringMatching(/^addCorner/), expect.stringMatching(/Inventory/)]));
  expect(JSON.stringify(reports(fake)[0]!.args)).not.toMatch(/Floor Rack|position|bestseller\.com/);

  // The same error again on the same page is not sent twice; a promise nobody handled is another kind.
  await fail(page, 'Boom for anna@bestseller.com');
  await page.evaluate(() => void Promise.reject(new Error('Second failure')));
  await expect.poll(() => fake.errors.length).toBe(2);
  expect(fake.errors[1]).toMatchObject({ kind: 'promise', message: 'Second failure' });
  expect(boom.hits).toBe(1);
  // The network is not the planner's fault.
  await page.evaluate(() => void Promise.reject(new TypeError('Failed to fetch')));
  await page.waitForTimeout(300);
  expect(fake.errors).toHaveLength(2);

  // Only someone signed in reads the log.
  await page.getByRole('button', { name: 'File' }).click();
  await expect(page.getByRole('menuitem', { name: 'Error log…' })).toHaveCount(0);
  await page.keyboard.press('Escape');

  // It happens to someone signed in, another day: the same line, counted.
  await signIn(page, ME);
  await page.reload();
  await page.getByRole('button', { name: 'Account' }).waitFor();
  await fail(page, 'Boom for anna@bestseller.com');
  await expect.poll(() => boom.hits).toBe(2);
  expect(boom.users).toEqual([ME]);

  const log = await openLog(page);
  const rows = log.getByTestId('error-log').getByRole('listitem');
  await expect(rows).toHaveCount(2);
  const first = rows.first();
  await expect(first).toContainText('Boom for <email>');
  await expect(first).toContainText('×2');
  await expect(first).toContainText('2 times · 1 person signed in · once not signed in');

  await first.getByRole('button', { name: 'Details' }).click();
  await expect(first).toContainText('The last things done');
  await expect(first).toContainText('2D view · tool select · 1 fixture · 4 walls');
  await first.getByRole('button', { name: 'Copy', exact: true }).click();
  await expect(first.getByRole('button', { name: 'Copied' })).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain('Message: Boom for <email>');
  expect(copied).toContain('Happened 2 times · 1 person signed in · once not signed in');

  // Dealt with: cleared one at a time, or all at once.
  await first.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(rows).toHaveCount(1);
  await expect(log).not.toContainText('Boom for');
  await fail(page, 'One more');
  await expect.poll(() => fake.errors.length).toBe(2);
  await page.keyboard.press('Escape');
  const again = await openLog(page);
  await expect(again.getByTestId('error-log').getByRole('listitem')).toHaveCount(2);
  await again.getByRole('button', { name: 'Clear all', exact: true }).click();
  await again.getByRole('button', { name: 'Keep them' }).click();
  expect(fake.errors).toHaveLength(2);
  await again.getByRole('button', { name: 'Clear all', exact: true }).click();
  await again.getByRole('button', { name: 'Yes, clear all' }).click();
  await expect(log.getByRole('status')).toContainText('No errors have been reported');
  expect(fake.errors).toHaveLength(0);
});

test('the error screen reports what stopped the planner', async ({ page }) => {
  const fake = new FakeCloud();
  await openFresh(page);
  await fake.install(page);
  await monitorOn(page);
  await drawRoom(page);

  // Break the autosaved plan the way a bad file or a bug could: a fixture without a position.
  await page.evaluate(() => {
    window.__sfFlushAutosave?.();
    const saved = JSON.parse(localStorage.getItem('sf-planner:project')!);
    saved.state.project.name = 'Secret shop';
    saved.state.project.inventory.push({ id: 'broken', assetId: '105-17-001', name: 'Volume Table', position: null });
    localStorage.setItem('sf-planner:project', JSON.stringify(saved));
  });
  await page.reload();

  const screen = page.getByTestId('planner-error');
  await expect(screen).toBeVisible();
  await expect(screen.getByRole('status')).toContainText('The error has been reported, without your plan');
  expect(fake.errors).toHaveLength(1);
  expect(fake.errors[0]).toMatchObject({ kind: 'screen', hits: 1 });
  expect(fake.errors[0]!.stack).toContain('/_next/static/');
  expect(JSON.stringify(reports(fake)[0]!.args)).not.toContain('Secret shop');
});

test('a database without the error log yet: nothing breaks, and the log says so', async ({ page }) => {
  const fake = new FakeCloud();
  fake.errorsSupported = false;
  await openFresh(page);
  await fake.install(page);
  await monitorOn(page);

  // The report goes nowhere, quietly: the planner carries on.
  await fail(page, 'Nobody is listening');
  await expect.poll(() => reports(fake).length).toBe(1);
  await expect(page.getByRole('button', { name: 'Draw area' })).toBeEnabled();
  expect(fake.errors).toHaveLength(0);

  await signIn(page, ME);
  const log = await openLog(page);
  await expect(log.getByRole('alert')).toContainText('not switched on in the database yet');
});
