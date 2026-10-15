'use client';

import { usePlannerStore } from '@/store/plannerStore';
import { EmptySelection } from './EmptySelection';
import { CornerProperties } from './CornerProperties';
import { PillarProperties } from './PillarProperties';
import { InventoryProperties } from './InventoryProperties';
import { RoomProperties } from './RoomProperties';
import { OpeningProperties } from './OpeningProperties';
import { WallProperties } from './WallProperties';

export function RightPanel() {
  const selection = usePlannerStore((s) => s.selection);

  if (!selection) return <EmptySelection />;

  switch (selection.kind) {
    case 'corner':    return <CornerProperties cornerId={selection.id} />;
    case 'pillar':    return <PillarProperties id={selection.id} />;
    case 'inventory': return <InventoryProperties id={selection.id} />;
    case 'room':      return <RoomProperties />;
    case 'opening':   return <OpeningProperties id={selection.id} />;
    case 'wall':      return <WallProperties cornerId={selection.id} />;
    default:          return <EmptySelection />;
  }
}
