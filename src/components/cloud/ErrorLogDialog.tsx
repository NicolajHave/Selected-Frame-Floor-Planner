'use client';

import { useEffect, useState } from 'react';
import { cloud, type CloudError } from '@/lib/cloud/api';
import { errorText, kindOf, situationOf, trailOf, whoText } from '@/lib/errorLog';
import { APP_VERSION } from '@/lib/monitor';
import { Dialog, ErrorText } from '../ui/Dialog';
import { Button } from '../ui/Button';

const when = (iso: string) =>
  new Date(iso).toLocaleString('da-DK', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/**
 * What has gone wrong in people's browsers (see lib/monitor.ts): one line
 * for each error, however often it happened, the latest first. An error is
 * cleared when it has been dealt with; if it happens again it is back.
 */
export function ErrorLogDialog({ onClose }: { onClose: () => void }) {
  const [errors, setErrors] = useState<CloudError[] | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [copied, setCopied] = useState<number | 'all' | null>(null);
  const [sure, setSure] = useState(false);

  const refresh = () =>
    cloud
      .listErrors()
      .then((list) => {
        setErrors(list);
        setFailure(null);
      })
      .catch((e: unknown) => {
        // A database from before the error log: say so plainly rather than show its error.
        const code = (e as { code?: unknown } | null)?.code;
        const text = e instanceof Error ? e.message : '';
        const notThere = code === 'PGRST202' || code === '42883' || /could not find the function|unknown function/i.test(text);
        setFailure(notThere ? 'The error log is not switched on in the database yet. Nothing is being recorded.' : text || 'Could not load the error log.');
      });
  useEffect(() => {
    void refresh();
  }, []);

  const copy = async (what: number | 'all', text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      window.setTimeout(() => setCopied((c) => (c === what ? null : c)), 2000);
    } catch {
      setFailure('Could not copy. Open the details and select the text instead.');
    }
  };

  const clear = async (id?: number) => {
    try {
      await cloud.clearErrors(id);
      await refresh();
    } catch (e) {
      setFailure(e instanceof Error ? e.message : 'Could not clear the error.');
    }
  };

  return (
    <Dialog title="Error log" onClose={onClose} width={760}>
      <div className="flex flex-col gap-4">
        <p className="text-[12px] leading-relaxed text-ink-700">
          What has gone wrong for people using the planner, the latest first. Each line is one error, however many times
          it has happened. A report says what failed and what was being done — never the plan, a name or an address.
          Clear an error when it has been dealt with; if it happens again, it is back.
        </p>

        {failure && <ErrorText>{failure}</ErrorText>}
        {errors === null && !failure && <p className="text-[12px] text-ink-500">Loading…</p>}
        {errors?.length === 0 && (
          <p role="status" className="rounded-[2px] border border-wall-200 bg-wall-100 px-3 py-3 text-[12px] text-ink-700">
            No errors have been reported.
          </p>
        )}

        {errors && errors.length > 0 && (
          <ul className="flex flex-col divide-y divide-wall-200 rounded-[2px] border border-wall-200" data-testid="error-log">
            {errors.map((e) => {
              const shown = open === e.id;
              const trail = trailOf(e);
              return (
                <li key={e.id} className="flex flex-col gap-1.5 px-3 py-2.5">
                  <div className="flex items-start gap-3">
                    <span
                      title={kindOf(e).meaning}
                      className={`mt-[1px] shrink-0 rounded-[2px] px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-widest2 ${
                        e.kind === 'screen' || e.kind === 'save' ? 'bg-red-700 text-wall-50' : 'bg-wall-200 text-ink-700'
                      }`}
                    >
                      {kindOf(e).label}
                    </span>
                    <span className="min-w-0 flex-1 break-words font-mono text-[11px] leading-snug text-ink-900">{e.message}</span>
                    <span className="shrink-0 font-mono text-[12px] text-ink-900" title={whoText(e)}>
                      ×{e.hits}
                    </span>
                  </div>
                  <p className="text-[11px] leading-snug text-ink-500">
                    {whoText(e)} · last {when(e.last_seen)} · first {when(e.first_seen)} · version {e.version || 'unknown'}
                    {e.version && e.version !== APP_VERSION ? ' (not the version open here)' : ''}
                  </p>
                  {shown && (
                    <div className="mt-1 flex flex-col gap-2 rounded-[2px] bg-wall-100 px-3 py-2 text-[11px] leading-relaxed text-ink-700">
                      {trail.length > 0 && (
                        <p>
                          <span className="text-ink-500">The last things done: </span>
                          {trail.join(' → ')}
                        </p>
                      )}
                      {situationOf(e) && (
                        <p>
                          <span className="text-ink-500">Situation: </span>
                          {situationOf(e)}
                        </p>
                      )}
                      {typeof e.context?.browser === 'string' && (
                        <p className="break-words">
                          <span className="text-ink-500">Browser: </span>
                          {e.context.browser}
                        </p>
                      )}
                      <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all font-mono text-[10px] leading-snug text-ink-700">
                        {e.stack || 'No place in the code was recorded.'}
                      </pre>
                    </div>
                  )}
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" className="!px-2" aria-expanded={shown} onClick={() => setOpen(shown ? null : e.id)}>
                      {shown ? 'Hide details' : 'Details'}
                    </Button>
                    <Button
                      variant="ghost"
                      className="!px-2"
                      onClick={() => void copy(e.id, errorText(e))}
                      title="Everything about this error as text, to hand to whoever fixes it"
                    >
                      {copied === e.id ? 'Copied' : 'Copy'}
                    </Button>
                    <span className="flex-1" />
                    <Button variant="ghost" className="!px-2" onClick={() => void clear(e.id)} title="It has been dealt with: take it off the list">
                      Clear
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {errors && errors.length > 0 && (
          <div className="flex items-center gap-2">
            <Button variant="subtle" onClick={() => void copy('all', errors.map(errorText).join('\n\n———\n\n'))}>
              {copied === 'all' ? 'Copied' : 'Copy all'}
            </Button>
            <span className="flex-1" />
            {sure ? (
              <>
                <span className="text-[12px] text-ink-700">Clear all {errors.length}?</span>
                <Button
                  variant="subtle"
                  onClick={() => {
                    setSure(false);
                    void clear();
                  }}
                >
                  Yes, clear all
                </Button>
                <Button variant="ghost" onClick={() => setSure(false)}>
                  Keep them
                </Button>
              </>
            ) : (
              <Button variant="ghost" onClick={() => setSure(true)} title="Take every error off the list">
                Clear all
              </Button>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}
