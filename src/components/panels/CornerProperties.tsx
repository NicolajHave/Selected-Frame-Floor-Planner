'use client';

import { usePlannerStore } from '@/store/plannerStore';
import { mm } from '@/model/units';
import { Section } from '../ui/Section';
import { NumberField } from '../ui/NumberField';
import { Button } from '../ui/Button';

export function CornerProperties({ cornerId }: { cornerId: string }) {
  const room = usePlannerStore((s) => s.project.room);
  const moveCorner = usePlannerStore((s) => s.moveCorner);
  const deleteCorner = usePlannerStore((s) => s.deleteCorner);

  const corner = room?.corners.find((c) => c.id === cornerId) ?? null;
  if (!corner) return null;

  return (
    <div className="flex h-full flex-col">
      <Section title="Corner">
        <div className="flex flex-col gap-1">
          <p className="font-display text-[18px] italic leading-tight text-ink-900">Vertex</p>
          <p className="text-[11px] text-ink-500 font-mono">{corner.id}</p>
        </div>
      </Section>

      <div className="h-px bg-wall-200" />

      <Section title="Position (world)">
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            label="X"
            unit="mm"
            value={corner.point.x}
            step={10}
            onCommit={(v) => moveCorner(cornerId, { x: mm(v), y: corner.point.y })}
          />
          <NumberField
            label="Y"
            unit="mm"
            value={corner.point.y}
            step={10}
            onCommit={(v) => moveCorner(cornerId, { x: corner.point.x, y: mm(v) })}
          />
        </div>
      </Section>

      <div className="h-px bg-wall-200" />

      <Section title="Actions">
        <Button variant="subtle" onClick={() => deleteCorner(cornerId)}>
          Delete corner
        </Button>
        <p className="text-[11px] leading-relaxed text-ink-500">
          A closed room must keep at least three corners.
        </p>
      </Section>
    </div>
  );
}
