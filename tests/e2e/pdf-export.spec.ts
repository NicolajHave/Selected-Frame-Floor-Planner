import fs from 'node:fs';
import { test, expect } from '@playwright/test';
import { drawRoom, openFresh, place, toScreen, trackErrors } from './helpers';

/** Text of each page, via pdf.js. */
async function pdfText(file: string): Promise<string[]> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(file)), verbosity: 0 }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    pages.push(content.items.map((it: { str: string }) => it.str).join(' '));
  }
  return pages;
}

test('export an A3 plan PDF with legend, parts list and layout check', async ({ page }) => {
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

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'PDF', exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('untitled-plan-plan.pdf');
  const file = (await download.path())!;
  expect(fs.readFileSync(file).subarray(0, 5).toString()).toBe('%PDF-');

  const [plan, list] = await pdfText(file);
  // Page 1: drawing at a standard scale, legend and title block
  expect(plan).toContain('Untitled plan');
  expect(plan).toContain('Scale 1:50 on A3');
  expect(plan).toContain('FIXTURES');
  expect(plan).toContain('2× Floor Rack 1400');
  expect(plan).toContain('105-99-004');
  expect(plan).toContain('70,00 m²');
  expect(plan).toContain('34,00 m');
  expect(plan).toContain('900'); // door width
  // Page 2: parts list, checks and notes
  expect(list).toContain('Parts list');
  expect(list).toContain('Floor Rack 1400');
  expect(list).toContain('Total');
  expect(list).toContain('Layout check');
  expect(list).toContain('Only 390 mm between Floor Rack 1400 and Floor Rack 1400.');
  expect(list).toContain('walls must be at least 2,6 m high');
  expect(errors).toEqual([]);
});

test('an empty project still exports', async ({ page }) => {
  await openFresh(page);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'PDF', exact: true }).click(),
  ]);
  const [plan] = await pdfText((await download.path())!);
  expect(plan).toContain('Nothing to draw yet');
});
