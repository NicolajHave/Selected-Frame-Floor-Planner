'use client';

import { useEffect, useRef } from 'react';
import { create } from 'zustand';
import { clsx } from 'clsx';
import { selectedMembers, usePlannerStore } from '@/store/plannerStore';
import type { Point } from '@/model/geometry';
import type { Mm } from '@/model/units';
import type { PlanHit } from '@/lib/planHit';
import { readClip } from '@/lib/clipboard';
import { wallFrame } from '@/geometry/openings';

const QUARTER_TURN = Math.PI / 2;

interface MenuState {
  open: { x: number; y: number; world: Point; hit: PlanHit } | null;
  show: (x: number, y: number, world: Point, hit: PlanHit) => void;
  close: () => void;
}

/** Where the menu is (screen px within the stage) and what it is about. */
export const useContextMenu = create<MenuState>()((set) => ({
  open: null,
  show: (x, y, world, hit) => set({ open: { x, y, world, hit } }),
  close: () => set({ open: null }),
}));

interface Item {
  label: string;
  keys?: string;
  run: () => void;
  disabled?: string | false;
  danger?: boolean;
}

/**
 * The right-click menu on the 2D plan: what you can do with the thing under
 * the pointer — a fixture (or the selected group), a pillar, a note, a door
 * or window, a wall, or the empty floor.
 */
