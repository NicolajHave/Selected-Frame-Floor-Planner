'use client';

import type { ViewState } from '@/model/project';
import type { WallDraft } from '@/store/plannerStore';
import { pxStroke } from './viewport';

/** The walls found on the plan: a dashed outline with its corners, until used or dropped. */
export function WallDraftShape({ draft, view }: { draft: WallDraft; view: ViewState }) {
  const pts = draft.points;
  const r = pxStroke(view, 4);
  return (
    <g pointerEvents="none" data-testid="wall-draft">
      {pts && (
        <>
          <polygon
            points={pts.map((p) => `${p.x},${p.y}`).join(' ')}
            fill={draft.leaked ? 'rgba(180, 83, 9, 0.06)' : 'rgba(180, 83, 9, 0.12)'}
            stroke="#B45309"
            strokeWidth={pxStroke(view, 2)}
            strokeDasharray={`${pxStroke(view, 7)} ${pxStroke(view, 4)}`}
            opacity={draft.busy ? 0.4 : 1}
          />
          {!draft.leaked &&
            pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={r} fill="#FFFBEB" stroke="#B45309" strokeWidth={pxStroke(view, 1.5)} />)}
        </>
      )}
      {draft.seeds.map((p, i) => (
        <circle key={`s${i}`} cx={p.x} cy={p.y} r={r * 1.2} fill="#B45309" />
      ))}
    </g>
  );
}
