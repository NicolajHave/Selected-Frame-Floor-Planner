'use client';

import { useMemo } from 'react';
import { clsx } from 'clsx';
import { usePlannerStore } from '@/store/plannerStore';
import { buildPartsList } from '@/lib/partsList';
import { layoutIssues } from '@/lib/layout';
import { eur } from '@/lib/prices';
import { polygonArea } from '@/geometry/polygon';
import { variantList, withVariant } from '@/lib/variants';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';

const num = (n: number, digits = 0) => n.toLocaleString('da-DK', { maximumFractionDigits: digits, minimumFractionDigits: digits });

/** The layouts side by side: fixtures, cost, capacity and layout problems. */
export function CompareVariantsDialog({ onClose }: { onClose: () => void }) {
  const project = usePlannerStore((s) => s.project);
  const switchVariant = usePlannerStore((s) => s.switchVariant);
  const room = project.room;
  const areaM2 = room?.closed ? polygonArea(room.corners.map((c) => c.point)) / 1e6 : 0;
  // Prices are internal: a shared view-only link doesn't show them.
  const showPrices = usePlannerStore((s) => !s.shared);
  const budget = showPrices ? project.budgetEur : undefined;
  const money = (n: number) => eur(Math.round(n));

  const columns = useMemo(
    () =>
      variantList(project).map((v) => {
        const p = withVariant(project, v.id);
        const list = buildPartsList(p.inventory);
        const issues = layoutIssues(p, project.minAisle).length;
        return { ...v, list, issues };
      }),
    [project],
  );

  // The best value per row is marked (more capacity, lower cost, fewer issues).
  const best = (values: number[], higher: boolean) => {
    const target = higher ? Math.max(...values) : Math.min(...values);
    return values.filter((x) => x === target).length < values.length ? target : null;
  };

  const rows: { label: string; values: number[]; show: (n: number) => string; higher?: boolean; hint?: string }[] = [
    { label: 'Fixtures', values: columns.map((c) => c.list.totalUnits), show: (n) => num(n) },
    ...(showPrices
      ? [{ label: 'Price', values: columns.map((c) => c.list.totalPriceEur), show: money, higher: false }]
      : []),
    ...(showPrices && areaM2 > 0
      ? [{ label: 'Price per m²', values: columns.map((c) => c.list.totalPriceEur / areaM2), show: money, higher: false }]
      : []),
    { label: 'Hanger capacity', values: columns.map((c) => c.list.totalHangers), show: (n: number) => num(n), higher: true },
    { label: 'Shelf metres', values: columns.map((c) => c.list.totalShelfMeters), show: (n: number) => `${num(n, 1)} m`, higher: true },
    ...(areaM2 > 0
      ? [{ label: 'Hangers per m²', values: columns.map((c) => c.list.totalHangers / areaM2), show: (n: number) => num(n, 1), higher: true }]
      : []),
    { label: 'Layout problems', values: columns.map((c) => c.issues), show: (n) => (n ? num(n) : 'None'), higher: false },
  ];

  return (
    <Dialog title="Compare layouts" onClose={onClose} width={Math.min(980, 260 + columns.length * 150)}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[12px]" data-testid="compare-table">
          <thead>
            <tr>
              <th />
              {columns.map((c) => (
                <th key={c.id} className="px-3 pb-2 text-left align-bottom">
                  <span className="block text-[13px] font-medium text-ink-900">{c.name}</span>
                  {c.active ? (
                    <span className="text-[10px] uppercase tracking-widest2 text-ink-500">Showing</span>
                  ) : (
                    <Button
                      variant="ghost"
                      className="-ml-2 h-6 px-2 text-[11px]"
                      onClick={() => {
                        switchVariant(c.id);
                        onClose();
                      }}
                    >
                      Show
                    </Button>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const mark = r.higher === undefined ? null : best(r.values, r.higher);
              return (
                <tr key={r.label} className="border-t border-wall-200">
                  <th scope="row" className="py-2 pr-3 text-left font-normal text-ink-500">
                    {r.label}
                  </th>
                  {r.values.map((v, i) => (
                    <td
                      key={columns[i]!.id}
                      className={clsx('px-3 py-2 font-mono tabular-nums', mark !== null && v === mark ? 'font-semibold text-sage-500' : 'text-ink-900')}
                    >
                      {r.show(v)}
                    </td>
                  ))}
                </tr>
              );
            })}
            {budget ? (
              <tr className="border-t border-wall-200">
                <th scope="row" className="py-2 pr-3 text-left font-normal text-ink-500">
                  Budget {eur(budget)}
                </th>
                {columns.map((c) => {
                  const left = budget - c.list.totalPriceEur;
                  return (
                    <td key={c.id} className={clsx('px-3 py-2 font-mono tabular-nums', left < 0 ? 'text-red-700' : 'text-ink-900')}>
                      {left < 0 ? `${money(-left)} over` : `${money(left)} left`}
                    </td>
                  );
                })}
              </tr>
            ) : null}
          </tbody>
        </table>
        {showPrices && columns.some((c) => c.list.unitsWithoutPrice > 0) && (
          <p className="mt-3 text-[11px] text-ink-500">Prices leave out fixtures that have no price in the price list.</p>
        )}
      </div>
    </Dialog>
  );
}
