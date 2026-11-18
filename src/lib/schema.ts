import type { Project } from '@/model/project';
import type { InventoryItem } from '@/model/objects';
import { rackSize } from './racks';
import { externalizeProject } from './assets';

export const CURRENT_SCHEMA = 1 as const;

/**
 * Future-proofing hook. Today we accept only schemaVersion === 1.
 * When the schema evolves, route old payloads through migrators here
 * so stored JSON keeps loading.
 */
export function migrate(payload: unknown): Project {
  if (typeof payload !== 'object' || payload === null) {
    throw new Error('Invalid project file: not an object.');
  }
  const candidate = payload as Partial<Project> & { schemaVersion?: number };
  if (candidate.schemaVersion !== CURRENT_SCHEMA) {
    throw new Error(
      `Unsupported schema version: ${String(candidate.schemaVersion)}. Expected ${CURRENT_SCHEMA}.`,
    );
  }
  // Minimal structural validation. A full validator (zod) is post-MVP.
  if (!('pillars' in candidate) || !Array.isArray(candidate.pillars)) {
    throw new Error('Invalid project file: missing pillars[].');
  }
  if (!('inventory' in candidate) || !Array.isArray(candidate.inventory)) {
    throw new Error('Invalid project file: missing inventory[].');
  }
  const project = candidate as Project;
  // A wall rack's footprint follows from its units. Racks saved before the
  // units shared their centre uprights (and before the 1400 units were
  // 1506 mm) are brought up to date around their own centre.
  const refresh = (items: InventoryItem[]) =>
    items.map((it) => (it.modules?.length ? { ...it, size: rackSize(it.modules) } : it));
  project.inventory = refresh(project.inventory);
  if (Array.isArray(project.variants)) {
    project.variants = project.variants.map((v) => (Array.isArray(v.inventory) ? { ...v, inventory: refresh(v.inventory) } : v));
  }
  // Rooms saved before doors and openings existed have no openings array.
  if (project.room && !Array.isArray(project.room.openings)) {
    project.room = { ...project.room, openings: [] };
  }
  // The drawing is kept outside the plan (lib/assets): one saved inline,
  // as plans used to be, is taken into the store and replaced by a reference.
  return externalizeProject(project);
}
