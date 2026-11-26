'use client';

import { create } from 'zustand';
import type { RoomFinish } from '@/model/objects';
import { cleanFinish } from '@/lib/finishes';
import { usePlannerStore } from '@/store/plannerStore';
import { supabase } from './client';
import { rememberedName } from './comments';

/**
 * The floor and wall colour picked on a view-only link (see
 * supabase/migrations/*_fp_link_finish.sql). A partner who opens the link
 * can say what the shop's floor and walls are; it is optional and changes
 * nothing in the plan. The link shows the choice laid over the plan, and
 * the plan's owner sees it as a suggestion to take over or dismiss.
 *
 * With a database that has no place for it yet, a visitor's choice still
 * works: it is kept in their browser, for that link.
 */
export interface LinkFinish {
  finish: RoomFinish;
  /** Who chose it: the name they comment under, or "Someone with the link". */
  chosen_by: string;
  chosen_at: string;
}

/** Whose choice it is to make: a visitor with the link, or someone on the plan looking at what a visitor chose. */
export type FinishTarget = { kind: 'link'; token: string } | { kind: 'member'; projectId: string; canAdopt: boolean };

async function call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await (await supabase()).rpc(fn, args);
  if (error) throw Object.assign(new Error(error.message || 'The cloud request failed.'), { code: error.code });
  return data as T;
}

/** A database from before these functions, rather than a refusal or a broken connection. */
const notThere = (e: unknown) => {
  const code = (e as { code?: unknown } | null)?.code;
  return code === 'PGRST202' || code === '42883' || /could not find the function|unknown function/i.test(e instanceof Error ? e.message : '');
};

const read = (raw: unknown): LinkFinish | null => {
  const r = raw as Partial<LinkFinish> | null;
  const finish = cleanFinish(r?.finish);
  return finish ? { finish, chosen_by: String(r?.chosen_by ?? ''), chosen_at: String(r?.chosen_at ?? '') } : null;
};

const localKey = (token: string) => `sf-planner:link-finish:${token}`;
function readLocal(token: string): LinkFinish | null {
  try {
    return read(JSON.parse(localStorage.getItem(localKey(token)) ?? 'null'));
  } catch {
    return null;
  }
}
function writeLocal(token: string, chosen: LinkFinish | null) {
  try {
    if (chosen) localStorage.setItem(localKey(token), JSON.stringify(chosen));
    else localStorage.removeItem(localKey(token));
  } catch {
    /* private mode: it lasts for this visit */
  }
}

/** A choice is sent once the choosing has paused this long: a colour picker tries many on the way (ms). */
const SAVE_AFTER_MS = 600;

interface LinkFinishState {
  target: FinishTarget | null;
  /** What is chosen for this plan's link, if anything. */
  chosen: LinkFinish | null;
  loaded: boolean;
  /** Where a visitor's choice is kept: with the link in the cloud, or only in this browser. */
  kept: 'cloud' | 'browser';
  /** The visitor's panel. */
  open: boolean;
  error: string | null;
  setTarget: (t: FinishTarget | null) => void;
  refresh: () => Promise<void>;
  setOpen: (open: boolean) => void;
  /** A visitor chooses (null: back to what the plan says). Shows at once; saved a moment later. */
  choose: (finish: RoomFinish | null) => void;
  /** Someone on the plan takes the visitor's choice into the plan (one undo step) … */
  adopt: () => Promise<void>;
  /** … or takes it away. */
  dismiss: () => Promise<void>;
}

const sameTarget = (a: FinishTarget | null, b: FinishTarget | null) => JSON.stringify(a) === JSON.stringify(b);
const message = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');
let saving: number | undefined;

export const useLinkFinish = create<LinkFinishState>()((set, get) => ({
  target: null,
  chosen: null,
  loaded: false,
  kept: 'cloud',
  open: false,
  error: null,

  setTarget: (t) => {
    if (sameTarget(t, get().target)) return;
    window.clearTimeout(saving);
    set({ target: t, chosen: null, loaded: false, error: null, kept: 'cloud', ...(t ? {} : { open: false }) });
    if (t) void get().refresh();
  },

  refresh: async () => {
    const t = get().target;
    if (!t) return;
    let chosen: LinkFinish | null = null;
    let kept: 'cloud' | 'browser' = 'cloud';
    let error: string | null = null;
    try {
      chosen = read(
        t.kind === 'link'
          ? await call<unknown>('fp_get_shared_finish', { p_token: t.token })
          : await call<unknown>('fp_get_link_finish', { p_id: t.projectId }),
      );
    } catch (e) {
      if (notThere(e)) kept = 'browser';
      else error = message(e);
      if (t.kind === 'link') chosen = readLocal(t.token);
    }
    if (!sameTarget(t, get().target)) return;
    set({ chosen, kept, error, loaded: true });
    if (t.kind === 'link') usePlannerStore.getState().showLinkFinish(chosen?.finish ?? null);
  },

  setOpen: (open) => set({ open }),

  choose: (finish) => {
    const t = get().target;
    if (t?.kind !== 'link') return;
    const clean = cleanFinish(finish);
    const chosen = clean ? { finish: clean, chosen_by: rememberedName(), chosen_at: new Date().toISOString() } : null;
    set({ chosen, error: null });
    usePlannerStore.getState().showLinkFinish(clean);
    if (get().kept === 'browser') {
      writeLocal(t.token, chosen);
      return;
    }
    window.clearTimeout(saving);
    saving = window.setTimeout(() => {
      call<unknown>('fp_set_shared_finish', { p_token: t.token, p_name: rememberedName(), p_finish: clean ?? {} })
        .then((saved) => {
          const now = read(saved);
          // Still the same choice: take the name and time the database gave it.
          if (sameTarget(t, get().target) && now && JSON.stringify(now.finish) === JSON.stringify(get().chosen?.finish)) set({ chosen: now });
        })
        .catch((e: unknown) => {
          if (!sameTarget(t, get().target)) return;
          if (notThere(e)) {
            set({ kept: 'browser' });
            writeLocal(t.token, get().chosen);
          } else set({ error: message(e) });
        });
    }, SAVE_AFTER_MS);
  },

  adopt: async () => {
    const t = get().target;
    const chosen = get().chosen;
    if (t?.kind !== 'member' || !t.canAdopt || !chosen) return;
    const planner = usePlannerStore.getState();
    planner.beginGesture();
    if (chosen.finish.floor) planner.setFloorFinish(chosen.finish.floor);
    if (chosen.finish.wall) planner.setWallColor(chosen.finish.wall);
    planner.endGesture();
    await get().dismiss();
  },

  dismiss: async () => {
    const t = get().target;
    if (t?.kind !== 'member' || !t.canAdopt) return;
    try {
      await call<void>('fp_clear_link_finish', { p_id: t.projectId });
      if (sameTarget(t, get().target)) set({ chosen: null, error: null });
    } catch (e) {
      if (sameTarget(t, get().target)) set({ error: message(e) });
    }
  },
}));
