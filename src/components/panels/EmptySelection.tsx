'use client';

import { usePlannerStore } from '@/store/plannerStore';
import { useDerivedMetrics } from '@/store/selectors';
import { formatArea, formatLength } from '@/model/units';
import { Section } from '../ui/Section';
import { PartsListSection } from './PartsListSection';
import { PlanUnderlaySection } from './PlanUnderlaySection';
import { LayoutCheckSection } from './LayoutCheckSection';

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

      <LayoutCheckSection />

      <div className="h-px bg-wall-200" />

      <PlanUnderlaySection />

      <div className="h-px bg-wall-200" />

      <PartsListSection />

      <div className="h-px bg-wall-200" />

      <Section title="Shortcuts">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px] text-ink-700">
          <Key k="⌘Z / ⇧⌘Z">Undo / redo</Key>
          <Key k="R / ⇧R">Rotate 90° · doors: flip hinge / swing</Key>
          <Key k="123 + Enter">While drawing: exact wall length</Key>
          <Key k="⇧ + click">Select several</Key>
          <Key k="⇧ + drag">Select everything in a box</Key>
          <Key k="⌘A">Select all fixtures, pillars and notes</Key>
          <Key k="⌘D">Duplicate selected</Key>
          <Key k="Delete">Remove selected</Key>
          <Key k="Alt + drag">Place freely, no wall snap</Key>
          <Key k="Esc">Cancel tool / deselect</Key>
        </dl>
        <p className="text-[11px] leading-relaxed text-ink-500">
          Your plan is saved automatically in this browser. Use Save to keep a file copy.
        </p>
      </Section>
    </div>
  );
}

function Key({ k, children }: { k: string; children: string }) {
  return (
    <>
      <dt className="font-mono text-[11px] text-ink-900">{k}</dt>
      <dd>{children}</dd>
    </>
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
