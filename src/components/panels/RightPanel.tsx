'use client';

import { selectedMembers, usePlannerStore } from '@/store/plannerStore';
import { GroupProperties } from './GroupProperties';
import { EmptySelection } from './EmptySelection';
import { CornerProperties } from './CornerProperties';
import { PillarProperties } from './PillarProperties';
import { InventoryProperties } from './InventoryProperties';
import { RoomProperties } from './RoomProperties';
import { OpeningProperties } from './OpeningProperties';
import { WallProperties } from './WallProperties';
import { ElectricalProperties } from './ElectricalProperties';
import { NoteProperties } from './NoteProperties';
import { LockIcon } from '../ui/LockIcon';

export function RightPanel() {
  const selection = usePlannerStore((s) => s.selection);
  const grouped = usePlannerStore((s) => selectedMembers(s).length > 1);

  if (!selection) return <EmptySelection />;
  if (grouped) return <GroupProperties />;

  switch (selection.kind) {
    case 'corner':    return <LayoutGate><CornerProperties cornerId={selection.id} /></LayoutGate>;
    case 'pillar':    return <LayoutGate><PillarProperties id={selection.id} /></LayoutGate>;
    case 'inventory': return <InventoryProperties id={selection.id} />;
    case 'room':      return <LayoutGate><RoomProperties /></LayoutGate>;
    case 'opening':   return <LayoutGate><OpeningProperties id={selection.id} /></LayoutGate>;
    case 'wall':      return <LayoutGate><WallProperties cornerId={selection.id} /></LayoutGate>;
    case 'electrical': return <ElectricalProperties id={selection.id} />;
    case 'note':      return <NoteProperties id={selection.id} />;
    default:          return <EmptySelection />;
  }
}

/** Walls, corners, doors, windows and pillars: read-only while the floor layout is locked. */
function LayoutGate({ children }: { children: React.ReactNode }) {
  const locked = usePlannerStore((s) => !!s.project.layoutLocked);
  const setLayoutLocked = usePlannerStore((s) => s.setLayoutLocked);
  if (!locked) return <>{children}</>;
  return (
    <div className="flex flex-col">
      <div className="m-4 mb-0 flex items-start gap-2 rounded-[2px] border border-wall-200 bg-wall-100 px-3 py-2 text-[11px] leading-snug text-ink-700">
        <span className="mt-[1px] text-ink-900">
          <LockIcon locked />
        </span>
        <span className="flex-1">The floor layout is locked, so this can&rsquo;t be changed.</span>
        <button className="shrink-0 font-medium text-ink-900 underline" onClick={() => setLayoutLocked(false)}>
          Unlock
        </button>
      </div>
      <fieldset disabled className="min-w-0 opacity-60" data-testid="layout-locked">
        {children}
      </fieldset>
    </div>
  );
}
