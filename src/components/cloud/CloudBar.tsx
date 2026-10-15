'use client';

import { useState } from 'react';
import { clsx } from 'clsx';
import { usePlannerStore } from '@/store/plannerStore';
import { CLOUD_ENABLED } from '@/lib/cloud/config';
import { auth } from '@/lib/cloud/api';
import { saveNow } from '@/lib/cloud/sync';
import type { CloudUser } from '@/lib/cloud/useCloudUser';
import { Button } from '../ui/Button';
import { SignInDialog } from './SignInDialog';
import { ProjectsDialog } from './ProjectsDialog';
import { ShareDialog } from './ShareDialog';

const time = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' }) : '';

/** Whether the open plan is saved in the cloud, shown next to its name. */
export function CloudStatus({ user, ready }: { user: CloudUser | null; ready: boolean }) {
  const link = usePlannerStore((s) => s.cloud);
  const status = usePlannerStore((s) => s.cloudStatus);
  const shared = usePlannerStore((s) => s.shared);
  if (!CLOUD_ENABLED || shared || !ready || !link) return null;

  let text: string;
  let tone: 'muted' | 'ok' | 'warn' | 'error';
  if (!user) [text, tone] = ['Sign in to sync', 'warn'];
  else if (link.role === 'viewer') [text, tone] = ['View only', 'muted'];
  else if (status === 'saving') [text, tone] = ['Saving…', 'muted'];
  else if (status === 'conflict') [text, tone] = ['Conflict', 'error'];
  else if (status === 'error') [text, tone] = ['Not saved', 'error'];
  else if (link.dirty) [text, tone] = ['Unsaved changes', 'warn'];
  else [text, tone] = [`Saved ${time(link.lastSavedAt)}`, 'ok'];

  return (
    <span
      data-testid="cloud-status"
      title="Cloud sync"
      className={clsx(
        'whitespace-nowrap text-[11px]',
        tone === 'muted' && 'text-ink-500',
        tone === 'ok' && 'text-sage-500',
        tone === 'warn' && 'text-amber-700',
        tone === 'error' && 'text-red-700',
      )}
    >
      {text}
      {status === 'error' && user && (
        <button className="ml-1 underline" onClick={() => void saveNow()}>
          Retry
        </button>
      )}
    </span>
  );
}

/** Cloud plans, sharing and the account menu, for the right end of the top bar. */
export function CloudActions({ user, ready }: { user: CloudUser | null; ready: boolean }) {
  const link = usePlannerStore((s) => s.cloud);
  const shared = usePlannerStore((s) => s.shared);
  const [dialog, setDialog] = useState<'sign-in' | 'projects' | 'share' | null>(null);
  const [menu, setMenu] = useState(false);

  if (!CLOUD_ENABLED || shared || !ready) return null;

  return (
    <div className="flex items-center gap-1" data-testid="cloud-bar">
      {user ? (
        <>
          <Button variant="ghost" onClick={() => setDialog('projects')} title="Plans saved in the cloud">
            Cloud
          </Button>
          {link && (
            <Button variant="ghost" onClick={() => setDialog('share')} title="Invite colleagues or create a view-only link">
              Share
            </Button>
          )}
          <div className="relative">
            <button
              onClick={() => setMenu((m) => !m)}
              title={user.email}
              aria-label="Account"
              className="ml-1 flex h-7 w-7 items-center justify-center rounded-full bg-ink-900 text-[10px] font-medium uppercase text-wall-50"
            >
              {user.email.slice(0, 2)}
            </button>
            {menu && (
              <div className="absolute right-0 top-9 z-40 w-56 rounded-[2px] border border-wall-200 bg-wall-50 p-3 shadow-panel">
                <p className="truncate text-[12px] text-ink-900">{user.email}</p>
                <button
                  className="mt-2 text-[12px] text-ink-700 hover:underline"
                  onClick={() => {
                    setMenu(false);
                    void auth.signOut();
                  }}
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </>
      ) : (
        <Button variant="primary" onClick={() => setDialog('sign-in')} title="Save plans in the cloud and share them">
          Sign in
        </Button>
      )}

      {dialog === 'sign-in' && <SignInDialog onClose={() => setDialog(null)} />}
      {dialog === 'projects' && user && <ProjectsDialog user={user} onClose={() => setDialog(null)} />}
      {dialog === 'share' && <ShareDialog onClose={() => setDialog(null)} />}
    </div>
  );
}
