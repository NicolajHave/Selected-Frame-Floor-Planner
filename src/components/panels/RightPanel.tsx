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

export function RightPanel() {
  const selection = usePlannerStore((s) => s.selection);
  const grouped = usePlannerStore((s) => selectedMembers(s).length > 1);

  if (!selection) return <EmptySelection />;
  if (grouped) return <GroupProperties />;

  switch (selection.kind) {
    case 'corner':    return <CornerProperties cornerId={selection.id} />;
    case 'pillar':    return <PillarProperties id={selection.id} />;
    case 'inventory': return <InventoryProperties id={selection.id} />;
    case 'room':      return <RoomProperties />;
    case 'opening':   return <OpeningProperties id={selection.id} />;
    case 'wall':      return <WallProperties cornerId={selection.id} />;
    case 'electrical': return <ElectricalProperties id={selection.id} />;
    case 'note':      return <NoteProperties id={selection.id} />;
    default:          return <EmptySelection />;
  }
}
