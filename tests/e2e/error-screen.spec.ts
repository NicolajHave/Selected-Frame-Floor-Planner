import { test, expect } from '@playwright/test';
import { drawRoom, openFresh } from './helpers';

test('a plan that crashes the planner shows an error screen with a backup, not a blank page', async ({ page }) => {
  await openFresh(page);
  await drawRoom(page);

  // Break the autosaved plan the way a bad file or a bug could: a fixture without a position.
  await page.evaluate(() => {
    window.__sfFlushAutosave?.();
    const saved = JSON.parse(localStorage.getItem('sf-planner:project')!);
    saved.state.project.name = 'Broken shop';
    saved.state.project.inventory.push({ id: 'broken', assetId: '105-17-001', name: 'Volume Table', position: null });
    localStorage.setItem('sf-planner:project', JSON.stringify(saved));
  });
  await page.reload();

  const screen = page.getByTestId('planner-error');
  await expect(screen).toBeVisible();
  await expect(screen).toContainText('Something went wrong');
  await expect(screen).toContainText('still saved in this browser');

  // The plan can be taken out as a file …
  const [download] = await Promise.all([page.waitForEvent('download'), screen.getByRole('button', { name: 'Download backup' }).click()]);
  expect(download.suggestedFilename()).toBe('Broken shop.backup.sf.json');

  // … and the planner opens again without it; the broken plan is kept aside.
  await screen.getByRole('button', { name: 'Start with an empty plan' }).click();
  await expect(page.getByRole('button', { name: 'Draw area' })).toBeVisible();
  await expect(screen).toHaveCount(0);
  const kept = await page.evaluate(() => localStorage.getItem('sf-planner:project:crashed'));
  expect(JSON.parse(kept!).state.project.name).toBe('Broken shop');
});
