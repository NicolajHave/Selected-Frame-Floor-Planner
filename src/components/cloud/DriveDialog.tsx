'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { drive, sizeLabel, type Drawing } from '@/lib/cloud/drive';
import { Dialog, ErrorText, inputClass } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { when } from './ProjectsDialog';

/**
 * The shared cloud drive: store drawings everyone planning can upload and
 * import as a plan, without having them on their own disk.
 */
export function DriveDialog({ onUse, onClose }: { onUse: (file: File) => void; onClose: () => void }) {
  const [list, setList] = useState<Drawing[] | null>(null);
  const [shop, setShop] = useState('');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const refresh = useCallback(async () => {
    try {
      setList(await drive.list());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the drive.');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = async (key: string, task: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    try {
      await task();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work.');
    } finally {
      setBusy(null);
    }
  };

  const onFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])];
    e.target.value = '';
    if (!files.length) return;
    void run('upload', async () => {
      for (const f of files) {
        setBusy(`upload:${f.name}`);
        const added = await drive.upload(f, shop);
        setList((prev) => [added, ...(prev ?? [])]);
      }
    });
  };

  const use = (d: Drawing) =>
    void run(`use:${d.id}`, async () => {
      const file = await drive.download(d);
      onClose();
      onUse(file);
    });

  const remove = (d: Drawing) =>
    void run(`delete:${d.id}`, async () => {
      if (!window.confirm(`Delete ${d.file_name} from the drive for everyone?`)) return;
      await drive.remove(d);
      setList((prev) => prev?.filter((x) => x.id !== d.id) ?? null);
    });

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!list || !q) return list;
    return list.filter((d) => `${d.file_name} ${d.shop ?? ''} ${d.uploaded_by_email}`.toLowerCase().includes(q));
  }, [list, query]);

  const shops = useMemo(() => [...new Set((list ?? []).map((d) => d.shop).filter(Boolean))] as string[], [list]);

  return (
    <Dialog title="Cloud drive" onClose={onClose} width={620}>
      <div className="flex flex-col gap-4">
        <p className="text-[12px] leading-relaxed text-ink-700">
          Store drawings shared with everyone planning at BESTSELLER: upload a PDF, DWG, DXF or image once (up to 50 MB),
          and anyone can import it as their plan.
        </p>

        <input
          ref={fileInput}
          type="file"
          multiple
          accept="application/pdf,.pdf,image/png,image/jpeg,image/webp,.dwg,.dxf"
          className="hidden"
          onChange={onFiles}
          data-testid="drive-file"
        />
        <div className="flex items-end gap-2">
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-[11px] text-ink-500">Shop (optional)</span>
            <input
              className={inputClass}
              value={shop}
              maxLength={120}
              list="drive-shops"
              placeholder="e.g. Printemps Haussmann"
              onChange={(e) => setShop(e.target.value)}
            />
            <datalist id="drive-shops">
              {shops.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </label>
          <Button variant="primary" onClick={() => fileInput.current?.click()} disabled={!!busy?.startsWith('upload')}>
            {busy?.startsWith('upload') ? 'Uploading…' : 'Upload drawing…'}
          </Button>
        </div>

        {error && <ErrorText>{error}</ErrorText>}

        <div className="flex flex-col gap-2">
          {!!list?.length && (
            <input
              className={inputClass}
              value={query}
              placeholder="Search by file, shop or colleague"
              aria-label="Search the drive"
              onChange={(e) => setQuery(e.target.value)}
            />
          )}
          {!shown ? (
            <p className="text-[12px] text-ink-500">Loading…</p>
          ) : shown.length === 0 ? (
            <p className="text-[12px] text-ink-500">{list?.length ? 'Nothing matches.' : 'No drawings on the drive yet.'}</p>
          ) : (
            <ul className="flex max-h-[46vh] flex-col divide-y divide-wall-200 overflow-y-auto" data-testid="drive-list">
              {shown.map((d) => (
                <li key={d.id} className="flex items-center gap-3 py-2.5">
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[13px] text-ink-900" title={d.file_name}>
                        {d.file_name}
                      </span>
                      {d.shop && (
                        <span className="shrink-0 rounded-[2px] bg-wall-100 px-1.5 py-0.5 text-[10px] text-ink-700">{d.shop}</span>
                      )}
                    </span>
                    <span className="text-[11px] text-ink-500">
                      {sizeLabel(d.size_bytes)} · {when(d.uploaded_at)} by {d.mine ? 'you' : d.uploaded_by_email}
                    </span>
                  </div>
                  <Button variant="subtle" onClick={() => use(d)} disabled={!!busy}>
                    {busy === `use:${d.id}` ? 'Opening…' : 'Use as plan'}
                  </Button>
                  {d.mine && (
                    <Button variant="danger" onClick={() => remove(d)} disabled={!!busy} title={`Delete ${d.file_name}`}>
                      Delete
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Dialog>
  );
}
