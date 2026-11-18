'use client';

import type { Project } from '@/model/project';
import { supabase } from './client';
import { ALLOWED_DOMAIN } from './config';

export type CloudRole = 'owner' | 'editor' | 'viewer';

export interface CloudProjectSummary {
  id: string;
  name: string;
  owner_email: string;
  version: number;
  updated_at: string;
  updated_by_email: string;
  role: CloudRole;
}

export interface CloudProject extends CloudProjectSummary {
  data: Project;
}

export interface SaveResult {
  ok: boolean;
  version: number;
  updated_at: string;
  updated_by_email: string;
}

export interface Members {
  owner_email: string;
  members: { email: string; role: 'editor' | 'viewer' }[];
}

export interface ShareLink {
  token: string;
  created_at: string;
  created_by_email: string;
  /** When the link stops working (30 days after it was made or renewed). */
  expires_at?: string;
}

/** A saved price list (see lib/cloud/priceList.ts). */
export interface CloudPriceList {
  id: number;
  name: string;
  /** The day the prices are from, YYYY-MM-DD. */
  valid_from: string;
  prices: Record<string, number | null>;
  saved_by_email: string;
  saved_at: string;
}

export interface CloudVersion {
  slot: number;
  kind: 'auto' | 'manual';
  label: string | null;
  name: string;
  source_version: number;
  saved_at: string;
  saved_by_email: string;
}

export interface CloudVersionData extends CloudVersion {
  data: Project;
}

export interface SharedProject {
  /** Set instead of the plan when the link is past its 30 days. */
  expired?: boolean;
  name: string;
  data: Project;
  updated_at: string;
  owner_email: string;
}

/** Calls one of the fp_* database functions; errors become readable Errors. */
async function call<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await (await supabase()).rpc(fn, args);
  // The code tells a missing function (an older database) from a refusal.
  if (error) throw Object.assign(new Error(error.message || 'The cloud request failed.'), { code: error.code });
  return data as T;
}

export const cloud = {
  listProjects: () => call<CloudProjectSummary[]>('fp_list_projects'),
  getProject: (id: string) => call<CloudProject>('fp_get_project', { p_id: id }),
  createProject: (name: string, data: Project) =>
    call<{ id: string; version: number; updated_at: string; role: CloudRole }>('fp_create_project', {
      p_name: name,
      p_data: data,
    }),
  saveProject: (id: string, version: number, name: string, data: Project) =>
    call<SaveResult>('fp_save_project', { p_id: id, p_version: version, p_name: name, p_data: data }),
  deleteProject: (id: string) => call<void>('fp_delete_project', { p_id: id }),

  listVersions: (id: string) => call<CloudVersion[]>('fp_list_versions', { p_id: id }),
  getVersion: (id: string, slot: number) => call<CloudVersionData>('fp_get_version', { p_id: id, p_slot: slot }),
  saveVersion: (id: string, label: string) => call<CloudVersion[]>('fp_save_version', { p_id: id, p_label: label }),

  listMembers: (id: string) => call<Members>('fp_list_members', { p_id: id }),
  setMember: (id: string, email: string, role: 'editor' | 'viewer') =>
    call<void>('fp_set_member', { p_id: id, p_email: email, p_role: role }),
  removeMember: (id: string, email: string) => call<void>('fp_remove_member', { p_id: id, p_email: email }),

  listLinks: (id: string) => call<ShareLink[]>('fp_list_links', { p_id: id }),
  createLink: (id: string) => call<string>('fp_create_link', { p_id: id }),
  revokeLink: (token: string) => call<void>('fp_revoke_link', { p_token: token }),
  /** Gives the link 30 more days from now; returns the new expiry. */
  renewLink: (token: string) => call<string>('fp_renew_link', { p_token: token }),
  getShared: (token: string) => call<SharedProject | null>('fp_get_shared_project', { p_token: token }),

  // The price list in use, and the ones before it (see priceList.ts).
  getPriceList: () => call<CloudPriceList | null>('fp_get_price_list'),
  listPriceLists: () => call<CloudPriceList[]>('fp_list_price_lists'),
  savePriceList: (name: string, validFrom: string, prices: Record<string, number | null>) =>
    call<CloudPriceList>('fp_save_price_list', { p_name: name, p_valid_from: validFrom, p_prices: prices }),

  // The plan drawing, kept next to the plan rather than in it (see assetSync.ts).
  hasAsset: (id: string, asset: string) => call<boolean>('fp_has_asset', { p_id: id, p_asset: asset }),
  putAsset: (id: string, asset: string, data: string) => call<void>('fp_put_asset', { p_id: id, p_asset: asset, p_data: data }),
  getAsset: (id: string, asset: string) => call<string | null>('fp_get_asset', { p_id: id, p_asset: asset }),
  getSharedAsset: (token: string, asset: string) =>
    call<string | null>('fp_get_shared_asset', { p_token: token, p_asset: asset }),
};

export function isAllowedEmail(email: string): boolean {
  return email.trim().toLowerCase().endsWith(`@${ALLOWED_DOMAIN}`);
}

export function shareUrl(token: string): string {
  return `${window.location.origin}/?share=${encodeURIComponent(token)}`;
}

export const auth = {
  signIn: async (email: string, password: string) => {
    const { error } = await (await supabase()).auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw new Error(error.message);
  },
  signUp: async (email: string, password: string) => {
    if (!isAllowedEmail(email)) throw new Error(`Use your @${ALLOWED_DOMAIN} address.`);
    const { data, error } = await (await supabase()).auth.signUp({
      email: email.trim(),
      password,
      options: { data: { app: 'floor-planner' }, emailRedirectTo: window.location.origin },
    });
    if (error) throw new Error(error.message);
    return { needsConfirmation: !data.session };
  },
  resetPassword: async (email: string) => {
    const { error } = await (await supabase()).auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin,
    });
    if (error) throw new Error(error.message);
  },
  signOut: async () => {
    await (await supabase()).auth.signOut();
  },
};
