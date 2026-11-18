import { test, expect } from '@playwright/test';
import { clearTrail, describeError, isNoise, scrub, trail, trailNow } from '@/lib/monitor';
import { errorText, situationOf, whoText } from '@/lib/errorLog';
import type { CloudError } from '@/lib/cloud/api';

test('a report is scrubbed of addresses, links, tokens and ids', () => {
  expect(scrub('No access for anna.b@bestseller.com')).toBe('No access for <email>');
  expect(scrub('Plan 3f2b8c1e-9a4d-4c7b-8e21-0a1b2c3d4e5f not found')).toBe('Plan <id> not found');
  expect(scrub('Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2ln rejected')).toBe('Bearer <token> rejected');
  // A link keeps its path, loses where it is and what follows the ? (a shared link's key).
  expect(scrub('at t (https://selected-frame-floor-planner.vercel.app/_next/static/chunks/123-ab12.js?dpl=x9:1:2345)')).toBe(
    'at t (/_next/static/chunks/123-ab12.js:1:2345)',
  );
  expect(scrub('at https://example.org/?share=Qm9vbVNlY3JldA:1:1')).toBe('at /:1:1');
  // Ordinary text is left alone.
  expect(scrub("a?.b is not a function (reading 'x')")).toBe("a?.b is not a function (reading 'x')");
});

test('an error is described by its message and where it failed', () => {
  const chrome = Object.assign(new TypeError("Cannot read properties of null (reading 'x')"), {
    stack: [
      "TypeError: Cannot read properties of null (reading 'x')",
      '    at rackSize (https://planner.example/_next/static/chunks/app/page-1a2b.js:1:5120)',
      '    at Array.map (<anonymous>)',
      '    at s (https://planner.example/_next/static/chunks/88-9f.js:2:40)',
    ].join('\n'),
  });
  const d = describeError(chrome);
  expect(d.message).toBe("TypeError: Cannot read properties of null (reading 'x')");
  expect(d.top).toBe('at rackSize (/_next/static/chunks/app/page-1a2b.js:1:5120)');
  expect(d.stack.split('\n')).toHaveLength(3);
  expect(d.stack).not.toContain('planner.example');

  // Firefox and Safari write their frames the other way round.
  const firefox = Object.assign(new Error('Nope'), { stack: 'rackSize@https://planner.example/_next/x.js:1:5120\n@https://planner.example/_next/y.js:2:1' });
  expect(describeError(firefox)).toMatchObject({ message: 'Nope', top: 'rackSize@/_next/x.js:1:5120' });

  // Whatever was thrown: text, an object, nothing.
  expect(describeError('just text for a@b.dk')).toMatchObject({ message: 'just text for <email>', stack: '', top: '' });
  expect(describeError({ code: 42 }).message).toBe('{"code":42}');
  expect(describeError(undefined).message).toBe('undefined');
  expect(describeError(new Error('')).message).toBe('Unknown error');
  expect(describeError(new Error('x'.repeat(2000))).message).toHaveLength(500);
});

test('what is not the planner’s is left out: browser chatter, the network, extensions', () => {
  expect(isNoise('ResizeObserver loop completed with undelivered notifications.', '')).toBe(true);
  expect(isNoise('Script error.', '')).toBe(true);
  expect(isNoise('TypeError: Failed to fetch', '')).toBe(true);
  expect(isNoise('AbortError: The user aborted a request.', '')).toBe(true);
  expect(isNoise('TypeError: x is not a function', 'at f (chrome-extension://abcdef/content.js:1:1)')).toBe(true);
  expect(isNoise("TypeError: Cannot read properties of null (reading 'x')", 'at f (https://planner.example/_next/x.js:1:1)')).toBe(false);
  expect(isNoise('ChunkLoadError: Loading chunk 123 failed.', '')).toBe(false);
});

test('the trail keeps the last things done; repeats are counted, not listed', () => {
  clearTrail();
  trail('addInventory');
  for (let i = 0; i < 40; i++) {
    trail('moveInventory');
    trail('setGuides');
  }
  trail('rotateSelected');
  expect(trailNow()).toEqual(['addInventory', 'moveInventory ×40', 'setGuides ×40', 'rotateSelected']);
  for (let i = 0; i < 30; i++) trail(`step${i}`);
  expect(trailNow()).toHaveLength(20);
  expect(trailNow().at(-1)).toBe('step29');
  clearTrail();
  expect(trailNow()).toEqual([]);
});

const sample: CloudError = {
  id: 7,
  kind: 'screen',
  message: "TypeError: Cannot read properties of null (reading 'x')",
  stack: 'at rackSize (/_next/x.js:1:5120)\nat s (/_next/y.js:2:40)',
  version: '2867a7f',
  context: {
    view: '3d', tool: 'select', selected: 'inventory', fixtures: 14, walls: 6, openings: 1, pillars: 0, drawing: true, cloudPlan: false,
    screen: '1440×900', browser: 'Mozilla/5.0 (Macintosh)', trail: ['addInventory', 'moveInventory ×57', 'setViewMode'],
  },
  hits: 12,
  people: 3,
  anonymous_hits: 9,
  first_seen: '2026-11-12T09:10:11.000Z',
  last_seen: '2026-11-18T11:02:03.000Z',
};

test('an error from the log, in words', () => {
  expect(whoText(sample)).toBe('12 times · 3 people signed in · 9 times not signed in');
  expect(whoText({ hits: 1, people: 0, anonymous_hits: 1 })).toBe('once · not signed in');
  expect(whoText({ hits: 4, people: 1, anonymous_hits: 0 })).toBe('4 times · 1 person signed in');
  expect(situationOf(sample)).toBe(
    '3D view · tool select · inventory selected · 14 fixtures · 6 walls · 1 door or window · 0 pillars · with a plan drawing · screen 1440×900',
  );
  expect(situationOf({ context: {} })).toBe('');
  expect(errorText(sample)).toBe(
    [
      'Error in the Selected Frame Shop Planner, version 2867a7f',
      'Kind: Error screen — the planner stopped and showed its error screen',
      "Message: TypeError: Cannot read properties of null (reading 'x')",
      'Happened 12 times · 3 people signed in · 9 times not signed in; first 2026-11-12 09:10, last 2026-11-18 11:02 (UTC)',
      'Where:\n  at rackSize (/_next/x.js:1:5120)\n  at s (/_next/y.js:2:40)',
      'The last things done: addInventory → moveInventory ×57 → setViewMode',
      'Situation: 3D view · tool select · inventory selected · 14 fixtures · 6 walls · 1 door or window · 0 pillars · with a plan drawing · screen 1440×900',
      'Browser: Mozilla/5.0 (Macintosh)',
    ].join('\n'),
  );
});
