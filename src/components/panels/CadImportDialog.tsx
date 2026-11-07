'use client';

import { useEffect, useState } from 'react';
import type { Crop } from '@/lib/planImport';
import { readCadFile, renderCad, type FlatDrawing } from '@/lib/cad';
import { DRAWING_UNITS } from '@/lib/cad/types';
import { Dialog, ErrorText } from '../ui/Dialog';
import { CropPicker } from './PdfImportDialog';

export interface CadUnderlay {
  src: string;
  aspect: number;
  /** Real width covered, mm: the drawing sets the scale. */
  widthMm: number;
  cropped: boolean;
}

/**
 * Importing a DWG or DXF: the drawing is read and drawn at its own scale;
 * drag a box around the part of the store you need (a whole building is too
 * big to trace at once).
 */
export function CadImportDialog({
  file,
  onImport,
  onClose,
}: {
  file: File;
  onImport: (u: CadUnderlay) => void;
  onClose: () => void;
}) {
  const [drawing, setDrawing] = useState<FlatDrawing | null>(null);
  const [preview, setPreview] = useState<{ src: string; aspect: number } | null>(null);
  const [busy, setBusy] = useState<string | null>('Reading the drawing…');
  const [error, setError] = useState<string | null>(null);
  const [unitMm, setUnitMm] = useState(1);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const d = await readCadFile(file);
        if (!live) return;
        if (d.paths.length === 0) throw new Error('No lines found in the drawing’s model space.');
        setDrawing(d);
        setUnitMm(d.unitMm);
        setPreview(renderCad(d, null, 1400));
        setBusy(null);
      } catch (e) {
        if (!live) return;
        setBusy(null);
        setError(e instanceof Error ? e.message : 'The drawing could not be read.');
      }
    })();
    return () => {
      live = false;
    };
  }, [file]);

  const finish = (crop: Crop | null) => {
    if (!drawing) return;
    setBusy('Drawing it at full size…');
    // Let the status paint before the (synchronous) render.
    setTimeout(() => {
      const r = renderCad(drawing, crop, undefined, unitMm);
      onImport({ src: r.src, aspect: r.aspect, widthMm: r.widthMm, cropped: !!crop });
    }, 30);
  };

  return (
    <Dialog title="CAD drawing · keep the part you need" onClose={onClose} width={980}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-500">
          <span className="truncate" title={file.name}>
            {file.name}
          </span>
          {drawing && (
            <>
              <label className="flex items-center gap-1.5">
                <span>Drawn in</span>
                <select
                  aria-label="Drawing units"
                  value={DRAWING_UNITS.some((u) => u.mm === unitMm) ? unitMm : ''}
                  onChange={(e) => setUnitMm(Number(e.target.value))}
                  className="border border-wall-200 bg-white/60 px-1 py-0.5 text-[12px] text-ink-900"
                >
                  {!DRAWING_UNITS.some((u) => u.mm === unitMm) && <option value="">{unitMm} mm per unit</option>}
                  {DRAWING_UNITS.map((u) => (
                    <option key={u.mm} value={u.mm}>
                      {u.label.toLowerCase()}
                    </option>
                  ))}
                </select>
              </label>
              <span data-testid="cad-size">
                whole drawing {size(drawing.bounds.maxX - drawing.bounds.minX, unitMm)} ×{' '}
                {size(drawing.bounds.maxY - drawing.bounds.minY, unitMm)} — check it against a size you know
              </span>
            </>
          )}
        </div>
        {error ? (
          <ErrorText>{error}</ErrorText>
        ) : (
          <CropPicker
            preview={preview}
            alt="Drawing"
            busy={busy}
            hint="Drag a box around the shop to keep just that part — it is drawn sharper, and its scale comes from the drawing, so there is no need to set it."
            wholeLabel="Use whole drawing"
            onDone={finish}
          />
        )}
      </div>
    </Dialog>
  );
}

const size = (units: number, unitMm: number) => `${((units * unitMm) / 1000).toFixed(1)} m`;
