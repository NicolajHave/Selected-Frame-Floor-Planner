import type { Project } from '@/model/project';
import type { SelectionKind } from '@/model/objects';

/** What the floor-layout lock holds in place. */
const LAYOUT_KINDS: readonly SelectionKind[] = ['corner', 'wall', 'room', 'opening', 'pillar'];

export const isLayoutKind = (kind: SelectionKind) => LAYOUT_KINDS.includes(kind);

/** Whether the selected thing is held in place: by the layout lock, or its own. */
export function isLocked(project: Pick<Project, 'layoutLocked' | 'inventory'>, sel: { kind: SelectionKind; id: string }) {
  if (sel.kind === 'inventory') return !!project.inventory.find((x) => x.id === sel.id)?.locked;
  return isLayoutKind(sel.kind) && !!project.layoutLocked;
}

export const LAYOUT_LOCKED_MESSAGE =
  'The floor layout is locked: walls, doors, windows and pillars stay as they are. Unlock it in the top bar to change them.';

export const itemLockedMessage = (name: string) =>
  `${name} is locked in place. Unlock it in its panel (or press L) to move it.`;
