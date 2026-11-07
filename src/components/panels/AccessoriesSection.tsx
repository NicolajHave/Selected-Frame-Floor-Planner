'use client';

import { usePlannerStore } from '@/store/plannerStore';
import { Section } from '../ui/Section';
import {
  SHELF_TOPS,
  TRAY_3X3,
  TRAY_3X5,
  accessoryHosts,
  accessoryOptions,
  freeShelf,
  roomFor,
  type AccessoryHost,
} from '@/lib/accessories';
import { formatLength } from '@/model/units';
import type { InventoryItem } from '@/model/objects';

const WHERE: Record<string, string> = {
  '105-06-011-22-C': 'On top of the thick end',
  '105-15-001': 'On the table top',
  '105-13-023': 'On the upper shelf',
  '105-18-001': 'On the floor in front',
};

/** Signs and trays that belong to this fixture: add, move to another shelf, remove. */
export function AccessoriesSection({ item }: { item: InventoryItem }) {
  const hosts = accessoryHosts(item);
  if (hosts.length === 0) return null;
  return (
    <>
      <Section title="Accessories">
        <div className="flex flex-col gap-4" data-testid="accessories">
          {hosts.map((host) => (
            <HostAccessories key={host.module ?? 'item'} item={item} host={host} labelled={hosts.length > 1 || host.module !== undefined} />
          ))}
        </div>
      </Section>
      <div className="h-px bg-wall-200" />
    </>
  );
}

function HostAccessories({ item, host, labelled }: { item: InventoryItem; host: AccessoryHost; labelled: boolean }) {
  const add = usePlannerStore((s) => s.addAccessory);
  const remove = usePlannerStore((s) => s.removeAccessory);
  const setShelf = usePlannerStore((s) => s.setAccessoryShelf);
  const mine = (item.accessories ?? []).filter((a) => a.module === host.module);

  return (
    <div className="flex flex-col gap-2">
      {labelled && (
        <p className="text-[11px] font-medium text-ink-700">
          Unit {host.module! + 1} · {host.asset.name}
        </p>
      )}
      {accessoryOptions(host.asset.id).map(({ asset }) => {
        const isTray = asset.id === TRAY_3X3 || asset.id === TRAY_3X5;
        const placed = mine.filter((a) => a.assetRef === asset.id);
        const canAdd = roomFor(item, host, asset.id) > 0 && (!isTray || freeShelf(item, host, asset.id) !== null);
        return (
          <div key={asset.id} className="rounded-[2px] border border-wall-200 bg-wall-50">
            <div className="flex items-center gap-2 p-1.5">
              <img
                src={asset.thumbUrl}
                alt=""
                width={48}
                height={26}
                className="h-[26px] w-12 shrink-0 rounded-[2px] bg-wall-100 object-contain"
              />
              <div className="min-w-0 flex-1 leading-tight">
                <p className="truncate text-[12px] text-ink-900">{asset.name}</p>
                <p className="text-[10px] text-ink-500">
                  {placed.length ? `${placed.length} added` : isTray ? 'On the shelves' : WHERE[asset.id]}
                </p>
              </div>
              <button
                className="shrink-0 rounded-[2px] border border-wall-200 bg-wall-100 px-2 py-1 text-[11px] text-ink-900 hover:bg-wall-200 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={!canAdd}
                aria-label={`Add ${asset.name}`}
                title={canAdd ? `Add ${asset.name}` : isTray ? 'No room left on the shelves' : 'Already added'}
                onClick={() => add(item.id, asset.id, host.module)}
              >
                + Add
              </button>
            </div>
            {placed.length > 0 && (
              <ul className="flex flex-col border-t border-wall-200">
                {placed.map((a, i) => (
                  <li key={a.id} className="flex items-center gap-2 px-2 py-1 text-[11px] text-ink-700">
                    <span className="flex-1">
                      {isTray ? (
                        <label className="flex items-center gap-1.5">
                          <span>Tray {i + 1} on</span>
                          <select
                            aria-label={`Shelf for ${asset.name} ${i + 1}`}
                            value={a.shelf ?? 0}
                            onChange={(e) => setShelf(item.id, a.id, Number(e.target.value))}
                            className="border border-wall-200 bg-white/60 px-1 py-0.5 text-[11px] text-ink-900"
                          >
                            {SHELF_TOPS.map((top, shelf) => (
                              <option key={shelf} value={shelf}>
                                Shelf {shelf + 1} · {formatLength(top)}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : (
                        WHERE[asset.id]
                      )}
                    </span>
                    <button
                      className="text-ink-500 hover:text-red-700"
                      aria-label={`Remove ${asset.name}${placed.length > 1 ? ` ${i + 1}` : ''}`}
                      onClick={() => remove(item.id, a.id)}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
