import path from 'node:path';
import { readFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import { openFresh, saved, trackErrors } from './helpers';
import { FakeCloud, signIn } from './fakeCloud';

const ROOM_DXF = path.join(__dirname, '../fixtures/room-cm.dxf');
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
  expect(errors.filter((e) => !/status of 4\d\d/.test(e))).toEqual([]);
});

async function openDrive(page: Page) {
  await page.getByRole('button', { name: 'From cloud drive…' }).click();
  return page.getByRole('dialog', { name: 'Cloud drive' });
}

test('the drive is offered only when signed in', async ({ page }) => {
  await expect(page.getByRole('button', { name: 'Import plan (PDF, image, DWG/DXF)' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'From cloud drive…' })).toHaveCount(0);
  await signIn(page, ME);
  await expect(page.getByRole('button', { name: 'From cloud drive…' })).toBeVisible();
});

test('upload a drawing, import it as the plan, and delete it', async ({ page }) => {
  await signIn(page, ME);
  const dialog = await openDrive(page);
  await expect(dialog).toContainText('No drawings on the drive yet.');

  await dialog.getByLabel('Shop (optional)').fill('Printemps Haussmann');
  await dialog.getByTestId('drive-file').setInputFiles(ROOM_DXF);
  const list = dialog.getByTestId('drive-list');
  await expect(list).toContainText('room-cm.dxf');
  await expect(list).toContainText('Printemps Haussmann');
  await expect(list).toContainText('by you');

  // Stored byte for byte, under a fresh folder.
  const [name, file] = [...fake.files][0]!;
  expect(name).toMatch(/^[0-9a-f-]{36}\/room-cm\.dxf$/);
  expect(file.bytes.equals(readFileSync(ROOM_DXF))).toBe(true);
  expect(fake.drawings[0]).toMatchObject({ file_name: 'room-cm.dxf', shop: 'Printemps Haussmann', uploaded_by_email: ME });

  // Using it opens the same CAD import as a file from disk.
  await list.getByRole('button', { name: 'Use as plan' }).click();
  const cad = page.getByRole('dialog', { name: 'CAD drawing · keep the part you need' });
  await expect(cad.getByTestId('cad-size')).toContainText('whole drawing 10.6 m × 6.6 m');
  await cad.getByRole('button', { name: 'Use whole drawing' }).click();
  await expect(page.locator('[data-layer="underlay"] image')).toBeVisible();
  const u = (await saved(page)).underlay;
  expect(u).toMatchObject({ fileName: 'room-cm.dxf', fromCad: true, calibrated: true });

  // Delete it again (from the "Replace" entry, now that a plan is in).
  await page.getByRole('button', { name: 'Replace from cloud drive…' }).click();
  page.once('dialog', (d) => d.accept());
  await page.getByRole('dialog', { name: 'Cloud drive' }).getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByRole('dialog', { name: 'Cloud drive' })).toContainText('No drawings on the drive yet.');
  expect(fake.files.size).toBe(0);
  expect(fake.drawings).toHaveLength(0);
});

test('colleagues’ drawings can be used and searched, but not deleted', async ({ page }) => {
  // A colleague uploaded two drawings.
  for (const [n, shop] of [['lyon.dwg', 'Galeries Lafayette Lyon'], ['berlin.pdf', 'KaDeWe']] as const) {
    const p = `11111111-1111-4111-8111-${String(fake.drawings.length).padStart(12, '0')}/${n}`;
    fake.files.set(p, { bytes: Buffer.from('x'), owner: COLLEAGUE, contentType: 'application/octet-stream' });
    fake.drawings.push({ id: `d${n}`, path: p, file_name: n, shop, size_bytes: 2_400_000, uploaded_by_email: COLLEAGUE, uploaded_at: new Date().toISOString() });
  }
  await signIn(page, ME);
  const dialog = await openDrive(page);
  const list = dialog.getByTestId('drive-list');
  await expect(list.locator('li')).toHaveCount(2);
  await expect(list).toContainText(`2.3 MB`);
  await expect(list).toContainText(COLLEAGUE);
  await expect(list.getByRole('button', { name: 'Delete' })).toHaveCount(0);
  await expect(list.getByRole('button', { name: 'Use as plan' })).toHaveCount(2);

  await dialog.getByLabel('Search the drive').fill('lyon');
  await expect(list.locator('li')).toHaveCount(1);
  await expect(list).toContainText('lyon.dwg');
  await dialog.getByLabel('Search the drive').fill('nothing like this');
  await expect(dialog).toContainText('Nothing matches.');
});

test('only drawings and images are uploaded', async ({ page }) => {
  await signIn(page, ME);
  const dialog = await openDrive(page);
  await dialog.getByTestId('drive-file').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hi') });
  await expect(dialog).toContainText('Upload a PDF, DWG, DXF or image');
  expect(fake.files.size).toBe(0);
});
