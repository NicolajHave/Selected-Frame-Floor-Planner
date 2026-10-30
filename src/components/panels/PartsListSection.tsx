'use client';

import { useMemo } from 'react';
import { usePlannerStore } from '@/store/plannerStore';
import { buildPartsList, partsListToCsv } from '@/lib/partsList';
import { downloadText } from '@/lib/io';
import { PRICE_LIST, eur } from '@/lib/prices';
import { polygonArea } from '@/geometry/polygon';
import { Section } from '../ui/Section';
import { Button } from '../ui/Button';

function kg(n: number): string {
  return `${n.toLocaleString('da-DK', { maximumFractionDigits: 1 })} kg`;
}

export function PartsListSection() {
  const inventory = usePlannerStore((s) => s.project.inventory);
  const projectName = usePlannerStore((s) => s.project.name);
  const list = useMemo(() => buildPartsList(inventory), [inventory]);
  const room = usePlannerStore((s) => s.project.room);
  // Prices are internal: a shared view-only link doesn't show them.
  const showPrices = usePlannerStore((s) => !s.shared);
  const areaM2 = room?.closed ? polygonArea(room.corners.map((c) => c.point)) / 1e6 : 0;

  const exportCsv = () => {
    const base = (projectName || 'plan').trim().replace(/\s+/g, '-').toLowerCase();
    downloadText(`${base}-parts-list.csv`, partsListToCsv(list, projectName), 'text/csv;charset=utf-8');
  };

  return (
    <Section title="Parts list">
      {list.rows.length === 0 ? (
        <p className="text-[12px] leading-relaxed text-ink-500">
          Place items from the library to build a parts list.
        </p>
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {list.rows.map((r) => (
              <li key={`${r.itemNumber}:${r.name}`} className="flex items-baseline gap-2">
                <span className="w-6 shrink-0 text-right font-mono text-[12px] text-ink-900">
                  {r.quantity}×
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[12px] text-ink-900">{r.name}</span>
                  <span className="font-mono text-[10px] text-ink-500">
                    {r.catalog ? r.itemNumber || 'no item number' : 'not in catalog'}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end font-mono text-[11px] text-ink-500">
                  {showPrices && (
                    <span className="text-ink-900" title={r.priceSource === 'supplier' ? 'From the supplier calculation' : undefined}>
                      {r.totalPriceEur !== undefined ? eur(r.totalPriceEur) : 'no price'}
                      {r.priceSource === 'supplier' && '*'}
                    </span>
                  )}
                  <span>{r.totalWeightKg !== undefined ? kg(r.totalWeightKg) : '–'}</span>
                </span>
              </li>
            ))}
          </ul>

          <div className="flex flex-col gap-1 border-t border-wall-200 pt-3">
            <Total label="Units" value={String(list.totalUnits)} />
            <Total
              label="Total weight"
              value={
                kg(list.totalWeightKg) +
                (list.unitsWithoutWeight ? ` + ${list.unitsWithoutWeight} unweighed` : '')
              }
            />
            {list.totalHangers > 0 && (
              <Total label="Hanger capacity" value={String(list.totalHangers)} />
            )}
            {showPrices && (
              <>
                <Total label="Total price" value={eur(Math.round(list.totalPriceEur * 100) / 100)} />
                {areaM2 > 0 && (
                  <Total label="Per m² floor" value={eur(Math.round((list.totalPriceEur / areaM2) * 100) / 100)} />
                )}
                <p className="text-[10px] leading-relaxed text-ink-500" data-testid="price-note">
                  {PRICE_LIST.currency}, sales prices from the {PRICE_LIST.name.toLowerCase()} ({PRICE_LIST.date}).
                  {list.rows.some((r) => r.priceSource === 'supplier') && ' * from the &elements calculation.'}
                  {list.unitsWithoutPrice > 0 &&
                    ` ${list.unitsWithoutPrice} unit${list.unitsWithoutPrice === 1 ? ' has' : 's have'} no price and ${list.unitsWithoutPrice === 1 ? 'is' : 'are'} not in the total.`}
                  {' '}Wall rack columns are added automatically: one at each end of a run of wall units, one between units.
                </p>
              </>
            )}
          </div>

          <Button variant="subtle" onClick={exportCsv} className="justify-center">
            Export parts list (CSV)
          </Button>
        </>
      )}
    </Section>
  );
}

function Total({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-[11px] text-ink-500">{label}</span>
      <span className="font-mono text-[12px] text-ink-900">{value}</span>
    </div>
  );
}
