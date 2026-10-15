'use client';

import { useShallow } from 'zustand/react/shallow';
import { selectedMembers, usePlannerStore } from '@/store/plannerStore';
import type { AlignMode } from '@/lib/group';
import { Section } from '../ui/Section';
import { Button } from '../ui/Button';

const ALIGN: { mode: AlignMode; label: string; name: string }[] = [
  { mode: 'left', label: 'Left', name: 'Align left edges' },
  { mode: 'center-x', label: 'Centre', name: 'Align centres across' },
  { mode: 'right', label: 'Right', name: 'Align right edges' },
  { mode: 'top', label: 'Top', name: 'Align top edges' },
  { mode: 'center-y', label: 'Middle', name: 'Align middles down' },
  { mode: 'bottom', label: 'Bottom', name: 'Align bottom edges' },
];

/** Several objects selected: move, line up, space out, turn, copy or remove them together. */
export function GroupProperties() {
  const members = usePlannerStore(useShallow((s) => selectedMembers(s)));
  const align = usePlannerStore((s) => s.alignSelected);
  const distribute = usePlannerStore((s) => s.distributeSelected);
  const rotate = usePlannerStore((s) => s.rotateSelected);
  const duplicate = usePlannerStore((s) => s.duplicateSelected);
  const remove = usePlannerStore((s) => s.deleteSelected);
  const count = (kind: string) => members.filter((m) => m.kind === kind).length;
  const parts = [
    [count('inventory'), 'fixture'],
    [count('pillar'), 'pillar'],
    [count('note'), 'note'],
  ]
    .filter(([n]) => (n as number) > 0)
    .map(([n, w]) => `${n} ${w}${n === 1 ? '' : 's'}`);

  return (
    <div className="flex h-full flex-col">
      <Section title="Selection">
        <p className="font-display text-[18px] italic leading-tight text-ink-900" data-testid="group-count">
          {members.length} selected
        </p>
        <p className="text-[11px] text-ink-500">{parts.join(' · ')}</p>
        <p className="text-[11px] leading-relaxed text-ink-500">
          Drag any of them to move them all. Shift-click adds or removes one; shift-drag on empty floor
          selects everything in a box.
        </p>
      </Section>

      <div className="h-px bg-wall-200" />

      <Section title="Align">
        <div className="grid grid-cols-3 gap-1">
          {ALIGN.map((a) => (
            <Button
              key={a.mode}
              variant="subtle"
              className="justify-center"
              aria-label={a.name}
              title={a.name}
              onClick={() => align(a.mode)}
            >
              {a.label}
            </Button>
          ))}
        </div>
      </Section>

      <div className="h-px bg-wall-200" />

      <Section title="Distribute">
        <div className="grid grid-cols-2 gap-1">
          <Button variant="subtle" className="justify-center" disabled={members.length < 3} onClick={() => distribute('x')}>
            Equal gaps across
          </Button>
          <Button variant="subtle" className="justify-center" disabled={members.length < 3} onClick={() => distribute('y')}>
            Equal gaps down
          </Button>
        </div>
        {members.length < 3 && <p className="text-[11px] text-ink-500">Select three or more to space them out.</p>}
      </Section>

      <div className="h-px bg-wall-200" />

      <Section title="Actions">
        <div className="grid grid-cols-2 gap-2">
          <Button variant="subtle" className="justify-center" onClick={() => rotate(Math.PI / 2)}>
            Rotate 90°
          </Button>
          <Button variant="subtle" className="justify-center" onClick={duplicate}>
            Duplicate
          </Button>
        </div>
        <Button variant="subtle" className="justify-center" onClick={remove}>
          Delete {members.length}
        </Button>
      </Section>
    </div>
  );
}
