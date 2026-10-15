'use client';

import { useMemo } from 'react';
import type { RoomPolygon } from '@/model/objects';
import { openingSpan, wallFrame } from '@/geometry/openings';
import { MM } from '../ThreeCanvas';

/** One box: `from`/`to` along the wall (mm from its start), `y0`/`y1` above the floor (mm). */
interface Piece {
  key: string;
  cx: number;
  cz: number;
  rotY: number;
  length: number;
  y0: number;
  y1: number;
  glass?: boolean;
}

/**
 * Each wall is built from boxes around its openings: full-height pieces
 * between openings, a lintel above each, a sill below windows and a pane
 * of glass in windows. Wall ends overlap by half a thickness so corners
 * read as solid.
 */
export function Walls({ room }: { room: RoomPolygon }) {
  const thickness = room.wallThickness * MM;

  const pieces = useMemo<Piece[]>(() => {
    const out: Piece[] = [];
    const H = room.wallHeight;
    const half = room.wallThickness / 2;
    const n = room.corners.length;

    for (let i = 0; i < n; i++) {
      const w = wallFrame(room, i);
      if (!w) continue;
      const rotY = -Math.atan2(w.uy, w.ux);
      const push = (key: string, from: number, to: number, y0: number, y1: number, glass = false) => {
        if (to - from < 1 || y1 - y0 < 1) return;
        const mid = (from + to) / 2;
        out.push({
          key: `${w.index}-${key}`,
          cx: (w.a.x + w.ux * mid) * MM,
          cz: (w.a.y + w.uy * mid) * MM,
          rotY,
          length: (to - from) * MM,
          y0: y0 * MM,
          y1: y1 * MM,
          glass,
        });
      };

      const holes = room.openings
        .filter((o) => o.wallStartCornerId === room.corners[i]!.id)
        .map((o) => ({ o, span: openingSpan(room, o)! }))
        .filter((h) => h.span)
        .sort((p, q) => p.span.offset - q.span.offset);

      let cursor = -half;
      holes.forEach(({ o, span }, k) => {
        const from = Math.max(cursor, span.offset - span.width / 2);
        const to = span.offset + span.width / 2;
        const top = Math.min(o.height, H);
        const sill = Math.min(o.sillHeight, top);
        push(`solid${k}`, cursor, from, 0, H);
        push(`lintel${k}`, from, to, top, H);
        push(`sill${k}`, from, to, 0, sill);
        if (o.kind === 'window') push(`glass${k}`, from, to, sill, top, true);
        cursor = Math.max(cursor, to);
      });
      push('end', cursor, w.length + half, 0, H);
    }
    return out;
  }, [room]);

  return (
    <group>
      {pieces.map((p) => (
        <mesh
          key={p.key}
          position={[p.cx, (p.y0 + p.y1) / 2, p.cz]}
          rotation={[0, p.rotY, 0]}
          castShadow={!p.glass}
          receiveShadow
        >
          <boxGeometry args={[p.length, p.y1 - p.y0, p.glass ? thickness * 0.15 : thickness]} />
          {p.glass ? (
            <meshStandardMaterial color="#CFE3EA" transparent opacity={0.35} roughness={0.05} />
          ) : (
            <meshStandardMaterial color="#F1EEE7" roughness={0.9} metalness={0} />
          )}
        </mesh>
      ))}
    </group>
  );
}
