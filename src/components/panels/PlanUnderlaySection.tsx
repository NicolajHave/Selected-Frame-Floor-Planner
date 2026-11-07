'use client';

import { useRef, useState } from 'react';
import { usePlannerStore } from '@/store/plannerStore';
import { isPdf, openPdf, rasterizePlanFile, type Crop, type PdfSource, type RasterPlan } from '@/lib/planImport';
import { PdfImportDialog } from './PdfImportDialog';
import { CadImportDialog, type CadUnderlay } from './CadImportDialog';
import { isCad } from '@/lib/cad';
import type { Mm } from '@/model/units';
import { Section } from '../ui/Section';
import { Button } from '../ui/Button';

/** Fraction of the visible canvas a freshly imported plan fills. */
const FILL = 0.8;

export function PlanUnderlaySection() {
  const underlay = usePlannerStore((s) => s.project.underlay);
  const setUnderlay = usePlannerStore((s) => s.setUnderlay);
  const updateUnderlay = usePlannerStore((s) => s.updateUnderlay);
  const startCalibration = usePlannerStore((s) => s.startCalibration);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pdf, setPdf] = useState<{ source: PdfSource; fileName: string } | null>(null);
  const [cad, setCad] = useState<File | null>(null);
  const setZoom = usePlannerStore((s) => s.setZoom);
  const setPan = usePlannerStore((s) => s.setPan);

  const closePdf = () => {
    pdf?.source.close();
    setPdf(null);
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      if (isCad(file)) {
        // Read and choose the part of the drawing in a dialog.
        setCad(file);
        return;
      }
      if (isPdf(file)) {
        // Choose the page (and the part of it) in a dialog first.
        setPdf({ source: await openPdf(file), fileName: file.name });
        return;
      }
      place(await rasterizePlanFile(file), file.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that file.');
    } finally {
      setBusy(false);
    }
  };

  /** A CAD underlay is at its real size: put it in the middle of the view and zoom to fit it. */
  const placeCad = (u: CadUnderlay, fileName: string) => {
    const { view } = usePlannerStore.getState();
    const stage = document.querySelector('[data-stage]')?.getBoundingClientRect();
    const sw = stage?.width ?? 800;
    const sh = stage?.height ?? 600;
    const cx = (sw / 2 - view.pan.x) / view.zoom;
    const cy = (sh / 2 - view.pan.y) / view.zoom;
    const h = u.widthMm * u.aspect;
    setUnderlay({
      src: u.src,
      fileName,
      aspect: u.aspect,
      width: u.widthMm as Mm,
      position: { x: (cx - u.widthMm / 2) as Mm, y: (cy - h / 2) as Mm },
      opacity: 0.6,
      locked: true,
      calibrated: true,
      fromCad: true,
      ...(u.cropped ? { cropped: true } : {}),
    });
    const zoom = Math.min((FILL * sw) / u.widthMm, (FILL * sh) / h);
    setZoom(zoom);
    const z = usePlannerStore.getState().view.zoom;
    setPan(sw / 2 - cx * z, sh / 2 - cy * z);
  };

  const place = (raster: RasterPlan, fileName: string, pdfPage?: { page: number; crop: Crop | null }) => {
    // Fit the plan into the visible part of the canvas; calibration fixes the scale.
    const { view } = usePlannerStore.getState();
    const stage = document.querySelector('[data-stage]')?.getBoundingClientRect();
    const sw = stage?.width ?? 800;
    const sh = stage?.height ?? 600;
    const width = Math.min((FILL * sw) / view.zoom, (FILL * sh) / view.zoom / raster.aspect);
    const cx = (sw / 2 - view.pan.x) / view.zoom;
    const cy = (sh / 2 - view.pan.y) / view.zoom;
    setUnderlay({
      src: raster.src,
      fileName,
      aspect: raster.aspect,
      width: width as Mm,
      position: { x: (cx - width / 2) as Mm, y: (cy - (width * raster.aspect) / 2) as Mm },
      opacity: 0.6,
      locked: true,
      calibrated: false,
      ...(pdfPage ? { page: pdfPage.page, pageCount: raster.pageCount, ...(pdfPage.crop ? { cropped: true } : {}) } : {}),
    });
    startCalibration();
  };

  return (
    <Section title="Plan underlay">
      <input
        ref={fileInput}
        type="file"
        accept="application/pdf,.pdf,image/*,.dwg,.dxf"
        className="hidden"
        onChange={onFile}
        data-testid="underlay-file"
      />

      {!underlay ? (
        <>
          <p className="text-[12px] leading-relaxed text-ink-500">
            Import the store&apos;s floor plan (PDF, image, or DWG/DXF drawing), set its scale from
            one known measurement — drawings bring their own — and draw the room on top of it.
          </p>
          <Button
            variant="subtle"
            className="justify-center"
            disabled={busy}
            onClick={() => fileInput.current?.click()}
          >
            {busy ? 'Reading plan…' : 'Import plan (PDF, image, DWG/DXF)'}
          </Button>
        </>
      ) : (
        <>
          <div className="flex flex-col gap-0.5">
            <span className="truncate text-[12px] text-ink-900" title={underlay.fileName}>
              {underlay.fileName}
            </span>
            <span className={underlay.calibrated ? 'text-[11px] text-ink-500' : 'text-[11px] text-amber-700'}>
              {underlay.fromCad ? 'Scale from the drawing' : underlay.calibrated ? 'Scale set' : 'Scale not set — measurements will be wrong'}
              {underlay.pageCount && underlay.pageCount > 1 && ` · page ${underlay.page ?? 1} of ${underlay.pageCount}`}
              {underlay.cropped && (underlay.fromCad ? ' · part of the drawing' : ' · part of the page')}
            </span>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-widest2 text-ink-500">Opacity</span>
            <input
              type="range"
              min={10}
              max={100}
              value={Math.round(underlay.opacity * 100)}
              onChange={(e) => updateUnderlay({ opacity: Number(e.target.value) / 100 })}
              aria-label="Underlay opacity"
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <Button variant="subtle" className="justify-center" onClick={startCalibration}>
              Set scale
            </Button>
            <Button
              variant="subtle"
              className="justify-center"
              active={!underlay.locked}
              onClick={() => updateUnderlay({ locked: !underlay.locked })}
              title={underlay.locked ? 'Unlock to drag the plan into place' : 'Lock so the plan ignores clicks'}
            >
              {underlay.locked ? 'Move' : 'Done moving'}
            </Button>
            <Button
              variant="subtle"
              className="justify-center"
              disabled={busy}
              onClick={() => fileInput.current?.click()}
            >
              Replace
            </Button>
            <Button variant="subtle" className="justify-center" onClick={() => setUnderlay(null)}>
              Remove
            </Button>
          </div>
        </>
      )}

      {error && <p className="text-[11px] text-red-700">{error}</p>}
      {cad && (
        <CadImportDialog
          file={cad}
          onClose={() => setCad(null)}
          onImport={(u) => {
            placeCad(u, cad.name);
            setCad(null);
          }}
        />
      )}
      {pdf && (
        <PdfImportDialog
          pdf={pdf.source}
          fileName={pdf.fileName}
          onClose={closePdf}
          onImport={(raster, page, crop) => {
            place(raster, pdf.fileName, { page, crop });
            closePdf();
          }}
        />
      )}
    </Section>
  );
}
