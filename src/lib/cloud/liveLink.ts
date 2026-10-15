'use client';

import { usePlannerStore } from '@/store/plannerStore';
import { cloud, shareUrl } from './api';
import { saveNow } from './sync';

/** The share link opened straight in the 3D view. */
export const liveUrl = (token: string) => `${shareUrl(token)}&view=3d`;

/** Token of the shared view this page was opened from, if any. */
function currentShareToken(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('share');
}

/**
 * Whether the open plan can get a live link, and if not, why. Each cloud
 * plan has one link that every PDF of it reuses.
 */
export function liveLinkAvailability(signedIn: boolean): { ok: true } | { ok: false; reason: string } {
  const s = usePlannerStore.getState();
  if (s.shared) return currentShareToken() ? { ok: true } : { ok: false, reason: 'This shared view has no link.' };
  if (!s.cloud) return { ok: false, reason: 'Save the plan to the cloud to include a live link.' };
  if (!signedIn) return { ok: false, reason: 'Sign in to include the live link.' };
  if (s.cloud.role === 'viewer') return { ok: false, reason: 'Only the owner or an editor can create the live link.' };
  return { ok: true };
}

/**
 * The plan's live 3D link: the shared view's own link, or the cloud plan's
 * existing view-only link (the oldest, so every PDF of a shop carries the
 * same one), created on first use. Unsaved edits are saved first so the
 * link shows what the PDF shows.
 */
export async function getLiveLink(): Promise<string> {
  const s = usePlannerStore.getState();
  if (s.shared) {
    const token = currentShareToken();
    if (!token) throw new Error('This shared view has no link.');
    return liveUrl(token);
  }
  const link = s.cloud;
  if (!link || link.role === 'viewer') throw new Error('Only the owner or an editor can create the live link.');
  if (link.dirty) {
    await saveNow();
    const after = usePlannerStore.getState();
    if (after.cloudStatus === 'conflict' || after.cloudStatus === 'error') {
      throw new Error(after.cloudError ?? 'Save the plan before exporting with a live link.');
    }
  }
  const links = await cloud.listLinks(link.projectId);
  const oldest = [...links].sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
  return liveUrl(oldest?.token ?? (await cloud.createLink(link.projectId)));
}
