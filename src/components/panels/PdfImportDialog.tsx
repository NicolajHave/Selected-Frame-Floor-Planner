'use client';

import { useEffect, useRef, useState } from 'react';
import type { Crop, PdfSource, RasterPlan } from '@/lib/planImport';
import { Dialog, ErrorText } from '../ui/Dialog';
import { Button } from '../ui/Button';

/** Width of the page shown for cropping, px. */
const CROP_PREVIEW = 1200;
/** Smallest box that counts as a selection, as a fraction of the page. */
const MIN_CROP = 0.02;

interface Props {
  pdf: PdfSource;
  fileName: string;
  onImport: (raster: RasterPlan, page: number, crop: Crop | null) => void;
  onClose: () => void;
}

/**
 * Importing a PDF plan: choose the page (when there are several), then
 * optionally drag a box around the plan so only that part is kept, at full
 * resolution.
 */
export function PdfImportDialog({ pdf, fileName, onImport, onClose }: Props) {
  const multi = pdf.pageCount > 1;
  const [page, setPage] = useState<number | null>(multi ? null : 1);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const finish = async (crop: Crop | null) => {
    if (page === null) return;
    setBusy(crop ? 'Rendering the selection…' : 'Rendering the page…');
    setError(null);
    try {
      onImport(await pdf.render(page, crop), page, crop);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The page could not be rendered.');
      setBusy(null);
    }
  };

  return (
    <Dialog title={page === null ? 'Choose the page with the floor plan' : `Page ${page} · keep the plan`} onClose={onClose} width={page === null ? 760 : 980}>
      <div className="flex flex-col gap-3">
        <p className="truncate text-[12px] text-ink-500" title={fileName}>
          {fileName} · {pdf.pageCount} {pdf.pageCount === 1 ? 'page' : 'pages'}
        </p>
        {page === null ? (
          <PageGrid pdf={pdf} onPick={setPage} />
        ) : (
          <CropStep
            pdf={pdf}
            page={page}
            busy={busy}
            onBack={multi ? () => setPage(null) : undefined}
            onDone={finish}
          />
        )}
        {error && <ErrorText>{error}</ErrorText>}
      </div>
    </Dialog>
  );
}

function PageGrid({ pdf, onPick }: { pdf: PdfSource; onPick: (n: number) => void }) {
  const [previews, setPreviews] = useState<Record<number, { src: string; aspect: number }>>({});
  useEffect(() => {
    let live = true;
    (async () => {
      // One at a time keeps the browser responsive on long documents.
      for (let n = 1; n <= pdf.pageCount && live; n++) {
        const p = await pdf.preview(n, 360).catch(() => null);
        if (p && live) setPreviews((prev) => ({ ...prev, [n]: p }));
      }
    })();
    return () => {
      live = false;
    };
  }, [pdf]);

  return (
    <div className="grid grid-cols-3 gap-3 overflow-y-auto pr-1">
      {Array.from({ length: pdf.pageCount }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          onClick={() => onPick(n)}
          aria-label={`Page ${n}`}
          className="flex flex-col gap-1 rounded-[2px] border border-wall-200 bg-white p-1.5 text-left transition-colors hover:border-ink-900"
        >
          <div className="flex aspect-[1.414] w-full items-center justify-center bg-wall-100">
            {previews[n] ? (
              <img src={previews[n]!.src} alt="" className="max-h-full max-w-full object-contain" />
            ) : (
              <span className="text-[11px] text-ink-500">…</span>
            )}
          </div>
          <span className="text-[11px] text-ink-700">Page {n}</span>
        </button>
      ))}
    </div>
  );
}

function CropStep({
  pdf,
  page,
  busy,
  onBack,
  onDone,
}: {
  pdf: PdfSource;
  page: number;
  busy: string | null;
  onBack?: () => void;
  onDone: (crop: Crop | null) => void;
}) {
  const [preview, setPreview] = useState<{ src: string; aspect: number } | null>(null);
  useEffect(() => {
    let live = true;
    setPreview(null);
    pdf.preview(page, CROP_PREVIEW).then((p) => live && setPreview(p)).catch(() => {});
    return () => {
      live = false;
    };
  }, [pdf, page]);
  return (
    <CropPicker
      preview={preview}
      alt={`Page ${page}`}
      busy={busy}
      hint="Drag a box around the floor plan to keep just that part — it is then drawn much sharper. Or use the whole page."
      wholeLabel="Use whole page"
      onBack={onBack}
      backLabel="← Other page"
      onDone={onDone}
    />
  );
}

/** A picture of a page or drawing with a box to drag around the part to keep. */
export function CropPicker({
  preview,
  alt,
  busy,
  hint,
  wholeLabel,
  onBack,
  backLabel,
  onDone,
}: {
  preview: { src: string; aspect: number } | null;
  alt: string;
  busy: string | null;
  hint: string;
  wholeLabel: string;
  onBack?: () => void;
  backLabel?: string;
  onDone: (crop: Crop | null) => void;
}) {
  const [crop, setCrop] = useState<Crop | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const box = useRef<HTMLDivElement | null>(null);

  // A new picture of the same page (e.g. layers switched) keeps the box.
  useEffect(() => setCrop(null), [preview?.aspect]);

  const at = (e: React.PointerEvent) => {
    const r = box.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    };
  };
  const drag = (e: React.PointerEvent) => {
    if (!start.current) return;
    const p = at(e);
    const s = start.current;
    setCrop({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) });
  };
  const selected = crop && crop.w > MIN_CROP && crop.h > MIN_CROP ? crop : null;

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <p className="text-[12px] leading-relaxed text-ink-700">{hint}</p>
      <div className="min-h-0 overflow-auto bg-wall-100 p-2">
        {preview ? (
          <div
            ref={box}
            data-testid="pdf-crop"
            className="relative mx-auto cursor-crosshair touch-none select-none"
            style={{ aspectRatio: `${1 / preview.aspect}`, maxHeight: '52vh' }}
            onPointerDown={(e) => {
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              start.current = at(e);
              setCrop(null);
            }}
            onPointerMove={drag}
            onPointerUp={(e) => {
              drag(e);
              start.current = null;
            }}
          >
            <img src={preview.src} alt={alt} draggable={false} className="block h-full w-full bg-white" />
            {crop && (
              <div
                data-testid="pdf-crop-box"
                className="pointer-events-none absolute border-2 border-ink-900"
                style={{
                  left: `${crop.x * 100}%`,
                  top: `${crop.y * 100}%`,
                  width: `${crop.w * 100}%`,
                  height: `${crop.h * 100}%`,
                  boxShadow: '0 0 0 9999px rgba(22,24,26,0.35)',
                }}
              />
            )}
          </div>
        ) : (
          <p className="py-16 text-center text-[12px] text-ink-500">Rendering…</p>
        )}
      </div>
      <div className="flex items-center justify-end gap-2">
        {busy && (
          <span role="status" className="mr-auto text-[12px] text-ink-500">
            {busy}
          </span>
        )}
        {onBack && (
          <Button variant="ghost" onClick={onBack} disabled={!!busy} className={busy ? '' : 'mr-auto'}>
            {backLabel}
          </Button>
        )}
        <Button variant="subtle" onClick={() => onDone(null)} disabled={!!busy || !preview}>
          {wholeLabel}
        </Button>
        <Button variant="primary" onClick={() => onDone(selected)} disabled={!!busy || !selected}>
          Use selection
        </Button>
      </div>
    </div>
  );
}
