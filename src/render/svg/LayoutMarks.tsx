'use client';

import { useMemo } from 'react';
import type { Project, ViewState } from '@/model/project';
import type { Point } from '@/model/geometry';
import { doorZones, floorObstacles, type Guide, type LayoutIssue } from '@/lib/layout';
import { pxStroke } from './viewport';

export const ERROR_COLOR = '#B91C1C';
export const WARNING_COLOR = '#B45309';

const toPoints = (poly: Point[]) => poly.map((p) => `${p.x},${p.y}`).join(' ');

interface IssueProps {
  project: Project;
  issues: LayoutIssue[];
  view: ViewState;
}

/** Red outlines on colliding objects, red door zones, amber marks on narrow aisles. */
export function IssueMarks({ project, issues, view }: IssueProps) {
  const outlines = useMemo(
    () => new Map(floorObstacles(project).map((o) => [o.id, o.outline])),
    [project],
  );
  const zones = useMemo(
    () => new Map((project.room ? doorZones(project.room) : []).map((z) => [z.id, z.zone])),
    [project.room],
  );
  if (issues.length === 0) return null;

  const errorIds = new Set(issues.filter((i) => i.kind !== 'aisle').flatMap((i) => i.objectIds));
  const blockedDoors = new Set(issues.filter((i) => i.kind === 'door').map((i) => i.objectIds[1]!));

  return (
    <g data-layer="issues" pointerEvents="none">
      {[...blockedDoors].map((id) => {
        const zone = zones.get(id);
        return zone ? (
          <polygon
            key={`zone-${id}`}
            points={toPoints(zone)}
            fill={ERROR_COLOR}
            fillOpacity={0.08}
            stroke={ERROR_COLOR}
            strokeWidth={pxStroke(view, 1)}
            strokeDasharray={`${pxStroke(view, 4)} ${pxStroke(view, 3)}`}
          />
        ) : null;
      })}

      {[...errorIds].map((id) => {
        const outline = outlines.get(id);
        return outline ? (
          <polygon
            key={`err-${id}`}
            data-issue-object={id}
            points={toPoints(outline)}
            fill={ERROR_COLOR}
            fillOpacity={0.12}
            stroke={ERROR_COLOR}
            strokeWidth={pxStroke(view, 2)}
          />
        ) : null;
      })}

      {issues
        .filter((i) => i.kind === 'aisle' && i.gap)
        .map((i) => (
          <Dimension
            key={i.key}
            from={i.gap!.from}
            to={i.gap!.to}
            label={`${Math.round(i.gap!.distance)}`}
            color={WARNING_COLOR}
            view={view}
            dashed
          />
        ))}
    </g>
  );
}

/** Distances from the selected object to its surroundings. */
export function GuideMarks({ guides, view }: { guides: Guide[]; view: ViewState }) {
  return (
    <g data-layer="guides" pointerEvents="none">
      {guides.map((g, i) => (
        <Dimension
          key={i}
          from={g.from}
          to={g.to}
          label={`${Math.round(g.distance)}`}
          color="#2563EB"
          view={view}
        />
      ))}
    </g>
  );
}

interface DimensionProps {
  from: Point;
  to: Point;
  label: string;
  color: string;
  view: ViewState;
  dashed?: boolean;
}

/** A measured line with end ticks and its length in mm. */
function Dimension({ from, to, label, color, view, dashed }: DimensionProps) {
  const len = Math.hypot(to.x - from.x, to.y - from.y) || 1;
  const ux = (to.x - from.x) / len;
  const uy = (to.y - from.y) / len;
  const tick = pxStroke(view, 5);
  const font = pxStroke(view, 10);
  const stroke = pxStroke(view, 1);
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;
  // Label beside the line, never on it.
  const lx = mx - uy * font * 0.9;
  const ly = my + ux * font * 0.9;
  return (
    <g data-dimension={label}>
      <line
        x1={from.x}
        y1={from.y}
        x2={to.x}
        y2={to.y}
        stroke={color}
        strokeWidth={stroke}
        strokeDasharray={dashed ? `${pxStroke(view, 4)} ${pxStroke(view, 2)}` : undefined}
      />
      {[from, to].map((p, i) => (
        <line
          key={i}
          x1={p.x - uy * tick}
          y1={p.y + ux * tick}
          x2={p.x + uy * tick}
          y2={p.y - ux * tick}
          stroke={color}
          strokeWidth={stroke}
        />
      ))}
      <text
        x={lx}
        y={ly}
        dy="0.35em"
        textAnchor="middle"
        fontSize={font}
        fontFamily="var(--font-sans)"
        fill={color}
        stroke="#F7F6F1"
        strokeWidth={pxStroke(view, 3)}
        paintOrder="stroke"
      >
        {label}
      </text>
    </g>
  );
}
