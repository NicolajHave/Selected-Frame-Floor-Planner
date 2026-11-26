'use client';

import { useMemo } from 'react';
import type { FloorFinish, RoomFinish } from '@/model/objects';
import { FLOOR_TYPES, WALL_COLORS, isColor, resolveFloor, wallColorName, DEFAULT_WALL_COLOR, type FloorKind } from '@/lib/finishes';
import { floorSwatch } from '@/lib/floorPaint';
import { Segmented } from '../ui/Segmented';
import { Swatches } from '../ui/Swatches';

/**
 * The floor (a kind, in one of its colours) and the colour of the walls,
 * to pick. What is done with the choice is up to whoever shows this: the
 * plan's editor writes it into the plan, a visitor on a link only looks.
 */
export function FinishPickers({
  finish,
  onFloor,
  onWall,
  onStart,
  onEnd,
  wallNote,
}: {
  finish: RoomFinish | undefined;
  /** null: the plain neutral floor. */
  onFloor: (floor: FloorFinish | null) => void;
  /** null: the neutral walls. */
  onWall: (color: string | null) => void;
  /** Around a session in the colour picker, so it can be one undo step. */
  onStart?: () => void;
  onEnd?: () => void;
  /** Said after the wall colour's name. */
  wallNote?: string;
}) {
  const floor = resolveFloor(finish?.floor);
  const kind = floor.type.kind;
  const tones = useMemo(
    () => floor.type.tones.map((t) => ({ id: t.id, name: `${floor.type.name}: ${t.name}`, color: t.color, image: floorSwatch(kind, t.color) || undefined })),
    [floor.type, kind],
  );
  const turned = !!finish?.floor?.turned;
  const wall = isColor(finish?.wall) ? finish!.wall! : DEFAULT_WALL_COLOR;
  const listed = WALL_COLORS.find((c) => c.color.toLowerCase() === wall.toLowerCase());

  return (
    <>
      <div className="flex flex-col gap-2" data-testid="floor-finish">
        <Segmented
          label="Floor"
          value={kind}
          options={FLOOR_TYPES.map((t) => ({ value: t.kind, label: t.name }))}
          onChange={(k: FloorKind) => onFloor(k === 'plain' ? null : { kind: k })}
        />
        <Swatches
          label={`${floor.type.name} colour`}
          swatches={tones}
          value={floor.tone?.id ?? null}
          onPick={(id) => onFloor({ kind, tone: id, turned })}
          own={{
            color: floor.color.toLowerCase(),
            active: !floor.tone,
            onPick: (color) => onFloor({ kind, tone: color, turned }),
            onStart,
            onEnd,
          }}
        />
        <p className="text-[11px] text-ink-500">
          {floor.label} — {floor.type.note.toLowerCase()}.
        </p>
        {floor.type.directional && (
          <label className="flex items-center gap-2 text-[12px] text-ink-900">
            <input type="checkbox" checked={turned} onChange={(e) => onFloor({ kind, tone: finish?.floor?.tone, turned: e.target.checked })} />
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
          onPick={(color) => onWall(color === DEFAULT_WALL_COLOR ? null : color)}
          own={{ color: wall.toLowerCase(), active: !listed, onPick: onWall, onStart, onEnd }}
        />
        <p className="text-[11px] leading-relaxed text-ink-500">
          {wallColorName(wall)}.{wallNote ? ` ${wallNote}` : ''}
        </p>
      </div>
    </>
  );
}
