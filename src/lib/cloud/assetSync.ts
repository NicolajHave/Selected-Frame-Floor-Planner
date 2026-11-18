'use client';

import { useEffect } from 'react';
import { usePlannerStore } from '@/store/plannerStore';
import type { Project } from '@/model/project';
import { assetIdOf, ensureAsset, inlineProject, isAssetRef, resolveSrc, useAssets } from '@/lib/assets';
import { cloud } from './api';
import type { CloudUser } from './useCloudUser';

/**
 * A cloud plan's drawing is stored once next to the plan (fp_project_assets)
 * and the plan only refers to it, so a save sends the plan without the
 * megabyte of picture and saved versions do not carry copies of it.
 */

/** `${projectId}:${assetId}` of drawings known to be in the cloud. */
const inCloud = new Set<string>();
/** The database has no asset functions (before that change is applied): the drawing stays in the plan. */
let unsupported = false;

const missingFunction = (e: unknown): boolean => {
  const code = (e as { code?: string } | null)?.code;
  const text = e instanceof Error ? e.message : '';
  return code === 'PGRST202' || code === '42883' || /could not find the function|unknown function/i.test(text);
};

/**
 * The plan as it goes to its cloud project: the drawing is uploaded first if
 * the cloud does not have it, and then only referenced. A plan never goes
 * up referring to a drawing that is not there: if the upload fails the save
 * fails, and without the asset functions the drawing is sent inline, as
 * plans used to be.
 */
export async function cloudProject(projectId: string, project: Project): Promise<Project> {
  const src = project.underlay?.src;
  if (!isAssetRef(src)) return project;
  if (unsupported) return inlineProject(project);
  const id = assetIdOf(src);
  const key = `${projectId}:${id}`;
  if (inCloud.has(key)) return project;
  try {
    if (!(await cloud.hasAsset(projectId, id))) {
      const url = resolveSrc(src);
      // Not here either (it never reached this device): the reference is all there is to save.
      if (!url) return project;
      await cloud.putAsset(projectId, id, url);
    }
    inCloud.add(key);
    return project;
  } catch (e) {
    if (!missingFunction(e)) throw e;
    unsupported = true;
    return inlineProject(project);
  }
}

/**
 * Brings the open plan's drawing into memory when the plan only refers to
 * it: from this browser's store, else from the plan's cloud project or the
 * view-only link it was opened through.
 */
export function useUnderlayAsset(user: CloudUser | null, shareToken: string | null) {
  const src = usePlannerStore((s) => s.project.underlay?.src);
  const projectId = usePlannerStore((s) => s.cloud?.projectId ?? null);
  const id = isAssetRef(src) ? assetIdOf(src) : null;
  const have = useAssets((s) => (id ? !!s.urls[id] : true));
  const email = user?.email ?? null;

  useEffect(() => {
    if (!id || have) return;
    const remote = shareToken
      ? () => cloud.getSharedAsset(shareToken, id)
      : email && projectId
        ? () => cloud.getAsset(projectId, id)
        : undefined;
    void ensureAsset(id, remote).then((ok) => {
      if (ok && projectId && !shareToken) inCloud.add(`${projectId}:${id}`);
    });
  }, [id, have, email, projectId, shareToken]);
}
