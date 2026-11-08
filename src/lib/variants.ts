import type { InventoryItem } from '@/model/objects';
import type { LayoutVariant, Project } from '@/model/project';
import { newId } from './id';

/**
 * Layout variants: several fixture layouts for the same shop. The room,
 * walls, openings, pillars, electrical points, notes and the plan underlay
 * are shared; each variant has its own fixtures (with their accessories).
 *
 * The active variant's fixtures are `project.inventory`, so everything else
 * in the planner keeps working on them unchanged; the other variants keep
 * theirs in `project.variants[i].inventory`.
 */

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
/** More than this many layouts gets hard to compare. */
export const MAX_VARIANTS = 6;

export interface VariantSummary {
  id: string;
  name: string;
  active: boolean;
}

export function variantList(p: Pick<Project, 'variants' | 'activeVariantId'>): VariantSummary[] {
  return (p.variants ?? []).map((v) => ({ id: v.id, name: v.name, active: v.id === p.activeVariantId }));
}

/** "Layout A", "Layout B", … the first letter not taken yet. */
export function nextVariantName(taken: readonly string[]): string {
  for (const l of LETTERS) {
    const name = `Layout ${l}`;
    if (!taken.includes(name)) return name;
  }
  return `Layout ${taken.length + 1}`;
}

/** A variant's fixtures, wherever they are kept. */
export function variantInventory(p: Project, id: string): InventoryItem[] {
  if (id === p.activeVariantId || !p.variants?.length) return p.inventory;
  return p.variants.find((v) => v.id === id)?.inventory ?? [];
}

/** Fixtures copied with fresh ids, so the layouts never share an object. */
export function copyInventory(items: readonly InventoryItem[]): InventoryItem[] {
  return (JSON.parse(JSON.stringify(items)) as InventoryItem[]).map((it) => ({
    ...it,
    id: newId('inv'),
    ...(it.accessories ? { accessories: it.accessories.map((a) => ({ ...a, id: newId('acc') })) } : {}),
  }));
}

/**
 * Adds a layout and makes it the active one: a copy of the current layout,
 * or an empty one (just the room). The first call also turns the current
 * layout into "Layout A". Returns the new variant's id, or null at the limit.
 */
export function addVariant(p: Project, mode: 'copy' | 'empty', name?: string): string | null {
  if (!p.variants?.length) {
    const first: LayoutVariant = { id: newId('var'), name: nextVariantName([]) };
    p.variants = [first];
    p.activeVariantId = first.id;
  }
  const variants = p.variants!;
  if (variants.length >= MAX_VARIANTS) return null;
  const inventory = mode === 'copy' ? copyInventory(p.inventory) : [];
  const v: LayoutVariant = {
    id: newId('var'),
    name: name?.trim() || nextVariantName(variants.map((x) => x.name)),
  };
  variants.push(v);
  stash(p);
  p.inventory = inventory;
  p.activeVariantId = v.id;
  return v.id;
}

/** Puts the active layout's fixtures away in its variant entry. */
function stash(p: Project) {
  const active = p.variants?.find((v) => v.id === p.activeVariantId);
  if (active) active.inventory = p.inventory;
}

/** Makes `id` the active layout. Returns false if it doesn't exist or already is. */
export function switchVariant(p: Project, id: string): boolean {
  const target = p.variants?.find((v) => v.id === id);
  if (!target || id === p.activeVariantId) return false;
  stash(p);
  p.inventory = target.inventory ?? [];
  delete target.inventory;
  p.activeVariantId = id;
  return true;
}

export function renameVariant(p: Project, id: string, name: string): boolean {
  const v = p.variants?.find((x) => x.id === id);
  const next = name.trim().slice(0, 60);
  if (!v || !next || v.name === next) return false;
  v.name = next;
  return true;
}

/**
 * Removes a layout (the active one hands over to its neighbour). With one
 * layout left, the plan goes back to having no variants at all.
 */
export function deleteVariant(p: Project, id: string): boolean {
  const list = p.variants;
  const at = list?.findIndex((v) => v.id === id) ?? -1;
  if (!list || at < 0 || list.length < 2) return false;
  if (id === p.activeVariantId) switchVariant(p, list[at === 0 ? 1 : at - 1]!.id);
  list.splice(at, 1);
  if (list.length === 1) {
    delete p.variants;
    delete p.activeVariantId;
  }
  return true;
}

/** The active layout's name, when the plan has variants. */
export function activeVariantName(p: Pick<Project, 'variants' | 'activeVariantId'>): string | null {
  return p.variants?.find((v) => v.id === p.activeVariantId)?.name ?? null;
}

/** The plan with `id` as its active layout (for comparing or exporting), without changing `p`. */
export function withVariant(p: Project, id: string): Project {
  if (!p.variants?.length || id === p.activeVariantId) return p;
  return { ...p, inventory: variantInventory(p, id) };
}
