import type { Point } from '@/model/geometry';

/** Where the pointer last was over the 2D plan (world mm), or null when it left: pasting goes there. */
export const planPointer: { world: Point | null } = { world: null };
