'use client';

import { useMemo } from 'react';
import { usePlannerStore } from '@/store/plannerStore';
import { FLOOR_TYPES, WALL_COLORS, isColor, roomFloor, roomWallColor, wallColorName, type FloorKind } from '@/lib/finishes';
import { floorSwatch } from '@/lib/floorPaint';
import { Section } from '../ui/Section';
import { Segmented } from '../ui/Segmented';
import { Swatches } from '../ui/Swatches';

/**
 * What the shop is finished in: the floor (a kind, in one of its colours)
 * and the colour of the walls. They show in the 3D view and in the PDF's
 * pictures.
 */
export function FinishesSection() {
  const room = usePlannerStore((s) => s.project.room);
  const setFloorFinish = usePlannerStore((s) => s.setFloorFinish);
  const setWallColor = usePlannerStore((s) => s.setWallColor);
  const beginGesture = usePlannerStore((s) => s.beginGesture);
  const endGesture = usePlannerStore((s) => s.endGesture);

  const floor = roomFloor(room);
  const kind = floor.type.kind;
  const tones = useMemo(
    () => floor.type.tones.map((t) => ({ id: t.id, name: `${floor.type.name}: ${t.name}`, color: t.color, image: floorSwatch(kind, t.color) || undefined })),
    [floor.type, kind],
  );
  if (!room?.closed) return null;

  const turned = !!room.finish?.floor?.turned;
  const wall = roomWallColor(room);
  const listed = WALL_COLORS.find((c) => c.color.toLowerCase() === wall.toLowerCase());
  const ownWall = isColor(room.finish?.wall) && !listed;

  return (
    <Section title="Floor & walls">
      <p className="text-[11px] leading-relaxed text-ink-500">
        What the shop is finished in, as the 3D view and the PDF&apos;s pictures show it.
      </p>

      <div className="flex flex-col gap-2" data-testid="floor-finish">
        <Segmented
          label="Floor"
          value={kind}
          options={FLOOR_TYPES.map((t) => ({ value: t.kind, label: t.name }))}
          onChange={(k: FloorKind) => setFloorFinish(k === 'plain' ? null : { kind: k })}
        />
        <Swatches
          label={`${floor.type.name} colour`}
          swatches={tones}
          value={floor.tone?.id ?? null}
          onPick={(id) => setFloorFinish({ kind, tone: id, turned })}
          own={{
            color: floor.color.toLowerCase(),
            active: !floor.tone,
            onPick: (color) => setFloorFinish({ kind, tone: color, turned }),
            onStart: beginGesture,
            onEnd: endGesture,
          }}
        />
        <p className="text-[11px] text-ink-500">
          {floor.label} — {floor.type.note.toLowerCase()}.
        </p>
        {floor.type.directional && (
          <label className="flex items-center gap-2 text-[12px] text-ink-900">
            <input
              type="checkbox"
              checked={turned}
              onChange={(e) => setFloorFinish({ kind, tone: room.finish?.floor?.tone, turned: e.target.checked })}
            />
            <span>Lay it the other way</span>
          </label>
        )}
      </div>

      <div className="flex flex-col gap-2" data-testid="wall-finish">
        <span className="text-[10px] uppercase tracking-widest2 text-ink-500">Walls</span>
        <Swatches
          label="Wall colour"
          swatches={WALL_COLORS.map((c) => ({ id: c.color, name: c.name, color: c.color }))}
          value={listed?.color ?? null}
          onPick={(color) => setWallColor(color === WALL_COLORS[0]!.color ? null : color)}
          own={{ color: wall.toLowerCase(), active: ownWall, onPick: setWallColor, onStart: beginGesture, onEnd: endGesture }}
        />
        <p className="text-[11px] leading-relaxed text-ink-500">
          {wallColorName(wall)}. A wall can have a colour of its own: click the wall on the plan.
        </p>
      </div>
    </Section>
  );
}
