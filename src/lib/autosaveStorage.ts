'use client';

import type { PersistStorage, StorageValue } from 'zustand/middleware';

const DELAY_MS = 300;

export type AutosaveStatus = 'saved' | 'failed';
export const AUTOSAVE_EVENT = 'sf-autosave';

declare global {
  interface Window {
    /** Writes any pending autosave immediately (used on page hide and by tests). */
    __sfFlushAutosave?: () => void;
  }
}

/**
 * localStorage persistence that coalesces bursts of writes. Drags update the
 * project every frame, and a project with a plan underlay is ~1 MB of JSON,
 * so stringifying on every change would stall the UI. Writes are batched to
 * at most one per 300 ms, and flushed immediately when the page is hidden.
 *
 * Dispatches `sf-autosave` events ({ detail: 'saved' | 'failed' }) so the UI
 * can tell the user when the browser refuses the write (e.g. quota).
 */
export function batchedLocalStorage<S>(): PersistStorage<S> | undefined {
  if (typeof window === 'undefined') return undefined;

  let pending: { name: string; value: StorageValue<S> } | null = null;
  let timer: number | undefined;

  const report = (status: AutosaveStatus) =>
    window.dispatchEvent(new CustomEvent<AutosaveStatus>(AUTOSAVE_EVENT, { detail: status }));

  const flush = () => {
    if (timer !== undefined) window.clearTimeout(timer);
    timer = undefined;
    if (!pending) return;
    const { name, value } = pending;
    pending = null;
    try {
      localStorage.setItem(name, JSON.stringify(value));
      report('saved');
    } catch {
      report('failed');
    }
  };

  window.__sfFlushAutosave = flush;
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });

  return {
    getItem: (name) => {
      if (pending?.name === name) return pending.value;
      try {
        const raw = localStorage.getItem(name);
        return raw ? (JSON.parse(raw) as StorageValue<S>) : null;
      } catch {
        return null;
      }
    },
    setItem: (name, value) => {
      pending = { name, value };
      if (timer === undefined) timer = window.setTimeout(flush, DELAY_MS);
    },
    removeItem: (name) => {
      if (pending?.name === name) pending = null;
      try {
        localStorage.removeItem(name);
      } catch {
        // storage unavailable; nothing to remove
      }
    },
  };
}
