import { create } from 'zustand';
import type { PlanUnderlay } from '@/model/project';

/**
 * The plan drawing (underlay) lives outside the plan.
 *
 * A drawing is a picture of a megabyte or so. Kept inside the plan it was
 * written to the browser's small autosave store on every change, sent to
 * the cloud again with every save and copied into every saved version. So
 * the plan only holds a reference, `asset:<id>`, where the id is made from
 * the picture itself (the same picture always gets the same id), and the
 * picture is kept once:
 *
 *  - in memory while the plan is open (this module),
 *  - in the browser's IndexedDB, so it is there after a reload and offline,
 *  - in the cloud next to the plan (lib/cloud), for colleagues and links.
 *
 * Nothing may lose a drawing: wherever a plan leaves this module without a
 * safe place for its picture — a saved file, a browser without IndexedDB, a
 * server without the asset functions — the picture is put back inline.
 */

const PREFIX = 'asset:';
const ID = /^a[0-9a-f]{28}$/;

export const isAssetRef = (src: string | null | undefined): src is string =>
  typeof src === 'string' && src.startsWith(PREFIX) && ID.test(src.slice(PREFIX.length));
export const assetIdOf = (ref: string): string => ref.slice(PREFIX.length);
export const assetRef = (id: string): string => PREFIX + id;
const isDataUrl = (src: string | null | undefined): src is string => typeof src === 'string' && src.startsWith('data:');

/** cyrb53: a fast 53-bit string hash. Two of them with different seeds make the id. */
function cyrb53(text: string, seed: number): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** The id of a picture (a data URL): 'a' and 28 hex digits made from its content. */
export function imageId(dataUrl: string): string {
  const part = (seed: number) => cyrb53(dataUrl, seed).toString(16).padStart(14, '0');
  return `a${part(1)}${part(2)}`;
}

interface AssetState {
  /** Pictures in memory, by id (data URLs). */
  urls: Record<string, string>;
  /** Pictures on their way, and ones that could not be found. */
  state: Record<string, 'loading' | 'missing'>;
}

export const useAssets = create<AssetState>()(() => ({ urls: {}, state: {} }));

/** Ids known to be safely in IndexedDB. */
const durable = new Set<string>();
const durableListeners = new Set<() => void>();
/** Called when a picture has reached IndexedDB (the autosave can then drop its inline copy). */
export function onAssetDurable(fn: () => void): () => void {
  durableListeners.add(fn);
  return () => durableListeners.delete(fn);
}
export const isDurable = (id: string): boolean => durable.has(id);

// --- IndexedDB --------------------------------------------------------------

const DB_NAME = 'sf-planner-assets';
const STORE = 'images';
/** Pictures kept in the browser: the plan's own and a few earlier ones (undo, other plans). */
const KEEP = 8;

