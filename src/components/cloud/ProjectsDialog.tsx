'use client';

import { useCallback, useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { usePlannerStore } from '@/store/plannerStore';
import { cloud, type CloudProjectSummary, type CloudRole } from '@/lib/cloud/api';
import type { CloudUser } from '@/lib/cloud/useCloudUser';
import { Dialog, ErrorText } from '../ui/Dialog';
import { Button } from '../ui/Button';

export const when = (iso: string) =>
  new Date(iso).toLocaleString('da-DK', { dateStyle: 'short', timeStyle: 'short' });

const ROLE_LABEL: Record<CloudRole, string> = { owner: 'Owner', editor: 'Can edit', viewer: 'View only' };

export function RoleBadge({ role }: { role: CloudRole }) {
  return (
    <span
      className={clsx(
        'rounded-[2px] px-1.5 py-px text-[9px] font-medium uppercase tracking-widest2',
        role === 'owner' && 'bg-ink-900 text-wall-50',
        role === 'editor' && 'bg-sage-100 text-ink-900',
        role === 'viewer' && 'bg-wall-200 text-ink-700',
      )}
    >
      {ROLE_LABEL[role]}
    </span>
  );
}

export function ProjectsDialog({ user, onClose }: { user: CloudUser; onClose: () => void }) {
  const link = usePlannerStore((s) => s.cloud);
  const projectName = usePlannerStore((s) => s.project.name);
  const [list, setList] = useState<CloudProjectSummary[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setList(await cloud.listProjects());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your plans.');
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

  const saveToCloud = () =>
    run('save', async () => {
      const { project } = usePlannerStore.getState();
      const created = await cloud.createProject(project.name, project);
      usePlannerStore.getState().linkCloud({
        projectId: created.id,
        version: created.version,
        role: 'owner',
        ownerEmail: user.email,
        lastSavedAt: created.updated_at,
      });
      await refresh();
    });

  const open = (p: CloudProjectSummary) =>
    run(`open:${p.id}`, async () => {
      const s = usePlannerStore.getState();
      const hasLocalWork = s.cloud ? s.cloud.dirty : s.project.inventory.length > 0 || !!s.project.room;
      if (
        hasLocalWork &&
        !window.confirm(
          s.cloud
            ? 'The plan on screen has changes that are not saved to the cloud yet. Open another plan anyway?'
            : 'The plan on screen is only saved in this browser. Open the cloud plan instead? (Use Save to keep a file copy first.)',
        )
      ) {
        return;
      }
      usePlannerStore.getState().openCloudProject(await cloud.getProject(p.id));
      onClose();
    });

  const remove = (p: CloudProjectSummary) =>
    run(`delete:${p.id}`, async () => {
      if (!window.confirm(`Delete "${p.name}" for everyone it is shared with? This cannot be undone.`)) return;
      await cloud.deleteProject(p.id);
      if (usePlannerStore.getState().cloud?.projectId === p.id) usePlannerStore.getState().unlinkCloud();
      await refresh();
    });

  return (
    <Dialog title="Cloud plans" onClose={onClose} width={560}>
      <div className="flex flex-col gap-5">
        <section className="flex items-center justify-between gap-3 rounded-[2px] border border-wall-200 bg-wall-100 px-3 py-2.5">
          {link ? (
            <>
              <span className="text-[12px] text-ink-700">
                <b className="font-medium text-ink-900">{projectName}</b> is saved in the cloud and syncs automatically.
              </span>
              <Button variant="ghost" onClick={() => usePlannerStore.getState().unlinkCloud()} title="Keep working on a local copy">
                Stop syncing
              </Button>
            </>
          ) : (
            <>
              <span className="text-[12px] text-ink-700">
                <b className="font-medium text-ink-900">{projectName}</b> is only saved in this browser.
              </span>
              <Button variant="primary" onClick={saveToCloud} disabled={busy === 'save'}>
                {busy === 'save' ? 'Saving…' : 'Save to cloud'}
              </Button>
            </>
          )}
        </section>

        {error && <ErrorText>{error}</ErrorText>}

        <section>
          <h3 className="mb-2 text-[10px] font-medium uppercase tracking-widest2 text-ink-500">Your plans and plans shared with you</h3>
          {!list ? (
            <p className="text-[12px] text-ink-500">Loading…</p>
          ) : list.length === 0 ? (
            <p className="text-[12px] text-ink-500">No cloud plans yet.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-wall-200" data-testid="cloud-projects">
              {list.map((p) => {
                const current = link?.projectId === p.id;
                return (
                  <li key={p.id} className="flex items-center gap-3 py-2.5">
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-[13px] text-ink-900">{p.name}</span>
                        <RoleBadge role={p.role} />
                        {current && <span className="text-[10px] text-ink-500">open now</span>}
                      </span>
                      <span className="text-[11px] text-ink-500">
                        {p.role !== 'owner' && `${p.owner_email} · `}
                        Updated {when(p.updated_at)} by {p.updated_by_email === user.email ? 'you' : p.updated_by_email}
                      </span>
                    </div>
                    {!current && (
                      <Button variant="subtle" onClick={() => open(p)} disabled={busy === `open:${p.id}`}>
                        Open
                      </Button>
                    )}
                    {p.role === 'owner' && (
                      <Button variant="danger" onClick={() => remove(p)} disabled={busy === `delete:${p.id}`} title={`Delete ${p.name}`}>
                        Delete
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </Dialog>
  );
}
