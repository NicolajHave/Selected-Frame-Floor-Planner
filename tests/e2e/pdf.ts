import fs from 'node:fs';
import { expect, type Page } from '@playwright/test';

/** Text of each page, via pdf.js. */
export async function pdfText(file: string): Promise<string[]> {
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

/** Opens the PDF dialog, optionally types notes, and exports. */
export async function exportPdf(page: Page, opts: { notes?: string; views?: boolean } = {}) {
  await page.getByRole('button', { name: 'PDF', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Export PDF' });
  if (opts.notes !== undefined) await dialog.getByRole('textbox').fill(opts.notes);
  if (opts.views === false) await dialog.getByRole('checkbox', { name: /3D views/ }).uncheck();
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 60_000 }),
    dialog.getByRole('button', { name: 'Export PDF' }).click(),
  ]);
  await expect(dialog).toBeHidden();
  const file = (await download.path())!;
  if (process.env.SHOTS_DIR) fs.copyFileSync(file, `${process.env.SHOTS_DIR}/${download.suggestedFilename()}`);
  return { download, file };
}

export const pageWith = (pages: string[], text: string) => pages.find((p) => p.includes(text)) ?? '';
