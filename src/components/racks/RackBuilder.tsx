'use client';

import { useState } from 'react';
import { usePlannerStore } from '@/store/plannerStore';
import { findAsset } from '@/lib/assetCatalog';
import { RACK_MODULES, rackSummary } from '@/lib/racks';
import { Dialog, FieldLabel, inputClass } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { RackPreview } from './RackPreview';

const m = (v: number) => (v / 1000).toLocaleString('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Put wall units together side by side, see them in 3D, then place the
 * rack on the plan as one fixture (or update a placed one).
 */
export function RackBuilder() {
  const editId = usePlannerStore((s) => s.rackBuilder?.editId ?? null);
  const editing = usePlannerStore((s) => (editId ? s.project.inventory.find((i) => i.id === editId) : undefined));
  const close = usePlannerStore((s) => s.closeRackBuilder);
  const pickRack = usePlannerStore((s) => s.pickRack);
  const updateRack = usePlannerStore((s) => s.updateRack);
  const rackCount = usePlannerStore((s) => s.project.inventory.filter((i) => i.modules?.length).length);

  const [name, setName] = useState(editing?.name ?? `Wall rack ${rackCount + 1}`);
  const [modules, setModules] = useState<string[]>(editing?.modules ?? []);
  const summary = rackSummary(modules);

  const add = (id: string) => setModules((ms) => [...ms, id]);
  const removeAt = (i: number) => setModules((ms) => ms.filter((_, k) => k !== i));
  const swap = (i: number, j: number) =>
    setModules((ms) => {
      if (j < 0 || j >= ms.length) return ms;
      const next = [...ms];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });

  const done = () => {
    const rack = { name: name.trim() || 'Wall rack', modules };
    if (editing) updateRack(editing.id, rack);
    else pickRack(rack);
  };

  return (
    <Dialog title={editing ? 'Edit wall rack' : 'Wall rack builder'} onClose={close} width={1060}>
      <div className="grid gap-5 md:grid-cols-[260px_1fr]">
        {/* Units to add */}
        <div className="flex flex-col gap-2">
          <FieldLabel>Wall units</FieldLabel>
          <ul className="flex flex-col gap-1" data-testid="rack-modules">
            {RACK_MODULES.map((a) => (
              <li key={a.id}>
                <button
                  onClick={() => add(a.id)}
                  title={`Add ${a.name}`}
                  className="flex w-full flex-col rounded-[2px] border border-wall-200 bg-wall-50 px-2 py-1.5 text-left hover:border-ink-900"
                >
                  <span className="text-[12px] text-ink-900">+ {a.name}</span>
                  <span className="font-mono text-[10px] text-ink-500">
                    {a.itemNumber} · {m(a.size.width)} m{a.hangerCount ? ` · ${a.hangerCount} hangers` : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <label className="flex flex-col gap-1">
            <FieldLabel>Name</FieldLabel>
            <input aria-label="Rack name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
          </label>

          <div className="h-[300px] overflow-hidden rounded-[2px] border border-wall-200" data-testid="rack-preview">
            {modules.length > 0 ? (
              <RackPreview modules={modules} />
            ) : (
              <div className="flex h-full items-center justify-center bg-wall-100 text-[12px] text-ink-500">
                Add wall units from the list — they line up left to right, as seen from the front.
              </div>
            )}
          </div>

          {/* The run, left to right */}
          <div className="flex flex-col gap-2">
            <FieldLabel>Left to right</FieldLabel>
            {modules.length === 0 ? (
              <p className="text-[12px] text-ink-500">No units yet.</p>
            ) : (
              <ol className="flex flex-wrap gap-1.5" data-testid="rack-run">
                {modules.map((id, i) => {
                  const a = findAsset(id);
                  return (
                    <li
                      key={`${id}-${i}`}
                      className="flex items-center gap-1 rounded-[2px] border border-wall-300 bg-white/60 px-2 py-1 text-[11px] text-ink-900"
                    >
                      <span className="font-mono text-ink-500">{i + 1}</span>
                      <span className="max-w-[180px] truncate" title={a?.name}>
                        {a?.name.replace(/^Wall Unit\s*/, '') || id}
                      </span>
                      <span className="font-mono text-ink-500">{a ? m(a.size.width) : ''}</span>
                      <button aria-label={`Move unit ${i + 1} left`} className="px-1 text-ink-500 hover:text-ink-900 disabled:opacity-30" disabled={i === 0} onClick={() => swap(i, i - 1)}>
                        ‹
                      </button>
                      <button aria-label={`Move unit ${i + 1} right`} className="px-1 text-ink-500 hover:text-ink-900 disabled:opacity-30" disabled={i === modules.length - 1} onClick={() => swap(i, i + 1)}>
                        ›
                      </button>
                      <button aria-label={`Remove unit ${i + 1}`} className="px-1 text-ink-500 hover:text-red-700" onClick={() => removeAt(i)}>
                        ×
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>

          <dl className="grid grid-cols-4 gap-3 border-t border-wall-200 pt-3 text-[12px]" data-testid="rack-summary">
            <Stat label="Width" value={`${m(summary.size.width)} m`} />
            <Stat label="Depth × height" value={`${Math.round(summary.size.depth)} × ${Math.round(summary.size.height)} mm`} />
            <Stat label="Hangers" value={String(summary.hangers)} />
            <Stat label="Weight" value={`${summary.weightKg.toLocaleString('da-DK', { maximumFractionDigits: 1 })} kg`} />
          </dl>

          <div className="flex items-center justify-end gap-2">
            <span className="mr-auto text-[11px] text-ink-500">
              {editing
                ? 'The rack keeps its place on the wall.'
                : 'Then click next to a wall on the plan: the rack snaps to it as one piece.'}
            </span>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button variant="primary" onClick={done} disabled={modules.length === 0}>
              {editing ? 'Save rack' : 'Place on plan'}
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[10px] uppercase tracking-widest2 text-ink-500">{label}</dt>
      <dd className="font-mono text-ink-900">{value}</dd>
    </div>
  );
}
