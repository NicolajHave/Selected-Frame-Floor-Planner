'use client';

import { usePlannerStore } from '@/store/plannerStore';
import { degToRad, mm, radToDeg } from '@/model/units';
import { Section } from '../ui/Section';
import { NumberField } from '../ui/NumberField';
import { TextField } from '../ui/TextField';
import { Button } from '../ui/Button';

export function InventoryProperties({ id }: { id: string }) {
  const item = usePlannerStore((s) => s.project.inventory.find((i) => i.id === id));
  const updateInventory = usePlannerStore((s) => s.updateInventory);
  const duplicate = usePlannerStore((s) => s.duplicateSelected);
  const remove = usePlannerStore((s) => s.deleteSelected);

  if (!item) return null;

  return (
    <div className="flex h-full flex-col">
      <Section title="Inventory">
        <TextField
          label="Name"
          value={item.name}
          onCommit={(v) => updateInventory(id, { name: v })}
        />
        <TextField
          label="Category"
          value={item.category ?? ''}
          onCommit={(v) => updateInventory(id, { category: v || undefined })}
        />
        <p className="text-[11px] text-ink-500 font-mono">{item.id}</p>
      </Section>

      <div className="h-px bg-wall-200" />

      <Section title="Dimensions">
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            label="Width"
            unit="mm"
            value={item.size.width}
            step={10}
            min={20}
            onCommit={(v) => updateInventory(id, { size: { ...item.size, width: mm(v) } })}
          />
          <NumberField
            label="Depth"
            unit="mm"
            value={item.size.depth}
            step={10}
            min={20}
            onCommit={(v) => updateInventory(id, { size: { ...item.size, depth: mm(v) } })}
          />
        </div>
        <NumberField
          label="Height"
          unit="mm"
          value={item.size.height}
          step={10}
          min={20}
          onCommit={(v) => updateInventory(id, { size: { ...item.size, height: mm(v) } })}
        />
      </Section>

      <div className="h-px bg-wall-200" />

      <Section title="Position & rotation">
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            label="X"
            unit="mm"
            value={item.position.x}
            step={10}
            onCommit={(v) => updateInventory(id, { position: { ...item.position, x: mm(v) } })}
          />
          <NumberField
            label="Y"
            unit="mm"
            value={item.position.y}
            step={10}
            onCommit={(v) => updateInventory(id, { position: { ...item.position, y: mm(v) } })}
          />
        </div>
        <NumberField
          label="Rotation"
          unit="°"
          value={radToDeg(item.rotation)}
          step={5}
          onCommit={(v) => updateInventory(id, { rotation: degToRad(v) })}
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
