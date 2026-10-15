'use client';

import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { RoomPolygon } from '@/model/objects';
import { openingSpan, wallFrame } from '@/geometry/openings';
import { wallHeightOf, wallStyle } from '@/geometry/wallStyle';
import { MM } from '../units';

/** One box: `from`/`to` along the wall (mm from its start), `y0`/`y1` above the floor (mm). */
interface Piece {
  wall: number;
  key: string;
  cx: number;
  cz: number;
  rotY: number;
  length: number;
  y0: number;
  y1: number;
  /** A window pane. */
  glass?: boolean;
  /** Part of a see-through wall. */
  clear?: boolean;
}

/** Where a wall is and which way is outside, in scene metres, for the cutaway. */
interface WallSide {
  mx: number;
  mz: number;
  nx: number;
  nz: number;
}

/**
 * Each wall is built from boxes around its openings: full-height pieces
 * between openings, a lintel above each, a sill below windows and a pane
 * of glass in windows. Wall ends overlap by half a thickness so corners
 * read as solid.
 *
 * Cutaway: a wall whose outside faces the camera is hidden, so the shop
 * can be seen into from any angle (like a doll's house). From inside the
 * room every wall shows.
 */
export function Walls({ room }: { room: RoomPolygon }) {
  const groups = useRef<(THREE.Group | null)[]>([]);
  const thickness = room.wallThickness * MM;

  const pieces = useMemo<Piece[]>(() => {
    const out: Piece[] = [];
    const half = room.wallThickness / 2;
    const n = room.corners.length;

    for (let i = 0; i < n; i++) {
      const w = wallFrame(room, i);
      if (!w) continue;
      const H = wallHeightOf(room, i);
      const clear = !!wallStyle(room, i).transparent;
      const rotY = -Math.atan2(w.uy, w.ux);
      const push = (key: string, from: number, to: number, y0: number, y1: number, glass = false) => {
        if (to - from < 1 || y1 - y0 < 1) return;
        const mid = (from + to) / 2;
        out.push({
          wall: w.index,
          key: `${w.index}-${key}`,
          cx: (w.a.x + w.ux * mid) * MM,
          cz: (w.a.y + w.uy * mid) * MM,
          rotY,
          length: (to - from) * MM,
          y0: y0 * MM,
          y1: y1 * MM,
          glass,
          clear: clear && !glass,
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

  const sides = useMemo(
    () =>
      room.corners.map((_, i) => {
        const w = wallFrame(room, i);
        return w
          ? { mx: ((w.a.x + w.b.x) / 2) * MM, mz: ((w.a.y + w.b.y) / 2) * MM, nx: -w.nx, nz: -w.ny }
          : null;
      }),
    [room],
  );

  useFrame(({ camera }) => {
    sides.forEach((side: WallSide | null, i) => {
      const g = groups.current[i];
      if (!g || !side) return;
      const outside = (camera.position.x - side.mx) * side.nx + (camera.position.z - side.mz) * side.nz;
      g.visible = outside <= 0;
    });
  });

  const byWall = new Map<number, Piece[]>();
  for (const p of pieces) byWall.set(p.wall, [...(byWall.get(p.wall) ?? []), p]);

  return (
    <group>
      {[...byWall].map(([wall, list]) => (
        <group key={wall} ref={(g) => { groups.current[wall] = g; }}>
          {list.map((p) => (
            <mesh
              key={p.key}
              position={[p.cx, (p.y0 + p.y1) / 2, p.cz]}
              rotation={[0, p.rotY, 0]}
              castShadow={!p.glass && !p.clear}
              receiveShadow={!p.clear}
            >
              <boxGeometry args={[p.length, p.y1 - p.y0, p.glass || p.clear ? thickness * 0.15 : thickness]} />
              {p.glass ? (
                <meshStandardMaterial color="#CFE3EA" transparent opacity={0.35} roughness={0.05} />
              ) : p.clear ? (
                <meshStandardMaterial
                  color="#D7E6EC"
                  transparent
                  opacity={0.16}
                  roughness={0.05}
                  metalness={0}
                  depthWrite={false}
                />
              ) : (
                <meshStandardMaterial color="#F1EEE7" roughness={0.9} metalness={0} />
              )}
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}
