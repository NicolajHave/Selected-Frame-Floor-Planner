import { test, expect, type Page } from '@playwright/test';
import { drawRoom, openFresh, place } from './helpers';
import { FakeCloud, signIn } from './fakeCloud';

const ME = 'planner@bestseller.com';
const COLLEAGUE = 'colleague@bestseller.com';

const note = (page: Page) => page.getByTestId('price-note');
const partsList = (page: Page) => page.getByTestId('details-panel');

async function openPrices(page: Page) {
  await page.getByRole('button', { name: 'File' }).click();
  await page.getByRole('menuitem', { name: 'Price list…' }).click();
  return page.getByRole('dialog', { name: 'Price list' });
}

test('the price list is edited in the planner and is in use for everyone signed in', async ({ page, browser }) => {
  const fake = new FakeCloud();
  await openFresh(page);
  await fake.install(page);
  const room = await drawRoom(page);
  await place(page, 'Floor Rack 1400', room.minX + 3000, room.minY + 3000);
  await page.keyboard.press('Escape');

  // Signed out: the built-in prices, and no way to change them.
  await expect(partsList(page)).toContainText('506 €');
  await expect(note(page)).toContainText('&elements quote 00309, rev. 03 (2026-02-16)');
  await page.getByRole('button', { name: 'File' }).click();
  await expect(page.getByRole('menuitem', { name: 'Price list…' })).toHaveCount(0);
  await page.keyboard.press('Escape');

  await signIn(page, ME);
  const dialog = await openPrices(page);
  const rack = dialog.getByLabel('Price of Floor Rack 1400', { exact: true });
  await expect(rack).toHaveValue('506');
  // Mannequins have their prices, and something without one says so.
  await expect(dialog.getByLabel('Price of Long Torso Female')).toHaveValue('440');
  await expect(dialog.getByLabel('Price of LED Logo')).toHaveValue('');

  // Something that is not a price cannot be saved.
  await rack.fill('five hundred');
  await expect(dialog.getByRole('alert')).toContainText('not a number');
  await expect(dialog.getByRole('button', { name: 'Save price list' })).toBeDisabled();

  await rack.fill('550,50');
  await dialog.getByLabel('Price of LED Logo').fill('900');
  await dialog.getByLabel('Name of the list').fill('Prices spring 2027');
  await dialog.getByLabel('Prices from').fill('2027-03-01');
  await dialog.getByRole('button', { name: 'Save price list' }).click();
  await expect(dialog.getByRole('status')).toContainText('Saved');
  await expect(dialog.getByTestId('price-history')).toContainText('Prices spring 2027');
  await expect(dialog.getByTestId('price-history')).toContainText(ME);
  expect(fake.priceLists).toHaveLength(1);
  expect(fake.priceLists[0]).toMatchObject({ name: 'Prices spring 2027', valid_from: '2027-03-01', saved_by_email: ME });
  expect(fake.priceLists[0]!.prices['105-06-001']).toBe(550.5);
  expect(fake.priceLists[0]!.prices['105-13-LED']).toBe(900);
  await page.keyboard.press('Escape');

  // The parts list uses it at once, and says which list the prices are from.
  await expect(partsList(page)).toContainText('550,5 €');
  await expect(note(page)).toContainText('Prices spring 2027 (2027-03-01)');

  // A colleague on another computer gets the same prices when signed in.
  const theirs = await browser.newContext();
  const colleague = await theirs.newPage();
  await openFresh(colleague);
  await fake.install(colleague);
  const r2 = await drawRoom(colleague);
  await place(colleague, 'Floor Rack 1400', r2.minX + 3000, r2.minY + 3000);
  await colleague.keyboard.press('Escape');
  await expect(partsList(colleague)).toContainText('506 €');
  await signIn(colleague, COLLEAGUE);
  await expect(partsList(colleague)).toContainText('550,5 €');
  await expect(note(colleague)).toContainText('Prices spring 2027');
  await theirs.close();
});

test('prices can be filled in from a CSV file, and an earlier list taken up again', async ({ page }) => {
  const fake = new FakeCloud();
  fake.priceLists.push({
    id: 1, name: 'Prices 2026', valid_from: '2026-06-01', prices: { '105-06-001': 520 },
    saved_by_email: COLLEAGUE, saved_at: '2026-06-01T08:00:00.000Z',
  });
  await openFresh(page);
  await fake.install(page);
  await signIn(page, ME);

  const dialog = await openPrices(page);
  const rack = dialog.getByLabel('Price of Floor Rack 1400', { exact: true });
  // The list in use is the one from the cloud; what it does not mention keeps the built-in price.
  await expect(dialog.getByLabel('Name of the list')).toHaveValue('Prices 2026');
  await expect(rack).toHaveValue('520');
  await expect(dialog.getByLabel('Price of Volume Table')).toHaveValue('3360');

  await dialog.getByTestId('price-csv').setInputFiles({
    name: 'prices.csv', mimeType: 'text/csv',
    buffer: Buffer.from('id;item number;name;price\n105-06-001;105-06-001;Floor Rack 1400;600\n105-17-001;;Volume Table;3.500,00\n'),
  });
  await expect(rack).toHaveValue('600');
  await expect(dialog.getByLabel('Price of Volume Table')).toHaveValue('3.500,00');
  await dialog.getByLabel('Name of the list').fill('Prices 2027');
  await dialog.getByRole('button', { name: 'Save price list' }).click();
  await expect(dialog.getByRole('status')).toContainText('Saved');
  expect(fake.priceLists).toHaveLength(2);
  expect(fake.priceLists[1]!.prices['105-17-001']).toBe(3500);

  // Both lists are in the history; the earlier one can be taken up again (and saved to put it back in use).
  const history = dialog.getByTestId('price-history');
  await expect(history.locator('li').first()).toContainText('Prices 2027');
  await expect(history.locator('li').first()).toContainText('in use');
  await history.locator('li', { hasText: 'Prices 2026' }).getByRole('button', { name: 'Take up' }).click();
  await expect(rack).toHaveValue('520');
  await expect(dialog.getByLabel('Name of the list')).toHaveValue('Prices 2026');
  // The built-in list is always there to go back to.
  await history.locator('li', { hasText: 'built into the planner' }).getByRole('button', { name: 'Take up' }).click();
  await expect(rack).toHaveValue('506');
});
