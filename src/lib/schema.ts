import type { Project } from '@/model/project';

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
  return candidate as Project;
}
