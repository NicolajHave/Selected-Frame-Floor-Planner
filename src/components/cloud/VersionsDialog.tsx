'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePlannerStore } from '@/store/plannerStore';
import { cloud, type CloudVersion } from '@/lib/cloud/api';
import { saveNow } from '@/lib/cloud/sync';
import { Dialog, ErrorText, inputClass } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { when } from './ProjectsDialog';

/** How many earlier versions the cloud keeps per plan. */
export const MAX_VERSIONS = 3;

/**
 * The plan's version history: up to three earlier versions, kept by hand
 * ("Save version") or automatically before each new working session.
 */
export function VersionsDialog({ email, onClose }: { email: string; onClose: () => void }) {
  const link = usePlannerStore((s) => s.cloud);
  const [list, setList] = useState<CloudVersion[] | null>(null);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restored, setRestored] = useState<string | null>(null);

  const projectId = link?.projectId;
  const canEdit = link?.role === 'owner' || link?.role === 'editor';

  const refresh = useCallback(async () => {
    if (!projectId) return;
    try {
      setList(await cloud.listVersions(projectId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the versions.');
    }
  }, [projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!projectId) return null;

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

  const full = (list?.length ?? 0) >= MAX_VERSIONS;
  const oldest = list?.length ? list[list.length - 1] : null;

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    void run('save', async () => {
      // The version is what is saved in the cloud, so save the latest edits first.
      if (usePlannerStore.getState().cloud?.dirty) await saveNow();
      const s = usePlannerStore.getState();
      if (s.cloudStatus === 'conflict' || s.cloudStatus === 'error') {
        throw new Error('Save the plan first (see the message at the top), then keep the version.');
      }
      setList(await cloud.saveVersion(projectId, label.trim()));
      setLabel('');
      setRestored(null);
    });
  };

  const restore = (v: CloudVersion) =>
    void run(`restore:${v.slot}`, async () => {
      if (
        !window.confirm(
          `Go back to the version from ${when(v.saved_at)}? The plan on screen is replaced by it for everyone — Undo (Ctrl+Z) brings the current plan back.`,
        )
      ) {
        return;
      }
      const full = await cloud.getVersion(projectId, v.slot);
      usePlannerStore.getState().restoreVersion(full.data, full.name);
      setRestored(title(v));
    });

  return (
    <Dialog title="Version history" onClose={onClose} width={540}>
      <div className="flex flex-col gap-4">
        <p className="text-[12px] leading-relaxed text-ink-700">
          The cloud keeps up to {MAX_VERSIONS} earlier versions of this plan. One is kept automatically when you start
          working on it again after a break; you can also keep one yourself, e.g. before trying another layout.
        </p>

        {canEdit && (
          <form onSubmit={save} className="flex items-end gap-2">
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-[11px] text-ink-500">Label (optional)</span>
              <input
                className={inputClass}
                value={label}
                maxLength={120}
                placeholder="e.g. Before moving the fitting rooms"
                onChange={(e) => setLabel(e.target.value)}
              />
            </label>
            <Button variant="primary" type="submit" disabled={busy === 'save' || !list}>
              {busy === 'save' ? 'Saving…' : 'Save version'}
            </Button>
          </form>
        )}
        {canEdit && full && oldest && (
          <p className="text-[11px] text-ink-500">
            All {MAX_VERSIONS} are in use: saving a version replaces the oldest ({when(oldest.saved_at)}).
          </p>
        )}

        {error && <ErrorText>{error}</ErrorText>}
        {restored && (
          <p role="status" className="text-[12px] text-sage-500">
            Restored “{restored}”. Undo (Ctrl+Z) takes you back.
          </p>
        )}

        {!list ? (
          <p className="text-[12px] text-ink-500">Loading…</p>
        ) : list.length === 0 ? (
          <p className="text-[12px] text-ink-500">No earlier versions yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-wall-200" data-testid="versions">
            {list.map((v) => (
              <li key={v.slot} className="flex items-center gap-3 py-2.5">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[13px] text-ink-900">{title(v)}</span>
                    <span className="rounded-[2px] bg-wall-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-ink-500">
                      {v.kind === 'auto' ? 'Automatic' : 'Saved'}
                    </span>
                  </span>
                  <span className="text-[11px] text-ink-500">
                    {when(v.saved_at)} by {v.saved_by_email === email ? 'you' : v.saved_by_email}
                  </span>
                </div>
                {canEdit && (
                  <Button variant="subtle" onClick={() => restore(v)} disabled={!!busy}>
                    {busy === `restore:${v.slot}` ? 'Restoring…' : 'Restore'}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  );
}

function title(v: CloudVersion): string {
  if (v.label) return v.label;
  return v.kind === 'auto' ? `${v.name} — before the next session` : v.name;
}