let dbPromise: Promise<IDBDatabase | null> | null = null;
function db(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const open = indexedDB.open(DB_NAME, 1);
      open.onupgradeneeded = () => open.result.createObjectStore(STORE, { keyPath: 'id' });
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => resolve(null);
      open.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

interface Stored {
  id: string;
  url: string;
  at: number;
}

async function idbGet(id: string): Promise<string | null> {
  const d = await db();
  if (!d) return null;
  return new Promise((resolve) => {
    try {
      const req = d.transaction(STORE, 'readonly').objectStore(STORE).get(id);
      req.onsuccess = () => resolve((req.result as Stored | undefined)?.url ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbPut(id: string, url: string): Promise<boolean> {
  const d = await db();
  if (!d) return false;
  return new Promise((resolve) => {
    try {
      const tx = d.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      store.put({ id, url, at: Date.now() } satisfies Stored);
      // Keep the newest few; older pictures go.
      const all = store.getAll();
      all.onsuccess = () => {
        const old = (all.result as Stored[]).sort((a, b) => b.at - a.at).slice(KEEP);
        for (const o of old) if (o.id !== id) store.delete(o.id);
      };
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

// --- in and out of memory ----------------------------------------------------

function remember(id: string, url: string) {
  if (useAssets.getState().urls[id] === url) return;
  useAssets.setState((s) => {
    const state = { ...s.state };
    delete state[id];
    return { urls: { ...s.urls, [id]: url }, state };
  });
}

function store(id: string, url: string) {
  remember(id, url);
  if (durable.has(id)) return;
  void idbPut(id, url).then((ok) => {
    if (!ok) return;
    durable.add(id);
    durableListeners.forEach((fn) => fn());
  });
}

/**
 * Takes a picture (a data URL) into the store and returns the reference
 * to put in the plan. A reference, or anything that is not a data URL,
 * comes back as it is.
 */
export function internImage(src: string): string {
  if (!isDataUrl(src)) return src;
  const id = imageId(src);
  store(id, src);
  return assetRef(id);
}

/** The picture behind `src` if it is in memory (or `src` itself when it is inline); null while it is not. */
export function resolveSrc(src: string | null | undefined): string | null {
  if (!src) return null;
  if (!isAssetRef(src)) return src;
  return useAssets.getState().urls[assetIdOf(src)] ?? null;
}

/** As `resolveSrc`, for components: re-renders when the picture arrives. */
export function useAssetSrc(src: string | null | undefined): string | null {
  const id = isAssetRef(src) ? assetIdOf(src) : null;
  const url = useAssets((s) => (id ? s.urls[id] ?? null : null));
  return id ? url : src ?? null;
}

/** 'loading' | 'missing' for a referenced picture that is not in memory; null when it is (or `src` is inline). */
export function useAssetState(src: string | null | undefined): 'loading' | 'missing' | null {
  const id = isAssetRef(src) ? assetIdOf(src) : null;
  return useAssets((s) => (id && !s.urls[id] ? s.state[id] ?? 'loading' : null));
}

type WithUnderlay = { underlay?: PlanUnderlay | null };

/** The plan with its drawing taken into the store and replaced by a reference. */
export function externalizeProject<P extends WithUnderlay>(project: P): P {
  const u = project.underlay;
  if (!u || !isDataUrl(u.src)) return project;
  return { ...project, underlay: { ...u, src: internImage(u.src) } };
}

/** The plan with its drawing put back inline (for a file, or anywhere the reference alone is not enough). */
export function inlineProject<P extends WithUnderlay>(project: P): P {
  const u = project.underlay;
  if (!u || !isAssetRef(u.src)) return project;
  const url = resolveSrc(u.src);
  return url ? { ...project, underlay: { ...u, src: url } } : project;
}

/**
 * The plan as the browser's autosave should keep it: with the reference
 * once the picture is safely in IndexedDB, with the picture inline until
 * then (and for good in a browser without IndexedDB).
 */
export function autosaveProject<P extends WithUnderlay>(project: P): P {
  const src = project.underlay?.src;
  return isAssetRef(src) && !durable.has(assetIdOf(src)) ? inlineProject(project) : project;
}

const fetching = new Map<string, Promise<boolean>>();

/**
 * Makes sure picture `id` is in memory: from IndexedDB, else from `remote`
 * (the cloud, when the plan lives there). Resolves false when it is nowhere
 * to be found; calling again tries again.
 */
export function ensureAsset(id: string, remote?: () => Promise<string | null>): Promise<boolean> {
  if (useAssets.getState().urls[id]) return Promise.resolve(true);
  const running = fetching.get(id);
  if (running) return running;
  useAssets.setState((s) => ({ state: { ...s.state, [id]: 'loading' } }));
  const job = (async () => {
    const local = await idbGet(id);
    if (local) {
      durable.add(id);
      remember(id, local);
      return true;
    }
    let fetched: string | null = null;
    try {
      fetched = remote ? await remote() : null;
    } catch {
      fetched = null;
    }
    // Only what it claims to be: the picture this id was made from.
    if (fetched && isDataUrl(fetched) && imageId(fetched) === id) {
      store(id, fetched);
      return true;
    }
    useAssets.setState((s) => ({ state: { ...s.state, [id]: 'missing' } }));
    return false;
  })().finally(() => fetching.delete(id));
  fetching.set(id, job);
  return job;
}
