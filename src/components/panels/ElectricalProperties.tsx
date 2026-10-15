'use client';

import { usePlannerStore } from '@/store/plannerStore';
import { mm } from '@/model/units';
import type { Mm } from '@/model/units';
import type { ElectricalKind } from '@/model/objects';
import { electricalAnchor } from '@/geometry/electrical';
import { wallFrame } from '@/geometry/openings';
import { wallHeightOf } from '@/geometry/wallStyle';
import { ELECTRICAL_TYPES, electricalType } from '@/lib/electricalTypes';
import { Section } from '../ui/Section';
import { NumberField } from '../ui/NumberField';
import { TextField } from '../ui/TextField';
import { Button } from '../ui/Button';

export function ElectricalProperties({ id }: { id: string }) {
  const point = usePlannerStore((s) => s.project.electrical?.find((e) => e.id === id));
  const room = usePlannerStore((s) => s.project.room);
  const update = usePlannerStore((s) => s.updateElectrical);
  const remove = usePlannerStore((s) => s.deleteSelected);
  const setSelection = usePlannerStore((s) => s.setSelection);
  if (!point) return null;

  const t = electricalType(point.kind);
  const anchor = electricalAnchor(room, point);
  const index = anchor?.index ?? null;
  const w = room && index !== null ? wallFrame(room, index) : null;
  const tooHigh = room && index !== null && point.height > wallHeightOf(room, index);

  return (
    <div className="flex h-full flex-col">
      <Section title="Electrical">
        <div className="flex flex-col gap-1">
          <p className="font-display text-[18px] italic leading-tight text-ink-900">{t.name}</p>
          {index !== null && room ? (
            <button
              className="self-start text-[11px] text-ink-500 underline-offset-2 hover:text-ink-900 hover:underline"
              onClick={() => setSelection({ kind: 'wall', id: room.corners[index]!.id })}
            >
              On wall {index + 1}
            </button>
          ) : (
            <p className="text-[11px] text-ink-500">In the floor</p>
          )}
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-widest2 text-ink-500">Type</span>
          <select
            aria-label="Type"
            value={point.kind}
            onChange={(e) => {
              const kind = e.target.value as ElectricalKind;
              update(id, { kind, height: mm(electricalType(kind).height) });
            }}
            className="border-b border-wall-300 bg-transparent py-1 text-[13px] text-ink-900 outline-none focus:border-ink-900"
          >
            {ELECTRICAL_TYPES.map((x) => (
              <option key={x.kind} value={x.kind}>
                {x.name} — {x.description}
              </option>
            ))}
          </select>
        </label>
      </Section>

      <div className="h-px bg-wall-200" />

      <Section title="Position">
        {t.mount === 'wall' ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <NumberField
                label="Height"
                unit="mm"
                value={point.height}
                step={50}
                min={0}
                onCommit={(v) => update(id, { height: mm(v) })}
              />
              <NumberField
                label="From wall start"
                unit="mm"
                value={Math.round(point.offset ?? 0)}
                step={10}
                min={0}
                onCommit={(v) => update(id, { offset: v as Mm })}
              />
            </div>
            <p className="text-[11px] text-ink-500">
              Height to the centre of the outlet, from the floor.
              {w && ` ${Math.round(w.length - (point.offset ?? 0)).toLocaleString('da-DK')} mm to the wall's end.`} Drag
              it on the plan to move it along the wall.
            </p>
            {tooHigh && (
              <p className="rounded-[2px] border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-950">
                Higher than the wall.
              </p>
            )}
          </>
        ) : (
          <p className="text-[11px] text-ink-500">Drag it on the plan to move it.</p>
        )}
      </Section>

      <div className="h-px bg-wall-200" />

      <Section title="Note for the electrician">
        <TextField label="Note" value={point.note ?? ''} onCommit={(v) => update(id, { note: v.trim() || undefined })} />
      </Section>

      <div className="h-px bg-wall-200" />

      <Section title="Actions">
        <Button variant="subtle" onClick={remove} className="justify-center">
          Delete
        </Button>
      </Section>
    </div>
  );
}
