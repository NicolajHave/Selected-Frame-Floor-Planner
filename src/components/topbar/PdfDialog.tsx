'use client';

import { useState } from 'react';
import { usePlannerStore } from '@/store/plannerStore';
import { getLiveLink, liveLinkAvailability } from '@/lib/cloud/liveLink';
import { Dialog, ErrorText, FieldLabel } from '../ui/Dialog';
import { Button } from '../ui/Button';

/**
 * Options for the presentation PDF: the draft's notes, the live 3D link
 * (with QR code) and the rendered 3D views and elevations.
 */
export function PdfDialog({ onClose, signedIn }: { onClose: () => void; signedIn: boolean }) {
  const readOnly = usePlannerStore((s) => s.readOnly);
  const savedNotes = usePlannerStore((s) => s.project.notes ?? '');
  const setNotes = usePlannerStore((s) => s.setNotes);
  const [notes, setDraft] = useState(savedNotes);
  const availability = liveLinkAvailability(signedIn);
  const [withLink, setWithLink] = useState(availability.ok);
  const [withViews, setWithViews] = useState(true);
  const [withPrices, setWithPrices] = useState(false);
  const shared = usePlannerStore((s) => !!s.shared);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const keepNotes = () => {
    if (!readOnly) setNotes(notes.trim());
  };
  const close = () => {
    if (!busy) {
      keepNotes();
      onClose();
    }
  };

  const exportPdf = async () => {
    setError(null);
    keepNotes();
    try {
      let liveUrl: string | null = null;
      if (withLink && availability.ok) {
        setBusy('Getting the live link…');
        liveUrl = await getLiveLink();
      }
      setBusy('Preparing…');
      const { downloadPlanPdf } = await import('@/lib/pdfExport');
      const project = usePlannerStore.getState().project;
      await downloadPlanPdf(project, {
        // A plan that wasn't scaled wouldn't line up with the drawing.
        includeUnderlay: !!project.underlay?.calibrated,
        liveUrl,
        views: withViews,
        prices: withPrices && !shared,
        onProgress: setBusy,
      });
      setBusy(null);
      onClose();
    } catch (e) {
      setBusy(null);
      setError(e instanceof Error ? e.message : 'The PDF could not be made.');
    }
  };

  return (
    <Dialog title="Export PDF" onClose={close} width={500}>
      <div className="flex flex-col gap-4">
        <p className="text-[12px] leading-relaxed text-ink-700">
          A3 presentation: cover, concept and site readiness, 3D views, the plan to scale, wall elevations
          with heights, parts list and layout check.
        </p>

        <label className="flex flex-col gap-1">
          <FieldLabel>Notes for this draft</FieldLabel>
          {readOnly ? (
            <p className="whitespace-pre-wrap text-[13px] text-ink-900">{savedNotes || '—'}</p>
          ) : (
            <textarea
              value={notes}
              onChange={(e) => setDraft(e.target.value)}
              rows={5}
              placeholder="E.g. power needed behind the shelves; LED logo needs a hidden connection."
              className="w-full resize-y border border-wall-300 bg-white/60 p-2 text-[13px] text-ink-900 outline-none focus:border-ink-900"
            />
          )}
        </label>

        <div className="flex flex-col gap-2">
          <label className={`flex items-start gap-2 text-[13px] ${availability.ok ? 'text-ink-900' : 'text-ink-500'}`}>
            <input
              type="checkbox"
              className="mt-[3px]"
              checked={withLink && availability.ok}
              disabled={!availability.ok}
              onChange={(e) => setWithLink(e.target.checked)}
            />
            <span>
              Live 3D link with QR code
              <span className="block text-[11px] text-ink-500">
                {availability.ok
                  ? 'The shop’s own view-only link: partners can walk around it in 3D, always the latest version.'
                  : availability.reason}
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-[13px] text-ink-900">
            <input type="checkbox" className="mt-[3px]" checked={withViews} onChange={(e) => setWithViews(e.target.checked)} />
            <span>
              3D views and wall elevations
              <span className="block text-[11px] text-ink-500">Four sides, isometric, and every wall with its heights.</span>
            </span>
          </label>
          {!shared && (
            <label className="flex items-start gap-2 text-[13px] text-ink-900">
              <input type="checkbox" className="mt-[3px]" checked={withPrices} onChange={(e) => setWithPrices(e.target.checked)} />
              <span>
                Prices in the parts list
                <span className="block text-[11px] text-ink-500">
                  Unit and total prices (EUR). Leave off for a PDF that goes to partners.
                </span>
              </span>
            </label>
          )}
        </div>

        {error && <ErrorText>{error}</ErrorText>}

        <div className="flex items-center justify-end gap-2">
          {busy && (
            <span role="status" className="mr-auto text-[12px] text-ink-500">
              {busy}
            </span>
          )}
          <Button variant="ghost" onClick={close} disabled={!!busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={exportPdf} disabled={!!busy}>
            Export PDF
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
