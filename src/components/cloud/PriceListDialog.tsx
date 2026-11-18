'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { PRICE_LIST, builtInPrice, priceOf, usePriceList } from '@/lib/prices';
import { PRICE_ROWS, parsePrice, pricesFromCsv } from '@/lib/priceRows';
import { cloud, type CloudPriceList } from '@/lib/cloud/api';
import { savePriceList } from '@/lib/cloud/priceList';
import { downloadText } from '@/lib/io';
import { Dialog, ErrorText, FieldLabel, inputClass } from '../ui/Dialog';
import { Button } from '../ui/Button';

const ROWS = PRICE_ROWS;

const today = () => new Date().toISOString().slice(0, 10);
const shown = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n).replace('.', ','));

const when = (iso: string) =>
  new Date(iso).toLocaleString('da-DK', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/**
 * The price list in use: every catalog item and column with its price in
 * euro. Saving makes a new list for everyone signed in; the earlier ones
 * stay in the history and can be taken up again.
 */
export function PriceListDialog({ onClose }: { onClose: () => void }) {
  const active = usePriceList((s) => s.custom);
  const [name, setName] = useState(active?.name ?? PRICE_LIST.name);
  const [date, setDate] = useState(active?.date ?? PRICE_LIST.date);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(ROWS.map((r) => [r.key, shown(priceOf(r.key)?.priceEur)])),
  );
  const [history, setHistory] = useState<CloudPriceList[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const refresh = () =>
    cloud
      .listPriceLists()
      .then(setHistory)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not load the price lists.'));
  useEffect(() => {
    void refresh();
  }, []);

  const invalid = useMemo(() => ROWS.filter((r) => parsePrice(values[r.key] ?? '') === undefined).map((r) => r.key), [values]);
  const groups = useMemo(() => [...new Set(ROWS.map((r) => r.group))], []);
  const edit = (key: string, text: string) => {
    setSaved(false);
    setValues((v) => ({ ...v, [key]: text }));
  };

  const save = async () => {
    if (invalid.length || !name.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    setBusy(true);
    setError(null);
    try {
      const prices = Object.fromEntries(ROWS.map((r) => [r.key, parsePrice(values[r.key] ?? '') ?? null]));
      await savePriceList(name.trim(), date, prices);
      setSaved(true);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The price list was not saved.');
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = () => {
    const lines = [
      ['id', 'item number', 'name', 'price (EUR)'],
      ...ROWS.map((r) => [r.key, r.itemNumber, r.name, values[r.key] ?? '']),
    ];
    downloadText(`price-list-${date}.csv`, lines.map((l) => l.join(';')).join('\n'), 'text/csv;charset=utf-8');
  };

  const importCsv = async (file: File | undefined) => {
    if (!file) return;
    const read = pricesFromCsv(await file.text());
    const n = Object.keys(read).length;
    if (!n) {
      setError('No prices found in that file. It needs lines with the id or item number first and the price last, separated by semicolons.');
      return;
    }
    setError(null);
    setSaved(false);
    setValues((v) => ({ ...v, ...read }));
    setDate(today());
  };

  const take = (l: CloudPriceList) => {
    setSaved(false);
    setName(l.name);
    setDate(l.valid_from);
    setValues(Object.fromEntries(ROWS.map((r) => [r.key, shown(r.key in l.prices ? l.prices[r.key] : builtInPrice(r.key)?.priceEur)])));
  };
  const builtIn = () => {
    setSaved(false);
    setName(PRICE_LIST.name);
    setDate(PRICE_LIST.date);
    setValues(Object.fromEntries(ROWS.map((r) => [r.key, shown(builtInPrice(r.key)?.priceEur)])));
  };

  return (
    <Dialog title="Price list" onClose={onClose} width={720}>
      <div className="flex flex-col gap-5">
        <p className="text-[12px] leading-relaxed text-ink-700">
          The prices the parts list, the budget and the PDF use, in euro. Saving makes this the price list for everyone
          who is signed in; the earlier lists stay below and can be taken up again. Leave a price empty for &ldquo;no
          price&rdquo;.
        </p>

        <div className="grid grid-cols-[1fr_160px] gap-4">
          <label className="flex flex-col gap-1">
            <FieldLabel>Name of the list</FieldLabel>
            <input
              className={inputClass}
              value={name}
              maxLength={120}
              onChange={(e) => {
                setSaved(false);
                setName(e.target.value);
              }}
              aria-label="Name of the list"
            />
          </label>
          <label className="flex flex-col gap-1">
            <FieldLabel>Prices from</FieldLabel>
            <input
              type="date"
              className={inputClass}
              value={date}
              onChange={(e) => {
                setSaved(false);
                setDate(e.target.value);
              }}
              aria-label="Prices from"
            />
          </label>
        </div>

        <div className="max-h-[38vh] overflow-y-auto rounded-[2px] border border-wall-200" data-testid="price-rows">
          {groups.map((g) => (
            <div key={g}>
              <p className="sticky top-0 border-b border-wall-200 bg-wall-100 px-3 py-1 text-[10px] font-medium uppercase tracking-widest2 text-ink-500">
                {g}
              </p>
              {ROWS.filter((r) => r.group === g).map((r) => {
                const bad = invalid.includes(r.key);
                return (
                  <label key={r.key} className="flex items-center gap-3 border-b border-wall-200 px-3 py-1.5 last:border-b-0">
                    <span className="w-32 shrink-0 font-mono text-[10px] text-ink-500">{r.itemNumber || 'no item number'}</span>
                    <span className="min-w-0 flex-1 truncate text-[12px] text-ink-900">{r.name}</span>
                    <input
                      inputMode="decimal"
                      value={values[r.key] ?? ''}
                      onChange={(e) => edit(r.key, e.target.value)}
                      placeholder="no price"
                      aria-label={`Price of ${r.name}`}
                      aria-invalid={bad}
                      className={`w-24 border-b bg-transparent py-0.5 text-right font-mono text-[12px] outline-none ${
                        bad ? 'border-red-700 text-red-700' : 'border-wall-300 text-ink-900 focus:border-ink-900'
                      }`}
                    />
                    <span className="w-3 text-[11px] text-ink-500">€</span>
                  </label>
                );
              })}
            </div>
          ))}
        </div>

        {invalid.length > 0 && <ErrorText>{invalid.length === 1 ? 'One price is' : `${invalid.length} prices are`} not a number.</ErrorText>}
        {error && <ErrorText>{error}</ErrorText>}

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" disabled={busy || invalid.length > 0 || !name.trim()} onClick={() => void save()}>
            {busy ? 'Saving…' : 'Save price list'}
          </Button>
          {saved && (
            <span role="status" className="text-[12px] text-sage-500">
              Saved — in use for everyone signed in.
            </span>
          )}
          <span className="flex-1" />
          <Button variant="ghost" onClick={exportCsv} title="The list as a file for Excel">
            Export CSV
          </Button>
          <Button
            variant="ghost"
            onClick={() => fileInput.current?.click()}
            title="Fill in prices from a CSV file: id or item number first, the price last"
          >
            Import CSV…
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept=".csv,text/csv,text/plain"
            className="hidden"
            data-testid="price-csv"
            onChange={(e) => {
              void importCsv(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>

        <section className="flex flex-col gap-2 border-t border-wall-200 pt-4">
          <h3 className="text-[10px] font-medium uppercase tracking-widest2 text-ink-500">Earlier price lists</h3>
          <ul className="flex flex-col divide-y divide-wall-200" data-testid="price-history">
            {(history ?? []).map((l, i) => (
              <li key={l.id} className="flex items-center gap-3 py-1.5">
                <span className="min-w-0 flex-1 truncate text-[12px] text-ink-900">
                  {l.name} <span className="text-ink-500">· prices from {l.valid_from}</span>
                  {i === 0 && <span className="ml-2 text-[10px] uppercase tracking-widest2 text-sage-500">in use</span>}
                </span>
                <span className="shrink-0 text-[11px] text-ink-500">
                  {l.saved_by_email} · {when(l.saved_at)}
                </span>
                <Button variant="ghost" onClick={() => take(l)} title="Put these prices in the form above; Save makes them the list in use">
                  Take up
                </Button>
              </li>
            ))}
            <li className="flex items-center gap-3 py-1.5">
              <span className="min-w-0 flex-1 truncate text-[12px] text-ink-900">
                {PRICE_LIST.name} <span className="text-ink-500">· prices from {PRICE_LIST.date} · built into the planner</span>
                {history?.length === 0 && <span className="ml-2 text-[10px] uppercase tracking-widest2 text-sage-500">in use</span>}
              </span>
              <Button variant="ghost" onClick={builtIn} title="Put the built-in prices in the form above">
                Take up
              </Button>
            </li>
          </ul>
        </section>
      </div>
    </Dialog>
  );
}
