'use client';

import { usePlannerStore } from '@/store/plannerStore';
import { degToRad, mm, radToDeg } from '@/model/units';
import { Section } from '../ui/Section';
import { NumberField } from '../ui/NumberField';
import { Button } from '../ui/Button';
import { ObjectIssues } from './LayoutCheckSection';

export function PillarProperties({ id }: { id: string }) {
  const pillar = usePlannerStore((s) => s.project.pillars.find((p) => p.id === id));
  const updatePillar = usePlannerStore((s) => s.updatePillar);
  const duplicate = usePlannerStore((s) => s.duplicateSelected);
  const remove = usePlannerStore((s) => s.deleteSelected);

  if (!pillar) return null;

  return (
    <div className="flex h-full flex-col">
      <Section title="Pillar">
        <div className="flex flex-col gap-1">
          <p className="font-display text-[18px] italic leading-tight text-ink-900">Structural pillar</p>
          <p className="text-[11px] text-ink-500 font-mono">{pillar.id}</p>
        </div>
        <ObjectIssues id={id} />
      </Section>

      <div className="h-px bg-wall-200" />

      <Section title="Dimensions">
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            label="Width"
            unit="mm"
            value={pillar.size.width}
            step={10}
            min={20}
            onCommit={(v) => updatePillar(id, { size: { ...pillar.size, width: mm(v) } })}
          />
          <NumberField
            label="Depth"
            unit="mm"
            value={pillar.size.depth}
            step={10}
            min={20}
            onCommit={(v) => updatePillar(id, { size: { ...pillar.size, depth: mm(v) } })}
          />
        </div>
        <NumberField
          label="Height"
          unit="mm"
          value={pillar.size.height}
          step={50}
          min={100}
          onCommit={(v) => updatePillar(id, { size: { ...pillar.size, height: mm(v) } })}
        />
      </Section>

      <div className="h-px bg-wall-200" />

      <Section title="Position & rotation">
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            label="X"
            unit="mm"
            value={pillar.position.x}
            step={10}
            onCommit={(v) => updatePillar(id, { position: { ...pillar.position, x: mm(v) } })}
          />
          <NumberField
            label="Y"
            unit="mm"
            value={pillar.position.y}
            step={10}
            onCommit={(v) => updatePillar(id, { position: { ...pillar.position, y: mm(v) } })}
          />
        </div>
        <NumberField
          label="Rotation"
          unit="°"
          value={radToDeg(pillar.rotation)}
          step={5}
          onCommit={(v) => updatePillar(id, { rotation: degToRad(v) })}
        />
      </Section>

      <div className="h-px bg-wall-200" />

      <Section title="Actions">
        <div className="flex gap-2">
          <Button variant="subtle" onClick={duplicate} className="flex-1 justify-center">
            Duplicate
          </Button>
          <Button variant="subtle" onClick={remove} className="flex-1 justify-center">
            Delete
          </Button>
        </div>
      </Section>
    </div>
  );
}
