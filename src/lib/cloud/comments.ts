'use client';

import { create } from 'zustand';
import { supabase } from './client';

/**
 * Comments on a cloud plan (see supabase/migrations/*_fp_project_comments.sql):
 * colleagues comment as themselves; people with a view-only link give a
 * name. A comment can be pinned to a spot on the plan and a layout.
 */
export interface PlanComment {
  id: string;
  author_name: string;
  author_email: string | null;
  via_link: boolean;
  body: string;
  x: number | null;
  y: number | null;
  variant_id: string | null;
  created_at: string;
  resolved_at: string | null;
  resolved_by_email: string | null;
}

/** Where comments go: a cloud plan you are on, or a view-only link. */
export type CommentTarget = { kind: 'member'; projectId: string; canResolve: boolean } | { kind: 'link'; token: string };

async function call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await (await supabase()).rpc(fn, args);
  if (error) throw new Error(error.message || 'The cloud request failed.');
  return data as T;
}

export const commentsApi = {
  list: (t: CommentTarget) =>
    t.kind === 'member'
      ? call<PlanComment[]>('fp_list_comments', { p_id: t.projectId })
      : call<PlanComment[]>('fp_list_shared_comments', { p_token: t.token }),
  add: (t: CommentTarget, c: { name: string; body: string; at: { x: number; y: number } | null; variantId: string | null }) =>
    t.kind === 'member'
      ? call<PlanComment>('fp_add_comment', {
          p_id: t.projectId,
          p_body: c.body,
          p_x: c.at?.x ?? null,
          p_y: c.at?.y ?? null,
          p_variant: c.variantId,
        })
      : call<PlanComment>('fp_add_shared_comment', {
          p_token: t.token,
          p_name: c.name,
          p_body: c.body,
          p_x: c.at?.x ?? null,
          p_y: c.at?.y ?? null,
          p_variant: c.variantId,
        }),
  setResolved: (id: string, resolved: boolean) =>
    call<PlanComment>('fp_set_comment_resolved', { p_comment: id, p_resolved: resolved }),
};

/** The name a link visitor comments under, remembered in this browser. */
const NAME_KEY = 'sf-planner:comment-name';
export function rememberedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}
export function rememberName(name: string) {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    /* private mode: ask again next time */
  }
}

interface CommentsState {
  target: CommentTarget | null;
  list: PlanComment[];
  loaded: boolean;
  error: string | null;
  open: boolean;
  /** Waiting for a click on the plan to pin a new comment. */
  placing: boolean;
  /** Where the comment being written is pinned (world mm), if anywhere. */
  draftAt: { x: number; y: number } | null;
  /** The comment to show (from a pin or the list). */
  focusId: string | null;
  setTarget: (t: CommentTarget | null) => void;
  refresh: () => Promise<void>;
  setOpen: (open: boolean) => void;
  startPlacing: () => void;
  place: (at: { x: number; y: number } | null) => void;
  focus: (id: string | null) => void;
  add: (c: { name: string; body: string; variantId: string | null }) => Promise<void>;
  setResolved: (id: string, resolved: boolean) => Promise<void>;
}

const sameTarget = (a: CommentTarget | null, b: CommentTarget | null) => JSON.stringify(a) === JSON.stringify(b);
const message = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');

export const useComments = create<CommentsState>()((set, get) => ({
  target: null,
  list: [],
  loaded: false,
  error: null,
  open: false,
  placing: false,
  draftAt: null,
  focusId: null,

  setTarget: (t) => {
    if (sameTarget(t, get().target)) return;
    set({ target: t, list: [], loaded: false, error: null, placing: false, draftAt: null, focusId: null, ...(t ? {} : { open: false }) });
    if (t) void get().refresh();
  },

  refresh: async () => {
    const t = get().target;
    if (!t) return;
    try {
      const list = await commentsApi.list(t);
      if (sameTarget(t, get().target)) set({ list, loaded: true, error: null });
    } catch (e) {
      if (sameTarget(t, get().target)) set({ error: message(e), loaded: true });
    }
  },

  setOpen: (open) => set({ open, ...(open ? {} : { placing: false, draftAt: null }) }),
  startPlacing: () => set({ open: true, placing: true, draftAt: null, focusId: null }),
  place: (at) => set({ placing: false, draftAt: at }),
  focus: (id) => set({ focusId: id, ...(id ? { open: true } : {}) }),

  add: async ({ name, body, variantId }) => {
    const t = get().target;
    if (!t) return;
    const c = await commentsApi.add(t, { name, body, at: get().draftAt, variantId });
    set((s) => ({ list: [...s.list, c], draftAt: null, placing: false, focusId: c.id }));
  },

  setResolved: async (id, resolved) => {
    const c = await commentsApi.setResolved(id, resolved);
    set((s) => ({ list: s.list.map((x) => (x.id === id ? c : x)) }));
  },
}));

/** Open (unresolved) comments shown on the plan: pinned ones for this layout or for every layout. */
export function pinsFor(list: readonly PlanComment[], activeVariantId: string | undefined) {
  return list.filter(
    (c) => !c.resolved_at && c.x !== null && c.y !== null && (!c.variant_id || !activeVariantId || c.variant_id === activeVariantId),
  );
}
