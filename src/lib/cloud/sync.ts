'use client';

import { useEffect } from 'react';
import { usePlannerStore } from '@/store/plannerStore';
import { cloud } from './api';
import type { CloudUser } from './useCloudUser';

/** Pause after the last edit before saving to the cloud. */
const SAVE_DELAY_MS = 1500;

const store = () => usePlannerStore.getState();
const message = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');

/** Saves the open plan to its cloud project now. */
export async function saveNow(): Promise<void> {
  const link = store().cloud;
  if (!link || link.role === 'viewer') return;
  const snapshot = store().project;
  store().setCloudStatus('saving');
  try {
    const r = await cloud.saveProject(link.projectId, link.version, snapshot.name, snapshot);
    if (store().cloud?.projectId !== link.projectId) return; // another plan was opened meanwhile
    if (r.ok) store().markSynced(r, snapshot);
    else store().setCloudConflict({ version: r.version, updatedAt: r.updated_at, updatedByEmail: r.updated_by_email });
  } catch (e) {
    store().setCloudStatus('error', message(e));
  }
}

/** Compare with the cloud copy: take a newer version if we have no unsaved edits. */
export async function checkRemote(): Promise<void> {
  const link = store().cloud;
  if (!link) return;
  try {
    const remote = await cloud.getProject(link.projectId);
    const current = store().cloud;
    if (current?.projectId !== link.projectId) return;
    if (remote.version !== current.version) {
      if (current.dirty) {
        store().setCloudConflict({
          version: remote.version,
          updatedAt: remote.updated_at,
          updatedByEmail: remote.updated_by_email,
        });
      } else {
        store().openCloudProject(remote);
      }
    } else if (remote.role !== current.role) {
      usePlannerStore.setState((s) => {
        if (s.cloud) s.cloud.role = remote.role;
        s.readOnly = remote.role === 'viewer';
      });
    }
  } catch (e) {
    store().setCloudStatus('error', message(e));
  }
}

// --- resolving a conflict --------------------------------------------------

/** Discard local edits and load the newer cloud version. */
export async function takeTheirs(): Promise<void> {
  const link = store().cloud;
  if (!link) return;
  try {
    store().openCloudProject(await cloud.getProject(link.projectId));
  } catch (e) {
    store().setCloudStatus('error', message(e));
  }
}

/** Overwrite the newer cloud version with ours. */
export async function keepMine(): Promise<void> {
  const conflict = store().cloudConflict;
  if (!conflict) return;
  usePlannerStore.setState((s) => {
    if (s.cloud) s.cloud.version = conflict.version;
    s.cloudConflict = null;
  });
  await saveNow();
}

/** Keep both: save ours as a new cloud project and switch to it. */
export async function saveAsCopy(ownerEmail: string): Promise<void> {
  const project = store().project;
  try {
    const created = await cloud.createProject(`${project.name} (copy)`, project);
    usePlannerStore.setState((s) => {
      s.project.name = `${project.name} (copy)`;
    });
    store().linkCloud({
      projectId: created.id,
      version: created.version,
      role: 'owner',
      ownerEmail,
      lastSavedAt: created.updated_at,
    });
  } catch (e) {
    store().setCloudStatus('error', message(e));
  }
}

/** Keeps the open plan and its cloud project in step while signed in. */
export function useCloudSync(user: CloudUser | null, active: boolean) {
  const link = usePlannerStore((s) => s.cloud);
  const project = usePlannerStore((s) => s.project);
  const status = usePlannerStore((s) => s.cloudStatus);
  const projectId = link?.projectId;

  // When we sign in or switch plans, catch up with the cloud.
  useEffect(() => {
    if (active && user && projectId) void checkRemote();
  }, [active, user, projectId]);

  // Save a moment after the last edit.
  useEffect(() => {
    if (!active || !user || !link?.dirty || link.role === 'viewer') return;
    if (status === 'saving' || status === 'conflict') return;
    const t = window.setTimeout(() => void saveNow(), SAVE_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [active, user, link, project, status]);
}
