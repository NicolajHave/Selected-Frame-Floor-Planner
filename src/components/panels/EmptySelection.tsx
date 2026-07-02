'use client';

import { usePlannerStore } from '@/store/plannerStore';
import { useDerivedMetrics } from '@/store/selectors';
import { formatArea, formatLength } from '@/model/units';
import { Section } from '../ui/Section';

export function EmptySelection() {
  const project = usePlannerStore((s) => s.project);
  const metrics = useDerivedMetrics();

  const totalWalls = metrics?.wallLengths.reduce((a, b) => a + b, 0) ?? 0;

  return (
    <div className="flex h-full flex-col">
      <Section title="Project">
        <div className="flex flex-col gap-1">
          <p className="font-display text-[18px] italic leading-tight text-ink-900">
            {project.name}
          </p>
          {/* suppressHydrationWarning: updatedAt is minted at store init, so
              the statically prerendered value never matches the client's. */}
          <p className="text-[11px] text-ink-500" suppressHydrationWarning>
            {new Date(project.updatedAt).toLocaleString()}
          </p>
        </div>
      </Section>

      <div className="h-px bg-wall-200" />

      <Section title="Plan summary">
        <Stat label="Corners" value={`${project.room?.corners.length ?? 0}`} />
        <Stat label="Pillars" value={`${project.pillars.length}`} />
        <Stat label="Inventory items" value={`${project.inventory.length}`} />
        {project.room?.closed && (
          <>
            <Stat label="Total wall length" value={formatLength(totalWalls)} />
            <Stat label="Floor area" value={formatArea(metrics?.area ?? 0)} />
          </>
        )}
      </Section>

      <div className="h-px bg-wall-200" />

      <Section title="Tip">
        <p className="text-[12px] leading-relaxed text-ink-700">
          Click anywhere on the canvas to deselect. Use the toolbar above to draw the room or
          add objects. Select an object to edit its properties here.
        </p>
      </Section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-[11px] text-ink-500">{label}</span>
      <span className="font-mono text-[12px] text-ink-900">{value}</span>
    </div>
  );
}
