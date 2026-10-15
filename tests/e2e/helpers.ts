import { expect, type Page } from '@playwright/test';

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export const deg = (r: number) => Math.round(((r * 180) / Math.PI) * 10) / 10;

/** Load the planner with an empty autosave. Real Supabase traffic is blocked. */
export async function openFresh(page: Page) {
  // Tests must never reach the shared database; FakeCloud.install() routes
  // registered after this take precedence.
  await page.route(/supabase\.co/, (route) => route.abort());
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByRole('button', { name: 'Draw area' })).toBeVisible();
}

/** The autosaved project, i.e. exactly what the store holds. */
export async function saved(page: Page) {
  return page.evaluate(() => {
    window.__sfFlushAutosave?.(); // autosave is batched; write it now
    return JSON.parse(localStorage.getItem('sf-planner:project') ?? 'null')?.state?.project;
  });
}

export function canvas(page: Page) {
  return page.locator('div.flex-1 > svg');
}

/** World mm -> page px, using the canvas' live pan/zoom transform. */
export async function toScreen(page: Page, x: number, y: number) {
  const box = (await canvas(page).boundingBox())!;
  const t = await page
    .locator('g[data-layer="world"]')
    .getAttribute('transform');
  const [, px, py, z] = t!.match(/translate\(([-\d.e]+) ([-\d.e]+)\) scale\(([-\d.e]+)\)/)!.map(Number);
  return { x: box.x + px! + x * z!, y: box.y + py! + y * z! };
}

/**
 * Draw a rectangle by clicking four screen offsets from the canvas centre
 * (default ≈ 10 m × 7 m at the initial zoom) and close it.
 */
export async function drawRoom(page: Page, halfW = 250, halfH = 175): Promise<Bounds> {
  await page.getByRole('button', { name: 'Draw area' }).click();
  const box = (await canvas(page).boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const pts = [[-halfW, -halfH], [halfW, -halfH], [halfW, halfH], [-halfW, halfH]] as const;
  for (const [dx, dy] of pts) await page.mouse.click(cx + dx, cy + dy);
  await page.mouse.click(cx + pts[0][0], cy + pts[0][1]);
  await expect.poll(async () => (await saved(page))?.room?.closed).toBe(true);
  const p = await saved(page);
  const xs = p.room.corners.map((c: { point: { x: number } }) => c.point.x);
  const ys = p.room.corners.map((c: { point: { y: number } }) => c.point.y);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

/** Pick a library item and click the 2D canvas at a world position. */
export async function place(page: Page, title: string, x: number, y: number, opts: { alt?: boolean } = {}) {
  const before = (await saved(page))?.inventory.length ?? 0;
  await page.getByTitle(`Place ${title}`, { exact: true }).click();
  const s = await toScreen(page, x, y);
  if (opts.alt) await page.keyboard.down('Alt');
  await page.mouse.click(s.x, s.y);
  if (opts.alt) await page.keyboard.up('Alt');
  await expect.poll(async () => (await saved(page)).inventory.length).toBe(before + 1);
  return (await saved(page)).inventory.at(-1);
}

/** Collects console errors so a test can assert there were none. */
export function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !/favicon|404/.test(m.text())) errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}
