'use client';

import { usePlannerStore } from '@/store/plannerStore';
import { useDerivedMetrics } from '@/store/selectors';
import { mm, formatArea, formatLength } from '@/model/units';
import { Section } from '../ui/Section';
import { NumberField } from '../ui/NumberField';
import { Button } from '../ui/Button';

export function RoomProperties() {
  const room = usePlannerStore((s) => s.project.room);
  const updateRoomMeta = usePlannerStore((s) => s.updateRoomMeta);
  const startRoom = usePlannerStore((s) => s.startRoom);
  const setWallLength = usePlannerStore((s) => s.setWallLength);
  const setHighlightedWall = usePlannerStore((s) => s.setHighlightedWall);
  const metrics = useDerivedMetrics();
  if (!room) return null;

  const totalWalls = metrics?.wallLengths.reduce((a, b) => a + b, 0) ?? 0;

  return (
    <div className="flex h-full flex-col">
      <Section title="Room">
        <div className="flex flex-col gap-1">
          <p className="font-display text-[18px] italic leading-tight text-ink-900">Shop area</p>
          <p className="text-[11px] text-ink-500">
            {room.corners.length} corners {room.closed ? '· closed' : '· open'}
          </p>
        </div>
      </Section>

      <div className="h-px bg-wall-200" />

      {metrics && metrics.wallLengths.length > 0 && (
        <>
          <Section title="Walls">
            <p className="text-[11px] leading-relaxed text-ink-500">
              Type exact lengths. The room keeps its shape: the opposite parallel wall adjusts.
            </p>
            <div className="grid grid-cols-2 gap-3" onMouseLeave={() => setHighlightedWall(null)}>
              {metrics.wallLengths.map((len, i) => (
                <div
                  key={room.corners[i]!.id}
                  onMouseEnter={() => setHighlightedWall(i)}
                  onFocus={() => setHighlightedWall(i)}
                  onBlur={() => setHighlightedWall(null)}
                >
                  <NumberField
                    label={`Wall ${i + 1}`}
                    unit="mm"
                    value={len}
                    step={10}
                    min={100}
                    onCommit={(v) => setWallLength(i, v)}
                  />
                </div>
              ))}
            </div>
          </Section>

          <div className="h-px bg-wall-200" />
        </>
      )}

      <Section title="Geometry">
        <NumberField
          label="Wall thickness"
          unit="mm"
          value={room.wallThickness}
          step={10}
          min={20}
          onCommit={(v) => updateRoomMeta({ wallThickness: mm(v) })}
        />
        <NumberField
          label="Wall height"
          unit="mm"
          value={room.wallHeight}
          step={50}
          min={1000}
          onCommit={(v) => updateRoomMeta({ wallHeight: mm(v) })}
        />
        <p className="text-[11px] leading-relaxed text-ink-500">
          Used for the 3D view and to check wall-hung items such as logos.
        </p>
      </Section>

      <div className="h-px bg-wall-200" />

      <Section title="Measurements">
        <Stat label="Total wall length" value={formatLength(totalWalls)} />
        <Stat label="Floor area" value={formatArea(metrics?.area ?? 0)} />
      </Section>

      <div className="h-px bg-wall-200" />

      <Section title="Actions">
        <Button variant="subtle" onClick={() => startRoom()}>
          Redraw room
        </Button>
        <p className="text-[11px] leading-relaxed text-ink-500">
          Pillars and inventory will remain in place.
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
