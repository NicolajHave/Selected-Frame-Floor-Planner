'use client';

import { usePlannerStore } from '@/store/plannerStore';
import { finishInWords, roomFloor, roomWallColor, wallColorName } from '@/lib/finishes';
import { Section } from '../ui/Section';
import { FinishPickers } from './FinishPickers';
import { LinkFinishSuggestion } from '../cloud/LinkFinish';

/**
 * What the shop is finished in: the floor (a kind, in one of its colours)
 * and the colour of the walls. They show in the 3D view and in the PDF's
 * pictures.
 *
 * Someone who can only look sees what they are in words. On a view-only
 * link the visitor chooses for their own view with the button above the
 * plan (components/cloud/LinkFinish), since nothing in this panel is theirs
 * to change.
 */
export function FinishesSection() {
  const room = usePlannerStore((s) => s.project.room);
  const readOnly = usePlannerStore((s) => s.readOnly);
  const onLink = usePlannerStore((s) => !!s.shared);
  const setFloorFinish = usePlannerStore((s) => s.setFloorFinish);
  const setWallColor = usePlannerStore((s) => s.setWallColor);
  const beginGesture = usePlannerStore((s) => s.beginGesture);
  const endGesture = usePlannerStore((s) => s.endGesture);
  if (!room?.closed) return null;

  if (readOnly) {
    return (
      <Section title="Floor & walls">
        <p className="text-[12px] text-ink-900" data-testid="finish-summary">
          {roomFloor(room).label} · walls {wallColorName(roomWallColor(room))}
        </p>
        {onLink && (
          <p className="text-[11px] leading-relaxed text-ink-500">
            Not your shop&apos;s floor or wall colour? Choose them with “Floor &amp; walls” above the plan.
          </p>
        )}
      </Section>
    );
  }

  return (
    <Section title="Floor & walls">
      <p className="text-[11px] leading-relaxed text-ink-500">
        What the shop is finished in, as the 3D view and the PDF&apos;s pictures show it.
      </p>
      <LinkFinishSuggestion planSays={finishInWords(room.finish)} />
      <FinishPickers
        finish={room.finish}
        onFloor={setFloorFinish}
        onWall={setWallColor}
        onStart={beginGesture}
        onEnd={endGesture}
        wallNote="A wall can have a colour of its own: click the wall on the plan."
      />
    </Section>
  );
}
