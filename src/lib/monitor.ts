import { CLOUD_ENABLED, CLOUD_KEY, CLOUD_URL } from './cloud/config';

/**
 * Error monitoring: what goes wrong in people's browsers is reported to the
 * database, where reports of the same error are counted together, and read
 * in the planner (File → Error log…).
 *
 * Reported: errors nothing caught, promises nothing handled, the error
 * screen, and a few failures the planner does handle but that leave someone
 * stuck (a plan that will not save).
 *
 * A report says what failed and where in the code, which version of the
 * planner, and how it came about: the last things done (action names only),
 * the view, the size of the plan, the browser. Never the plan itself, its
 * name, an address or a link: `scrub` takes those out of the text.
 *
 * This module stands on its own — no store, no Supabase client — so it
 * still works when those are what failed. Nothing here ever throws.
 */

export type ErrorKind =
  /** Nothing caught it. */
  | 'error'
  /** A promise nothing handled. */
  | 'promise'
  /** The planner had to show its error screen. */
  | 'screen'
  /** The plan could not be saved to the cloud. */
  | 'save';

/** The commit this build was made from. */
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || 'dev';

// --- the trail: the last things done ---------------------------------------

const TRAIL_LENGTH = 20;
const steps: { name: string; times: number }[] = [];

/** Notes that `name` was done. Repeats (a drag is hundreds of moves) are counted, not listed. */
export function trail(name: string): void {
  for (let i = steps.length - 1; i >= Math.max(0, steps.length - 3); i--) {
    if (steps[i]!.name === name) {
      steps[i]!.times++;
      return;
    }
  }
  steps.push({ name, times: 1 });
  if (steps.length > TRAIL_LENGTH) steps.shift();
}

export const trailNow = (): string[] => steps.map((s) => (s.times > 1 ? `${s.name} ×${s.times}` : s.name));
export const clearTrail = (): void => void steps.splice(0);

// --- what to say about an error ----------------------------------------------

