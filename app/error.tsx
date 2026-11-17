'use client';

import { useEffect, useState } from 'react';

const AUTOSAVE_KEY = 'sf-planner:project';
const CRASHED_KEY = 'sf-planner:project:crashed';

/** The autosaved plan exactly as stored, or null. Never throws. */
function readAutosave(): { name: string; json: string } | null {
  try {
    window.__sfFlushAutosave?.();
    const raw = window.localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return null;
    const project = (JSON.parse(raw) as { state?: { project?: { name?: unknown } } })?.state?.project;
    if (!project) return null;
    const name = typeof project.name === 'string' && project.name.trim() ? project.name.trim() : 'plan';
    return { name, json: JSON.stringify(project, null, 2) };
  } catch {
    return null;
  }
}

/**
 * Shown instead of a blank page when the planner crashes while drawing the
 * plan. The plan is still in this browser: it can be downloaded, and the
 * planner can be started empty if the plan itself is what breaks it.
 */
export default function PlannerError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [saved, setSaved] = useState<{ name: string; json: string } | null>(null);

  useEffect(() => {
    console.error(error);
    setSaved(readAutosave());
  }, [error]);

  const download = () => {
    if (!saved) return;
    const url = URL.createObjectURL(new Blob([saved.json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${saved.name}.backup.sf.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const startEmpty = () => {
    try {
      // Kept aside rather than deleted, so nothing is lost by this click.
      const raw = window.localStorage.getItem(AUTOSAVE_KEY);
      if (raw) window.localStorage.setItem(CRASHED_KEY, raw);
      window.localStorage.removeItem(AUTOSAVE_KEY);
    } catch {
      // Storage unavailable: reloading is still the best next step.
    }
    window.location.assign(window.location.pathname);
  };

  return (
    <main role="alert" data-testid="planner-error" className="flex min-h-screen items-center justify-center bg-wall-50 p-6">
      <div className="w-full max-w-[520px] rounded-[2px] border border-wall-200 bg-white p-8 shadow-panel">
        <p className="text-[11px] uppercase tracking-[0.18em] text-ink-500">Selected Frame · Shop Planner</p>
        <h1 className="mt-3 font-display text-[26px] italic leading-tight text-ink-900">Something went wrong</h1>
        <p className="mt-3 text-[13px] leading-relaxed text-ink-700">
          The planner hit an error and could not show the plan.{' '}
          {saved
            ? 'Your plan is still saved in this browser — download a backup first, then try again.'
            : 'Try again; if it keeps happening, reload the page.'}
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <button type="button" onClick={reset} className="h-9 rounded-[2px] bg-ink-900 px-4 text-[12px] font-medium text-wall-50">
            Try again
          </button>
          {saved && (
            <button
              type="button"
              onClick={download}
              className="h-9 rounded-[2px] border border-ink-900 px-4 text-[12px] font-medium text-ink-900"
            >
              Download backup
            </button>
          )}
          {saved && (
            <button
              type="button"
              onClick={startEmpty}
              title="Opens the planner without the saved plan. The plan is kept aside in this browser and in your backup."
              className="h-9 rounded-[2px] border border-wall-200 px-4 text-[12px] font-medium text-ink-700 hover:border-ink-900"
            >
              Start with an empty plan
            </button>
          )}
        </div>
        <p className="mt-6 break-words font-mono text-[10px] leading-relaxed text-ink-500">
          {error.message || 'Unknown error'}
          {error.digest ? ` · ${error.digest}` : ''}
        </p>
      </div>
    </main>
  );
}
