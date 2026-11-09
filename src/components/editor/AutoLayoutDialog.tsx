'use client';

import { useState } from 'react';
import { clsx } from 'clsx';
import { usePlannerStore } from '@/store/plannerStore';
import { DEFAULT_MIN_AISLE } from '@/lib/layout';
import type { ShopStyle } from '@/lib/autoLayout';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';

const STYLES: { id: ShopStyle; name: string; text: string }[] = [
  {
    id: 'brand',
    name: 'Brand shop',
    text: 'Room to breathe: a welcome table with mannequins facing the entrance, fewer fixtures with wider aisles, signs on the racks and the logo opposite the entrance.',
  },
  {
    id: 'volume',
    name: 'Volume shop',
    text: 'As much product as fits: wall racks along every free wall and rows of floor racks, each the minimum aisle apart.',
  },
];

/** Makes an automatic layout as a new layout tab, to start from and adjust. */
export function AutoLayoutDialog({ onClose }: { onClose: () => void }) {
  const minAisle = usePlannerStore((s) => s.project.minAisle ?? DEFAULT_MIN_AISLE);
  const hasRoom = usePlannerStore((s) => !!s.project.room?.closed);
  const [style, setStyle] = useState<ShopStyle>('brand');
  const [aisle, setAisle] = useState(String(minAisle));
  const [wallRacks, setWallRacks] = useState(true);
  const value = Number(aisle.replace(',', '.'));
  const valid = Number.isFinite(value) && value >= 600 && value <= 3000;

  return (
    <Dialog title="Automatic layout" onClose={onClose} width={560}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid || !hasRoom) return;
          usePlannerStore.getState().proposeLayout({ style, aisle: value, wallRacks });
          onClose();
        }}
      >
        <p className="text-[12px] leading-relaxed text-ink-700">
          Places fixtures in the room for you, as a new layout tab — your own layout stays as it is. Doorways stay clear and
          every fixture keeps at least the minimum aisle to the next one and to the walls. Then adjust it like any other.
        </p>

        <fieldset className="grid grid-cols-2 gap-2">
          <legend className="sr-only">Kind of shop</legend>
          {STYLES.map((s) => (
            <label
              key={s.id}
              className={clsx(
                'flex cursor-pointer flex-col gap-1 rounded-[2px] border p-3 transition-colors',
                style === s.id ? 'border-ink-900 bg-white' : 'border-wall-200 hover:border-ink-500',
              )}
            >
              <span className="flex items-center gap-2">
                <input type="radio" name="style" checked={style === s.id} onChange={() => setStyle(s.id)} />
                <span className="text-[13px] font-medium text-ink-900">{s.name}</span>
              </span>
              <span className="text-[11px] leading-relaxed text-ink-500">{s.text}</span>
            </label>
          ))}
        </fieldset>

        <div className="flex flex-wrap items-end gap-6">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-ink-500">Minimum aisle</span>
            <span className="flex items-baseline gap-1">
              <input
                inputMode="numeric"
                value={aisle}
                onChange={(e) => setAisle(e.target.value)}
                aria-label="Minimum aisle (mm)"
                className="w-20 border-b border-ink-900 bg-transparent text-right font-mono text-[13px] text-ink-900 outline-none"
              />
              <span className="text-[11px] text-ink-500">mm</span>
            </span>
          </label>
          <label className="flex items-center gap-2 text-[12px] text-ink-700">
            <input type="checkbox" checked={wallRacks} onChange={(e) => setWallRacks(e.target.checked)} />
            Wall racks along the free walls
          </label>
        </div>
        {!valid && <p className="text-[11px] text-red-700">Give an aisle between 600 and 3000 mm.</p>}
        {!hasRoom && <p className="text-[11px] text-red-700">Draw and close the room first.</p>}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={!valid || !hasRoom}>
            Make proposal
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