/** Takes out what could say who or which plan: addresses, links' queries and hosts, tokens, ids. */
export function scrub(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '<email>')
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '<token>')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<id>')
    .replace(/\b(?:blob:)?(?:https?|wss?):\/\/[^\s/?#)]+/g, '')
    // What follows the ? of a link (a shared link's key is there).
    .replace(/(\/[^\s?#)]*)\?[^\s:)]*/g, '$1');
}

export interface ErrorDescription {
  message: string;
  /** The frames of the stack, one a line. */
  stack: string;
  /** The first frame: where it failed. */
  top: string;
}

/** An error — or whatever was thrown — as text, scrubbed and cut to size. */
export function describeError(error: unknown): ErrorDescription {
  const e = (typeof error === 'object' && error !== null ? error : {}) as { name?: unknown; message?: unknown; stack?: unknown };
  let message: string;
  if (typeof e.message === 'string') {
    message = (typeof e.name === 'string' && e.name && e.name !== 'Error' ? `${e.name}: ` : '') + e.message;
  } else if (typeof error === 'string') {
    message = error;
  } else {
    try {
      message = JSON.stringify(error) ?? String(error);
    } catch {
      message = String(error);
    }
  }
  const frames = scrub(typeof e.stack === 'string' ? e.stack : '')
    .split('\n')
    .map((line) => line.trim())
    // Chrome: "at name (file:1:2)"; Firefox and Safari: "name@file:1:2".
    .filter((line) => /^at\s|@.*:\d+/.test(line))
    .slice(0, 30);
  return {
    message: (scrub(message).trim() || 'Unknown error').slice(0, 500),
    stack: frames.join('\n').slice(0, 6000),
    top: (frames[0] ?? '').slice(0, 300),
  };
}

const NOISE = [
  // The browser's own chatter, harmless.
  /ResizeObserver loop/i,
  // An error in a script from elsewhere: the browser tells us nothing about it.
  /^Script error\.?$/i,
  // Something was cancelled on purpose.
  /AbortError|The user aborted a request|The operation was aborted/i,
  // The network, not the planner: offline, a blocked request, a dropped connection.
  /Failed to fetch|NetworkError when attempting to fetch|Load failed|AuthRetryableFetchError|network connection was lost/i,
];

/** Whether an error is not the planner's: browser chatter, the network, or an extension's code. */
export function isNoise(message: string, rawStack: string): boolean {
  return NOISE.some((r) => r.test(message)) || /\b(?:chrome|moz|safari-web|safari)-extension:\/\//.test(rawStack);
}

// --- sending -----------------------------------------------------------------

let context: () => Record<string, unknown> = () => ({});
/** What the planner adds to a report about its state (view, tool, size of the plan). */
export function setMonitorContext(read: () => Record<string, unknown>): void {
  context = read;
}

/** Reports stay off on a developer's own machine unless switched on there (tests do). */
function enabled(): boolean {
  if (!CLOUD_ENABLED || typeof window === 'undefined') return false;
  const local = /^(?:localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|\[::1\])$/.test(window.location.hostname);
  if (!local) return true;
  try {
    return window.localStorage.getItem('sf-planner:monitor') === 'on';
  } catch {
    return false;
  }
}

/** The signed-in person's token, as the Supabase client keeps it; null when signed out or stale. */
function accessToken(): string | null {
  try {
    const session = JSON.parse(window.localStorage.getItem('sf-planner:auth') ?? 'null') as { access_token?: unknown; expires_at?: unknown } | null;
    const token = session?.access_token;
    const expires = session?.expires_at;
    if (typeof token !== 'string') return null;
    return typeof expires !== 'number' || expires * 1000 > Date.now() + 5000 ? token : null;
  } catch {
    return null;
  }
}

function gather(): Record<string, unknown> {
  let out: Record<string, unknown> = {};
  try {
    out = { ...context() };
  } catch {
    // The planner's own state is what failed: go without.
  }
  try {
    out.screen = `${window.innerWidth}×${window.innerHeight}`;
    out.browser = window.navigator.userAgent.slice(0, 200);
    out.host = window.location.hostname.slice(0, 80);
    out.sharedLink = /[?&]share=/.test(window.location.search);
    out.signedIn = !!accessToken();
    out.trail = trailNow();
  } catch {
    // As much as there is.
  }
  // The database takes up to 4000 bytes; the trail is the first to go.
  if (JSON.stringify(out).length > 3500) delete out.trail;
  if (JSON.stringify(out).length > 3500) out = { host: out.host, screen: out.screen };
  return out;
}

async function send(body: Record<string, unknown>): Promise<boolean> {
  const post = (bearer: string) =>
    fetch(`${CLOUD_URL}/rest/v1/rpc/fp_report_error`, {
      method: 'POST',
      // So it is still sent if the page is on its way out.
      keepalive: true,
      headers: { 'Content-Type': 'application/json', apikey: CLOUD_KEY, Authorization: `Bearer ${bearer}` },
      body: JSON.stringify(body),
    });
  try {
    const token = accessToken();
    let res = await post(token ?? CLOUD_KEY);
    if (res.status === 401 && token) res = await post(CLOUD_KEY);
    return res.ok;
  } catch {
    return false;
  }
}

/** The same error once a page load, and no more than this many in all: a loop must not flood the log. */
const MAX_REPORTS = 10;
const sent = new Set<string>();

/**
 * Reports an error. Resolves true when the report was taken; false when it
 * was not sent (noise, a repeat, reporting off) or did not arrive.
 */
export function reportError(kind: ErrorKind, error: unknown): Promise<boolean> {
  try {
    if (!enabled()) return Promise.resolve(false);
    const rawStack = typeof (error as { stack?: unknown } | null)?.stack === 'string' ? (error as { stack: string }).stack : '';
    const d = describeError(error);
    if (isNoise(d.message, rawStack)) return Promise.resolve(false);
    const key = `${kind}|${d.message}|${d.top}`;
    if (sent.has(key) || sent.size >= MAX_REPORTS) return Promise.resolve(false);
    sent.add(key);
    return send({ p_kind: kind, p_message: d.message, p_stack: d.stack, p_top: d.top, p_version: APP_VERSION, p_context: gather() });
  } catch {
    return Promise.resolve(false);
  }
}

let installed = false;
/** Starts listening for errors nothing caught. Once; safe to call again. */
export function installMonitor(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('error', (e) => {
    // A picture or script that did not load is an event too, without an error in it.
    if (!(e instanceof ErrorEvent)) return;
    void reportError('error', e.error ?? e.message);
  });
  window.addEventListener('unhandledrejection', (e) => void reportError('promise', e.reason));
}
