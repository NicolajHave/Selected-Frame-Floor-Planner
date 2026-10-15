'use client';

import { usePlannerStore } from '@/store/plannerStore';
import { mm } from '@/model/units';
import type { Mm } from '@/model/units';
import type { OpeningKind } from '@/model/objects';
import { MIN_OPENING_WIDTH, openingSpan } from '@/geometry/openings';
import { wallHeightOf } from '@/geometry/wallStyle';
import { OPENING_TYPES, openingType } from '@/lib/openingTypes';
import { Section } from '../ui/Section';
import { NumberField } from '../ui/NumberField';
import { Button } from '../ui/Button';
import { Segmented } from '../ui/Segmented';

export function OpeningProperties({ id }: { id: string }) {
  const room = usePlannerStore((s) => s.project.room);
  const updateOpening = usePlannerStore((s) => s.updateOpening);
  const remove = usePlannerStore((s) => s.deleteSelected);
  const opening = room?.openings.find((o) => o.id === id);
  if (!room || !opening) return null;

  const span = openingSpan(room, opening);
  const isDoor = opening.kind === 'door' || opening.kind === 'double-door';
  const fromStart = span ? Math.round(span.offset - span.width / 2) : 0;
  const toEnd = span ? Math.round(span.length - span.offset - span.width / 2) : 0;
  const setSelection = usePlannerStore((s) => s.setSelection);
  const isWindow = opening.kind === 'window';
  const wallH = span ? wallHeightOf(room, span.index) : room.wallHeight;
  const tooTall = opening.height > wallH;
  // Windows are described by their own height and the sill; the model
  // stores the head (top) height, measured from the floor.
  const windowHeight = opening.height - opening.sillHeight;

  return (
    <div className="flex h-full flex-col">
      <Section title="Opening">
        <div className="flex flex-col gap-1">
          <p className="font-display text-[18px] italic leading-tight text-ink-900">
            {openingType(opening.kind).name}
          </p>
          {span && (
            <button
              className="self-start text-[11px] text-ink-500 underline-offset-2 hover:text-ink-900 hover:underline"
              onClick={() => setSelection({ kind: 'wall', id: room.corners[span.index]!.id })}
            >
              On wall {span.index + 1}
            </button>
          )}
        </div>
        <Segmented
          label="Type"
          value={opening.kind}
          options={OPENING_TYPES.map((t) => ({ value: t.kind, label: t.name }))}
          onChange={(kind: OpeningKind) => {
            const t = openingType(kind);
            // Switching to/from a window changes what a sensible sill is.
            updateOpening(id, { kind, sillHeight: mm(t.sillHeight) });
          }}
        />
      </Section>

      <div className="h-px bg-wall-200" />

      <Section title="Size">
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            label="Width"
            unit="mm"
            value={opening.width}
            step={50}
            min={MIN_OPENING_WIDTH}
            onCommit={(v) => updateOpening(id, { width: mm(v) })}
          />
          {isWindow ? (
            <NumberField
              label="Window height"
              unit="mm"
              value={windowHeight}
              step={50}
              min={200}
              onCommit={(v) => updateOpening(id, { height: mm(opening.sillHeight + v) })}
            />
          ) : (
            <NumberField
              label="Height"
              unit="mm"
              value={opening.height}
              step={50}
              min={300}
              onCommit={(v) => updateOpening(id, { height: mm(v) })}
            />
          )}
        </div>
        {isWindow && (
          <>
            <NumberField
              label="Sill height"
              unit="mm"
              value={opening.sillHeight}
              step={50}
              min={0}
              // Moving the sill moves the whole window; its height stays.
              onCommit={(v) => updateOpening(id, { sillHeight: mm(v), height: mm(v + windowHeight) })}
            />
            <p className="text-[11px] text-ink-500">
              Top of the window at {opening.height.toLocaleString('da-DK')} mm. Drag the square ends on the plan to
              change the width.
            </p>
          </>
        )}
        {!isWindow && (
          <p className="text-[11px] text-ink-500">Drag the square ends on the plan to change the width.</p>
        )}
        {tooTall && (
          <p className="rounded-[2px] border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-950">
            Taller than the wall ({(wallH / 1000).toLocaleString('da-DK', { maximumFractionDigits: 2 })} m).
          </p>
        )}
      </Section>

      <div className="h-px bg-wall-200" />

      <Section title="Position on wall">
        <NumberField
          label="From wall start"
          unit="mm"
          value={fromStart}
          step={10}
          min={0}
          onCommit={(v) => updateOpening(id, { offset: (v + opening.width / 2) as Mm })}
        />
        <p className="text-[11px] text-ink-500">
          {toEnd.toLocaleString('da-DK')} mm to the wall&apos;s end. Drag it on the plan to move it
          along — or onto another wall.
        </p>
      </Section>

      {isDoor && (
        <>
          <div className="h-px bg-wall-200" />
          <Section title="Door swing">
            <Segmented
              label="Hinge"
              value={opening.hinge}
              options={[
                { value: 'start', label: 'Start side' },
                { value: 'end', label: 'End side' },
              ]}
              onChange={(hinge) => updateOpening(id, { hinge })}
            />
            <Segmented
              label="Opens"
              value={opening.swing}
              options={[
                { value: 'in', label: 'Into room' },
                { value: 'out', label: 'Outwards' },
              ]}
              onChange={(swing) => updateOpening(id, { swing })}
            />
            <p className="text-[11px] text-ink-500">R flips the hinge, Shift+R the swing.</p>
          </Section>
        </>
      )}

      <div className="h-px bg-wall-200" />

      <Section title="Actions">
        <Button variant="subtle" onClick={remove} className="justify-center">
          Delete
        </Button>
      </Section>
    </div>
  );
}
