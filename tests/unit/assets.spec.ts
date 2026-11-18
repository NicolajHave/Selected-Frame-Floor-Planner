import { test, expect } from '@playwright/test';
import {
  assetIdOf, autosaveProject, ensureAsset, externalizeProject, imageId, inlineProject, internImage, isAssetRef, resolveSrc,
} from '@/lib/assets';
import { migrate } from '@/lib/schema';
import type { PlanUnderlay } from '@/model/project';
import type { Mm } from '@/model/units';

const picture = (seed: string) => `data:image/jpeg;base64,${seed.repeat(4000)}`;
const underlay = (src: string): PlanUnderlay => ({
  src, fileName: 'plan.pdf', position: { x: 0 as Mm, y: 0 as Mm }, width: 20000 as Mm, aspect: 0.7, opacity: 0.6, locked: true, calibrated: true,
});

test('a picture gets an id made from itself, and the plan a reference to it', () => {
  const a = picture('AbC1');
  const ref = internImage(a);
  expect(isAssetRef(ref)).toBe(true);
  expect(ref).toMatch(/^asset:a[0-9a-f]{28}$/);
  // The same picture is the same asset; another picture is another.
  expect(internImage(a)).toBe(ref);
  expect(assetIdOf(ref)).toBe(imageId(a));
  expect(internImage(picture('AbC2'))).not.toBe(ref);
  expect(resolveSrc(ref)).toBe(a);
  // A reference, or anything else that is not a picture, passes through.
  expect(internImage(ref)).toBe(ref);
  expect(resolveSrc('asset:a' + '0'.repeat(28))).toBeNull();
  expect(isAssetRef('asset:nonsense')).toBe(false);
});

test('opening a plan takes its drawing out; a file gets it back', () => {
  const a = picture('Plan');
  const opened = migrate({
    schemaVersion: 1, id: 'p', name: 'Shop', createdAt: '', updatedAt: '', units: 'mm', room: null, pillars: [], inventory: [],
    underlay: underlay(a),
  });
  expect(isAssetRef(opened.underlay!.src)).toBe(true);
  expect(JSON.stringify(opened).length).toBeLessThan(1000); // the megabyte is not in the plan any more
  // Everything else about the drawing stays in the plan.
  expect(opened.underlay).toMatchObject({ fileName: 'plan.pdf', width: 20000, calibrated: true });

  // A saved file stands on its own.
  const file = inlineProject(opened);
  expect(file.underlay!.src).toBe(a);
  expect(opened.underlay!.src).not.toBe(a); // the open plan is left as it was
  // And opening that file gives the same reference again.
  expect(externalizeProject(file).underlay!.src).toBe(opened.underlay!.src);
  // A plan without a drawing is untouched.
  const bare = { underlay: null };
  expect(externalizeProject(bare)).toBe(bare);
  expect(inlineProject(bare)).toBe(bare);
});

test('without a safe place in the browser the autosave keeps the picture inline', () => {
  // No IndexedDB here (as in a locked-down browser): nothing has been stored durably.
  const a = picture('Safe');
  const plan = externalizeProject({ underlay: underlay(a) });
  expect(isAssetRef(plan.underlay!.src)).toBe(true);
  expect(autosaveProject(plan).underlay!.src).toBe(a);
});

test('a picture fetched from elsewhere is only accepted if it is the one asked for', async () => {
  const a = picture('Right');
  const id = imageId(a);
  expect(await ensureAsset(id, async () => picture('Wrong'))).toBe(false);
  expect(resolveSrc(`asset:${id}`)).toBeNull();
  expect(await ensureAsset(id, async () => null)).toBe(false);
  expect(await ensureAsset(id, async () => { throw new Error('offline'); })).toBe(false);
  // Trying again when it can be had works.
  expect(await ensureAsset(id, async () => a)).toBe(true);
  expect(resolveSrc(`asset:${id}`)).toBe(a);
});
