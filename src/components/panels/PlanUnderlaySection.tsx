'use client';

import { useRef, useState } from 'react';
import { usePlannerStore } from '@/store/plannerStore';
import { rasterizePlanFile } from '@/lib/planImport';
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
  const [pages, setPages] = useState(1);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const raster = await rasterizePlanFile(file);
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
        fileName: file.name,
        aspect: raster.aspect,
        width: width as Mm,
        position: { x: (cx - width / 2) as Mm, y: (cy - (width * raster.aspect) / 2) as Mm },
        opacity: 0.6,
        locked: true,
        calibrated: false,
      });
      setPages(raster.pageCount);
      startCalibration();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that file.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title="Plan underlay">
      <input
        ref={fileInput}
        type="file"
        accept="application/pdf,.pdf,image/*"
        className="hidden"
        onChange={onFile}
        data-testid="underlay-file"
      />

      {!underlay ? (
        <>
          <p className="text-[12px] leading-relaxed text-ink-500">
            Import the store&apos;s floor plan (PDF or image), set its scale from one known
            measurement, and draw the room on top of it.
          </p>
          <Button
            variant="subtle"
            className="justify-center"
            disabled={busy}
            onClick={() => fileInput.current?.click()}
          >
            {busy ? 'Reading plan…' : 'Import plan (PDF or image)'}
          </Button>
        </>
      ) : (
        <>
          <div className="flex flex-col gap-0.5">
            <span className="truncate text-[12px] text-ink-900" title={underlay.fileName}>
              {underlay.fileName}
            </span>
            <span className={underlay.calibrated ? 'text-[11px] text-ink-500' : 'text-[11px] text-amber-700'}>
              {underlay.calibrated ? 'Scale set' : 'Scale not set — measurements will be wrong'}
              {pages > 1 && ` · page 1 of ${pages}`}
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
    </Section>
  );
}
