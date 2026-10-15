import fs from 'node:fs';
import { test, expect } from '@playwright/test';
import { drawRoom, openFresh, place, saved, toScreen, trackErrors } from './helpers';
import { exportPdf, pageWith, pdfText } from './pdf';

test('export an A3 presentation PDF: cover, concept, 3D views, plan, elevations, parts list', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = trackErrors(page);
  await openFresh(page);
  const room = await drawRoom(page); // ≈ 10 × 7 m
  await page.getByTitle('Place Door', { exact: true }).click();
  const d = await toScreen(page, room.minX + 5000, room.minY + 150);
  await page.mouse.click(d.x, d.y);
  await place(page, 'Wall Unit 1400 - Shelves', room.minX + 2000, room.minY + 400);
  await place(page, 'Floor Rack 1400', room.minX + 3000, room.minY + 3500);
  await place(page, 'Floor Rack 1400', room.minX + 4700, room.minY + 3500); // 390 mm aisle
  await place(page, 'Corona Light Logo', room.minX + 7500, room.minY + 300);

  const { download, file } = await exportPdf(page, { notes: 'Power needed behind the shelves.' });
  expect(download.suggestedFilename()).toBe('untitled-plan-plan.pdf');
  expect(fs.readFileSync(file).subarray(0, 5).toString()).toBe('%PDF-');
  // Notes are kept with the plan.
  await saved(page);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('sf-planner:project') ?? '{}'));
  expect(stored.state.project.notes).toBe('Power needed behind the shelves.');

  const pages = await pdfText(file);
  // Cover, concept, 4 × 3D, isometric, plan, elevations (long walls: two a page), parts list
  expect(pages).toHaveLength(11);
  expect(pages[0]).toContain('Selected');
  expect(pages[0]).toContain('Untitled plan');
  expect(pages[0]).toContain('SELECTEDSIS@bestseller.com');
  expect(pages[0]).toContain('1/11');
  expect(pages[0]).not.toContain('LIVE 3D VIEW'); // not a cloud plan
  expect(pages[1]).toContain('What the concept involves');
  expect(pages[1]).toContain('SITE READINESS');
  expect(pages[1]).toContain('Power needed behind the shelves.');
  expect(pages.filter((p) => p.startsWith('3D View'))).toHaveLength(4);
  expect(pages[6]).toContain('Isometric View');

  const plan = pageWith(pages, 'Plan View');
  // The drawing at a standard scale, legend and title block
  expect(plan).toContain('Untitled plan');
  expect(plan).toContain('W1');
  expect(plan).toContain('Scale 1:50 on A3');
  expect(plan).toContain('FIXTURES');
  expect(plan).toContain('2× Floor Rack 1400');
  expect(plan).toContain('105-99-004');
  expect(plan).toContain('70,00 m²');
  expect(plan).toContain('34,00 m');
  expect(plan).toContain('900'); // door width
  // Elevations: every wall, heights from the floor to the wall top and the logo
  const elevations = pages.filter((p) => p.startsWith('Elevations')).join(' ');
  for (const w of ['Wall 1', 'Wall 2', 'Wall 3', 'Wall 4']) expect(elevations).toContain(w);
  expect(elevations).toContain('10,00 m long');
  expect(elevations).toContain('2.400'); // logo bottom edge
  expect(elevations).toContain('mm');
  // Parts list, checks and notes
  const list = pageWith(pages, 'Parts list & checks');
  expect(list).toContain('Parts list');
  expect(list).toContain('Floor Rack 1400');
  expect(list).toContain('Total');
  expect(list).toContain('Layout check');
  expect(list).toContain('Only 390 mm between Floor Rack 1400 and Floor Rack 1400.');
  expect(list).toContain('walls must be at least 2,6 m high');
  expect(errors).toEqual([]);
});

test('the live link needs a cloud plan', async ({ page }) => {
  await openFresh(page);
  await page.getByRole('button', { name: 'PDF', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Export PDF' });
  await expect(dialog.getByRole('checkbox', { name: /Live 3D link/ })).toBeDisabled();
  await expect(dialog).toContainText('Save the plan to the cloud to include a live link.');
});

test('an empty project still exports', async ({ page }) => {
  await openFresh(page);
  const { file } = await exportPdf(page);
  const pages = await pdfText(file);
  expect(pageWith(pages, 'Plan View')).toContain('Nothing to draw yet');
  expect(pages.some((p) => p.startsWith('3D View'))).toBe(false);
});
