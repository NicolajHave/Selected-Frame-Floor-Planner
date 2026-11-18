import type { CloudError } from './cloud/api';

/** What each kind of report means, in a few words. */
export const ERROR_KINDS: Record<string, { label: string; meaning: string }> = {
  screen: { label: 'Error screen', meaning: 'the planner stopped and showed its error screen' },
  error: { label: 'Error', meaning: 'something failed in the background; the planner kept running' },
  promise: { label: 'Error', meaning: 'something failed in the background; the planner kept running' },
  save: { label: 'Not saved', meaning: 'a plan could not be saved to the cloud' },
};

export const kindOf = (e: Pick<CloudError, 'kind'>) => ERROR_KINDS[e.kind] ?? { label: e.kind, meaning: e.kind };

const times = (n: number) => (n === 1 ? 'once' : `${n} times`);

/** "12 times · 3 people signed in · 9 times not signed in". */
export function whoText(e: Pick<CloudError, 'hits' | 'people' | 'anonymous_hits'>): string {
  const parts = [times(e.hits)];
  if (e.people > 0) parts.push(`${e.people} ${e.people === 1 ? 'person' : 'people'} signed in`);
  if (e.anonymous_hits > 0) parts.push(e.anonymous_hits === e.hits ? 'not signed in' : `${times(e.anonymous_hits)} not signed in`);
  return parts.join(' · ');
}

const text = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : '');

/** The last things done before it failed, oldest first. */
export function trailOf(e: Pick<CloudError, 'context'>): string[] {
  const t = e.context?.trail;
  return Array.isArray(t) ? t.map(text).filter(Boolean) : [];
}

/** "3D view · tool select · 14 fixtures · 6 walls · …": where the planner stood. */
export function situationOf(e: Pick<CloudError, 'context'>): string {
  const c = e.context ?? {};
  const n = (key: string, one: string, many: string) => (typeof c[key] === 'number' ? `${c[key]} ${c[key] === 1 ? one : many}` : '');
  return [
    c.sharedLink ? 'a shared link' : '',
    c.view ? `${text(c.view).toUpperCase()} view` : '',
    c.tool ? `tool ${text(c.tool)}` : '',
    c.selected ? `${text(c.selected)} selected` : '',
    n('fixtures', 'fixture', 'fixtures'),
    n('walls', 'wall', 'walls'),
    n('openings', 'door or window', 'doors and windows'),
    n('pillars', 'pillar', 'pillars'),
    c.drawing ? 'with a plan drawing' : '',
    c.cloudPlan ? 'a cloud plan' : '',
    c.viewOnly ? 'view only' : '',
    c.screen ? `screen ${text(c.screen)}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

const day = (iso: string) => iso.slice(0, 16).replace('T', ' ');

/** Everything about one error as plain text, to hand to whoever fixes it. */
export function errorText(e: CloudError): string {
  const trail = trailOf(e);
  const browser = text(e.context?.browser);
  return [
    `Error in the Selected Frame Shop Planner, version ${e.version || 'unknown'}`,
    `Kind: ${kindOf(e).label} — ${kindOf(e).meaning}`,
    `Message: ${e.message}`,
    `Happened ${whoText(e)}; first ${day(e.first_seen)}, last ${day(e.last_seen)} (UTC)`,
    e.stack ? `Where:\n${e.stack.split('\n').map((l) => `  ${l}`).join('\n')}` : 'Where: unknown',
    trail.length ? `The last things done: ${trail.join(' → ')}` : '',
    situationOf(e) ? `Situation: ${situationOf(e)}` : '',
    browser ? `Browser: ${browser}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}
