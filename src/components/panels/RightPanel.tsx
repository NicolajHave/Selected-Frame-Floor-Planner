'use client';

import { usePlannerStore } from '@/store/plannerStore';
import { EmptySelection } from './EmptySelection';
import { CornerProperties } from './CornerProperties';
import { PillarProperties } from './PillarProperties';
import { InventoryProperties } from './InventoryProperties';
import { RoomProperties } from './RoomProperties';
import { OpeningProperties } from './OpeningProperties';

export function RightPanel() {
  const selection = usePlannerStore((s) => s.selection);

  if (!selection) return <EmptySelection />;

  switch (selection.kind) {
    case 'corner':    return <CornerProperties cornerId={selection.id} />;
    case 'pillar':    return <PillarProperties id={selection.id} />;
    case 'inventory': return <InventoryProperties id={selection.id} />;
    case 'room':      return <RoomProperties />;
    case 'opening':   return <OpeningProperties id={selection.id} />;
    default:          return <EmptySelection />;
  }
}
