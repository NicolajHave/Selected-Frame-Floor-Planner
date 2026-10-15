'use client';

import { usePlannerStore } from '@/store/plannerStore';
import type { Mm } from '@/model/units';
import { openingSpan, wallFrame } from '@/geometry/openings';
import { wallHeightOf, wallStyle } from '@/geometry/wallStyle';
import { OPENING_TYPES, openingType } from '@/lib/openingTypes';
import { Section } from '../ui/Section';
import { NumberField } from '../ui/NumberField';
import { Button } from '../ui/Button';
import { Segmented } from '../ui/Segmented';

const m = (v: number) => (v / 1000).toLocaleString('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** One wall: its length, height, whether it is see-through, and its doors and windows. */
export function WallProperties({ cornerId }: { cornerId: string }) {
  const room = usePlannerStore((s) => s.project.room);
  const setWallLength = usePlannerStore((s) => s.setWallLength);
  const updateWall = usePlannerStore((s) => s.updateWall);
  const addOpeningOnWall = usePlannerStore((s) => s.addOpeningOnWall);
  const insertCorner = usePlannerStore((s) => s.insertCorner);
  const setSelection = usePlannerStore((s) => s.setSelection);
  const index = room?.corners.findIndex((c) => c.id === cornerId) ?? -1;
  const w = room ? wallFrame(room, index) : null;
  if (!room || !w) return null;

  const style = wallStyle(room, index);
  const height = wallHeightOf(room, index);
  const openings = room.openings
    .filter((o) => o.wallStartCornerId === cornerId)
    .map((o) => ({ o, span: openingSpan(room, o) }))
    .sort((a, b) => (a.span?.offset ?? 0) - (b.span?.offset ?? 0));

  return (
    <div className="flex h-full flex-col">
      <Section title="Wall">
        <div className="flex flex-col gap-1">
          <p className="font-display text-[18px] italic leading-tight text-ink-900">Wall {index + 1}</p>
          <p className="text-[11px] text-ink-500">
            {style.transparent ? 'Transparent' : 'Solid'} · {m(w.length)} × {m(height)} m
          </p>
        </div>
      </Section>

      <div className="h-px bg-wall-200" />

      <Section title="Size">
        <NumberField
          label="Length"
          unit="mm"
          value={Math.round(w.length)}
          step={10}
          min={100}
          onCommit={(v) => setWallLength(index, v)}
        />
        <NumberField
          label="Height"
          unit="mm"
          value={height}
          step={50}
          min={300}
          onCommit={(v) => updateWall(index, { height: v })}
        />
        <p className="text-[11px] leading-relaxed text-ink-500">
          {style.height !== undefined ? (
            <>
              This wall has its own height.{' '}
              <button className="underline underline-offset-2 hover:text-ink-900" onClick={() => updateWall(index, { height: null })}>
                Use the room&apos;s {room.wallHeight.toLocaleString('da-DK')} mm
              </button>
            </>
          ) : (
            'Same as the room’s walls until you change it here.'
          )}
        </p>
      </Section>

      <div className="h-px bg-wall-200" />

      <Section title="Look">
        <Segmented
          label="Wall"
          value={style.transparent ? 'transparent' : 'solid'}
          options={[
            { value: 'solid', label: 'Solid' },
            { value: 'transparent', label: 'Transparent' },
          ]}
          onChange={(v) => updateWall(index, { transparent: v === 'transparent' })}
        />
        <p className="text-[11px] leading-relaxed text-ink-500">
          Transparent: glass or an open side. It is see-through in 3D and dashed on the plan, so the shop
          can be seen from that side.
        </p>
      </Section>

      <div className="h-px bg-wall-200" />

      <Section title="Doors & windows">
        {openings.length === 0 ? (
          <p className="text-[11px] text-ink-500">None on this wall.</p>
        ) : (
          <ul className="flex flex-col gap-1" data-testid="wall-openings">
            {openings.map(({ o, span }) => (
              <li key={o.id}>
                <button
                  className="flex w-full items-baseline justify-between rounded-[2px] px-1 py-0.5 text-left text-[12px] text-ink-900 hover:bg-wall-100"
                  onClick={() => setSelection({ kind: 'opening', id: o.id })}
                >
                  <span>{openingType(o.kind).name}</span>
                  <span className="font-mono text-[11px] text-ink-500">
                    {o.width.toLocaleString('da-DK')} mm
                    {span && ` · ${Math.round(span.offset - span.width / 2).toLocaleString('da-DK')} from start`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="grid grid-cols-2 gap-1">
          {OPENING_TYPES.map((t) => (
            <Button key={t.kind} variant="subtle" className="justify-center" onClick={() => addOpeningOnWall(index, t.kind)}>
              + {t.name}
            </Button>
          ))}
        </div>
        <p className="text-[11px] text-ink-500">Added in the middle of the wall, or the nearest free spot.</p>
      </Section>

      <div className="h-px bg-wall-200" />

      <Section title="Corners">
        <Button
          variant="subtle"
          className="justify-center"
          onClick={() =>
            insertCorner(cornerId, {
              x: ((w.a.x + w.b.x) / 2) as Mm,
              y: ((w.a.y + w.b.y) / 2) as Mm,
            })
          }
        >
          Add a corner in the middle
        </Button>
        <p className="text-[11px] text-ink-500">Or double-click the wall where the corner should go.</p>
      </Section>
    </div>
  );
}
