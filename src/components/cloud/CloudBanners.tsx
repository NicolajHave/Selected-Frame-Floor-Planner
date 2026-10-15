'use client';

import { usePlannerStore } from '@/store/plannerStore';
import { keepMine, saveAsCopy, takeTheirs } from '@/lib/cloud/sync';
import type { CloudUser } from '@/lib/cloud/useCloudUser';
import { when } from './ProjectsDialog';

/** Conflicts, read-only notices and the shared-link header, over the canvas. */
export function CloudBanners({ user }: { user: CloudUser | null }) {
  const conflict = usePlannerStore((s) => s.cloudConflict);
  const error = usePlannerStore((s) => s.cloudError);
  const status = usePlannerStore((s) => s.cloudStatus);
  const shared = usePlannerStore((s) => s.shared);
  const link = usePlannerStore((s) => s.cloud);

  let body: React.ReactNode = null;
  let tone: 'info' | 'warning' | 'error' = 'info';

  if (shared) {
    body = (
      <>
        <span>
          <b className="font-medium">{shared.name}</b> · shared by {shared.ownerEmail} · updated {when(shared.updatedAt)} ·
          view only
        </span>
        <a href="/" className="underline">Open your own planner</a>
      </>
    );
  } else if (conflict) {
    tone = 'error';
    body = (
      <>
        <span>
          {conflict.updatedByEmail === user?.email ? 'You' : conflict.updatedByEmail} saved a newer version at{' '}
          {when(conflict.updatedAt)}, while you had unsaved changes.
        </span>
        <button className="underline" onClick={() => void takeTheirs()}>Load theirs</button>
        <button className="underline" onClick={() => void keepMine()}>Keep mine</button>
        {user && (
          <button className="underline" onClick={() => void saveAsCopy(user.email)}>
            Save mine as a copy
          </button>
        )}
      </>
    );
  } else if (status === 'error' && error) {
    tone = 'error';
    body = <span>Not saved to the cloud: {error}</span>;
  } else if (link?.role === 'viewer') {
    tone = 'warning';
    body = <span>You can view this plan but not change it. Ask {link.ownerEmail || 'the owner'} for edit access.</span>;
  }

  if (!body) return null;
  const colors =
    tone === 'error'
      ? 'border-red-200 bg-red-50 text-red-900'
      : tone === 'warning'
        ? 'border-amber-300 bg-amber-50 text-amber-950'
        : 'border-wall-200 bg-wall-50 text-ink-900';

  return (
    <div className="pointer-events-none absolute inset-x-0 top-14 z-10 flex justify-center px-4">
      <div
        role="status"
        data-testid="cloud-banner"
        className={`pointer-events-auto flex max-w-[760px] flex-wrap items-center gap-x-3 gap-y-1 rounded-[2px] border px-4 py-2 text-[12px] shadow-panel ${colors}`}
      >
        {body}
      </div>
    </div>
  );
}
