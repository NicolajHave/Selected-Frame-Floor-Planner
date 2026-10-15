'use client';

import { usePlannerStore } from '@/store/plannerStore';
import { useLayoutIssues } from '@/store/selectors';
import { DEFAULT_MIN_AISLE, type LayoutIssue } from '@/lib/layout';
import { Section } from '../ui/Section';
import { NumberField } from '../ui/NumberField';

const LABEL: Record<LayoutIssue['kind'], string> = {
  overlap: 'Overlap',
  wall: 'Wall',
  door: 'Door',
  aisle: 'Aisle',
};

/** Overview of layout problems, with the aisle rule and a plan toggle. */
export function LayoutCheckSection() {
  const issues = useLayoutIssues();
  const minAisle = usePlannerStore((s) => s.project.minAisle ?? DEFAULT_MIN_AISLE);
  const setMinAisle = usePlannerStore((s) => s.setMinAisle);
  const showOnPlan = usePlannerStore((s) => s.view.showLayoutCheck);
  const toggle = usePlannerStore((s) => s.toggleLayoutCheck);
  const select = useSelectIssue();

  return (
    <Section title={`Layout check${issues.length ? ` · ${issues.length}` : ''}`}>
      {issues.length === 0 ? (
        <p className="text-[12px] text-ink-500">No overlaps, blocked doors or narrow aisles.</p>
      ) : (
        <IssueList issues={issues} onSelect={select} />
      )}
      <NumberField
        label="Minimum aisle"
        unit="mm"
        value={minAisle}
        step={50}
        min={300}
        onCommit={setMinAisle}
      />
      <label className="flex items-center gap-2 text-[11px] text-ink-700">
        <input type="checkbox" checked={showOnPlan} onChange={toggle} />
        Show problems on the plan
      </label>
    </Section>
  );
}

/** Problems involving one object, for its property panel. */
export function ObjectIssues({ id }: { id: string }) {
  const issues = useLayoutIssues().filter((i) => i.objectIds.includes(id));
  if (issues.length === 0) return null;
  return <IssueList issues={issues} />;
}

function IssueList({ issues, onSelect }: { issues: LayoutIssue[]; onSelect?: (i: LayoutIssue) => void }) {
  return (
    <ul className="flex flex-col gap-1.5" data-testid="layout-issues">
      {issues.map((i) => {
        const warning = i.kind === 'aisle';
        const body = (
          <>
            <span
              className={
                warning
                  ? 'mt-px shrink-0 rounded-[2px] bg-amber-100 px-1 text-[9px] font-medium uppercase tracking-widest2 text-amber-900'
                  : 'mt-px shrink-0 rounded-[2px] bg-red-100 px-1 text-[9px] font-medium uppercase tracking-widest2 text-red-800'
              }
            >
              {LABEL[i.kind]}
            </span>
            <span className="text-[12px] leading-snug text-ink-900">{i.message}</span>
          </>
        );
        return (
          <li key={i.key}>
            {onSelect ? (
              <button onClick={() => onSelect(i)} className="flex w-full items-start gap-2 text-left hover:underline">
                {body}
              </button>
            ) : (
              <div className="flex items-start gap-2">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function useSelectIssue() {
  const setSelection = usePlannerStore((s) => s.setSelection);
  return (issue: LayoutIssue) => {
    const { project } = usePlannerStore.getState();
    for (const id of issue.objectIds) {
      if (project.inventory.some((x) => x.id === id)) return setSelection({ kind: 'inventory', id });
      if (project.pillars.some((x) => x.id === id)) return setSelection({ kind: 'pillar', id });
    }
  };
}