export function PlanContextMenu() {
  const open = useContextMenu((s) => s.open);
  const close = useContextMenu((s) => s.close);
  const box = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node)) close();
    };
    window.addEventListener('pointerdown', away, true);
    window.addEventListener('keydown', away, true);
    window.addEventListener('wheel', close, true);
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('pointerdown', away, true);
      window.removeEventListener('keydown', away, true);
      window.removeEventListener('wheel', close, true);
      window.removeEventListener('blur', close);
    };
  }, [open, close]);

  // Keep the menu on screen.
  useEffect(() => {
    const el = box.current;
    const stage = el?.parentElement?.getBoundingClientRect();
    if (!el || !stage || !open) return;
    const r = el.getBoundingClientRect();
    if (open.x + r.width > stage.width - 8) el.style.left = `${Math.max(8, open.x - r.width)}px`;
    if (open.y + r.height > stage.height - 8) el.style.top = `${Math.max(8, open.y - r.height)}px`;
  }, [open]);

  if (!open) return null;
  const sections = menuFor(open.hit, open.world);
  if (!sections.length) return null;

  return (
    <div
      ref={box}
      role="menu"
      aria-label="Plan actions"
      data-testid="plan-menu"
      className="absolute z-30 min-w-[210px] rounded-[2px] border border-wall-200 bg-wall-50 py-1 text-[12px] shadow-panel"
      style={{ left: open.x, top: open.y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {sections.map((items, i) => (
        <div key={i} className={clsx(i > 0 && 'mt-1 border-t border-wall-200 pt-1')}>
          {items.map((it) => (
            <button
              key={it.label}
              role="menuitem"
              disabled={!!it.disabled}
              title={it.disabled || undefined}
              onClick={() => {
                close();
                it.run();
              }}
              className={clsx(
                'flex w-full items-center justify-between gap-6 px-3 py-1.5 text-left hover:bg-wall-100 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent',
                it.danger ? 'text-red-700' : 'text-ink-900',
              )}
            >
              <span>{it.label}</span>
              {it.keys && <span className="font-mono text-[10px] text-ink-500">{it.keys}</span>}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

/** The menu's items, in sections. */
function menuFor(hit: PlanHit, world: Point): Item[][] {
  const s = usePlannerStore.getState();
  const readOnly = s.readOnly;
  const layoutLocked: string | false = s.project.layoutLocked ? 'The floor layout is locked' : false;
  const store = () => usePlannerStore.getState();

  if (hit.kind === 'inventory' || hit.kind === 'pillar' || hit.kind === 'note') {
    const many = selectedMembers(s).length > 1;
    const what = many ? `${selectedMembers(s).length} selected` : hit.kind === 'note' ? 'note' : hit.kind === 'pillar' ? 'pillar' : 'fixture';
    if (readOnly) return [[{ label: 'Copy', keys: 'Ctrl+C', run: () => store().copySelected() }]];
    const item = hit.kind === 'inventory' ? s.project.inventory.find((x) => x.id === hit.id) : null;
    const pillarLocked: string | false = hit.kind === 'pillar' && !many ? layoutLocked : false;
    const first: Item[] = [
      { label: 'Duplicate', keys: 'Ctrl+D', run: () => store().duplicateSelected(), disabled: pillarLocked },
      { label: 'Copy', keys: 'Ctrl+C', run: () => store().copySelected() },
    ];
    const second: Item[] = [];
    if (hit.kind !== 'note') {
      second.push(
        { label: 'Rotate 90°', keys: 'R', run: () => store().rotateSelected(QUARTER_TURN), disabled: pillarLocked },
        { label: 'Rotate 90° back', keys: 'Shift+R', run: () => store().rotateSelected(-QUARTER_TURN), disabled: pillarLocked },
      );
    }
    if (hit.kind === 'inventory') {
      second.push({ label: item?.locked && !many ? 'Unlock' : 'Lock in place', keys: 'L', run: () => store().toggleLockSelected() });
    }
    const last: Item[] = [{ label: `Delete ${what}`, keys: 'Del', danger: true, run: () => store().deleteSelected(), disabled: pillarLocked }];
    return [first, second, last].filter((x) => x.length);
  }

  if (readOnly) return [];

  if (hit.kind === 'opening') {
    return [
      [{ label: 'Properties', run: () => store().setSelection({ kind: 'opening', id: hit.id }) }],
      [
        {
          label: 'Delete',
          keys: 'Del',
          danger: true,
          disabled: layoutLocked,
          run: () => {
            store().setSelection({ kind: 'opening', id: hit.id });
            store().deleteSelected();
          },
        },
      ],
    ];
  }

  if (hit.kind === 'wall') {
    const room = s.project.room!;
    const w = wallFrame(room, hit.index);
    const onWall: Point = w
      ? { x: (w.a.x + w.ux * hit.along) as Mm, y: (w.a.y + w.uy * hit.along) as Mm }
      : world;
    const place = (kind: 'door' | 'double-door' | 'window' | 'opening') => () => {
      store().pickOpening(kind);
      store().addOpeningAt(onWall);
    };
    return [
      [
        { label: 'Add door here', run: place('door'), disabled: layoutLocked },
        { label: 'Add double door here', run: place('double-door'), disabled: layoutLocked },
        { label: 'Add window here', run: place('window'), disabled: layoutLocked },
        { label: 'Add opening here', run: place('opening'), disabled: layoutLocked },
      ],
      [
        { label: 'Add corner here', run: () => store().insertCorner(hit.cornerId, onWall), disabled: layoutLocked },
        { label: `Wall ${hit.index + 1} properties`, run: () => store().setSelection({ kind: 'wall', id: hit.cornerId }) },
      ],
    ];
  }

  // Empty floor (or outside the room).
  const clip = readClip();
  const first: Item[] = [];
  if (clip) first.push({ label: 'Paste here', keys: 'Ctrl+V', run: () => store().pasteClip(world) });
  first.push({ label: 'Add note here', run: () => store().addNoteAt(world) });
  if (hit.kind === 'floor') first.push({ label: 'Add pillar here', run: () => store().addPillarAt(world), disabled: layoutLocked });
  return [
    first,
    [
      {
        label: 'Measure from here',
        run: () => {
          store().setTool('measure');
          store().measureClick(world);
        },
      },
      {
        label: 'Select all',
        keys: 'Ctrl+A',
        run: () =>
          store().selectMany([
            ...s.project.inventory.map((x) => ({ kind: 'inventory' as const, id: x.id })),
            ...s.project.pillars.map((x) => ({ kind: 'pillar' as const, id: x.id })),
            ...(s.project.annotations ?? []).map((x) => ({ kind: 'note' as const, id: x.id })),
          ]),
      },
    ],
  ];
}
