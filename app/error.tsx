'use client';

import { useEffect, useState } from 'react';

const AUTOSAVE_KEY = 'sf-planner:project';
const CRASHED_KEY = 'sf-planner:project:crashed';

/**
 * The plan's drawing is kept outside the autosave, in IndexedDB (see
 * lib/assets.ts). Read here on its own, without any of the app's code, so
 * the backup is whole even if that code is what crashed. Never throws.
 */
function readDrawing(id: string): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const open = window.indexedDB.open('sf-planner-assets');
      open.onerror = () => resolve(null);
      open.onupgradeneeded = () => open.transaction?.abort(); // no such store here: leave it uncreated
      open.onsuccess = () => {
        try {
          const req = open.result.transaction('images', 'readonly').objectStore('images').get(id);
          req.onsuccess = () => resolve((req.result as { url?: string } | undefined)?.url ?? null);
          req.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      };
    } catch {
      resolve(null);
    }
  });
}

/** The backup as text: the autosaved plan with its drawing put back in. */
async function backupText(json: string): Promise<string> {
  try {
    const project = JSON.parse(json) as { underlay?: { src?: string } | null };
    const src = project.underlay?.src;
    if (project.underlay && typeof src === 'string' && src.startsWith('asset:')) {
      const picture = await readDrawing(src.slice('asset:'.length));
      if (picture) {
        project.underlay.src = picture;
        return JSON.stringify(project, null, 2);
      }
    }
  } catch {
    // Fall through to the plan as it was stored.
  }
  return json;
}

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
  const [reported, setReported] = useState(false);

  useEffect(() => {
    console.error(error);
    setSaved(readAutosave());
    // Tell the people who look after the planner. Loaded here and not at the
    // top, so this screen still shows if that code is part of what broke.
    let gone = false;
    import('@/lib/monitor')
      .then((m) => m.reportError('screen', error))
      .then((sent) => !gone && setReported(sent))
      .catch(() => {});
    return () => {
      gone = true;
    };
  }, [error]);

  const download = async () => {
    if (!saved) return;
    const url = URL.createObjectURL(new Blob([await backupText(saved.json)], { type: 'application/json' }));
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
              onClick={() => void download()}
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
        {reported && (
          <p role="status" className="mt-6 text-[11px] leading-relaxed text-ink-500">
            The error has been reported, without your plan, so it can be fixed.
          </p>
        )}
        <p className={`${reported ? 'mt-2' : 'mt-6'} break-words font-mono text-[10px] leading-relaxed text-ink-500`}>
          {error.message || 'Unknown error'}
          {error.digest ? ` · ${error.digest}` : ''}
        </p>
      </div>
    </main>
  );
}
