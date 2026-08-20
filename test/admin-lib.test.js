import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugify, validateEvent, usd, computeStats, sortByOrder, nextSortOrder, moveInOrder, escapeHtml, escapeAttr } from '../src/admin/lib.js';

test('slugify makes URL-safe slugs', () => {
  assert.equal(slugify('Fall Founder Scramble!'), 'fall-founder-scramble');
  assert.equal(slugify('  Miami  Nine  '), 'miami-nine');
  assert.equal(slugify('Q1 & Q2'), 'q1-and-q2');
});

test('validateEvent enforces required fields and integer cents', () => {
  const bad = validateEvent({ name: '', slug: 'x', price_cents: 1.5, capacity: 'n', image_alt: '', starts_at: 'nope' });
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.name && bad.errors.price_cents && bad.errors.capacity && bad.errors.image_alt && bad.errors.starts_at);
  const good = validateEvent({ name: 'X', slug: 'x-y', city: 'Miami', venue: 'V', starts_at: '2026-09-01T12:00:00-04:00', price_cents: 15000, capacity: 40, summary: 's', body: 'b', image: '/x.jpg', image_alt: 'alt' });
  assert.equal(good.ok, true);
  assert.deepEqual(good.errors, {});
});

test('usd renders integer cents without trailing zeros', () => {
  assert.equal(usd(15000), '$150');
  assert.equal(usd(8550), '$85.50');
});

test('computeStats counts upcoming/published/draft', () => {
  const future = new Date(Date.now() + 864e5).toISOString();
  const stats = computeStats([
    { published: true, starts_at: future },
    { published: true, starts_at: '2000-01-01T00:00:00Z' },
    { published: false, starts_at: future },
  ]);
  assert.equal(stats.published, 2);
  assert.equal(stats.draft, 1);
  assert.equal(stats.upcoming, 2);
});

test('sortByOrder + nextSortOrder', () => {
  const list = [{ sort_order: 2 }, { sort_order: 0 }, { sort_order: 1 }];
  assert.deepEqual(sortByOrder(list).map((e) => e.sort_order), [0, 1, 2]);
  assert.equal(nextSortOrder(list), 3);
  assert.equal(nextSortOrder([]), 0);
});

test('escapeAttr escapes & so entity-bearing values survive an attribute round-trip', () => {
  assert.equal(escapeAttr('Co-ed &middot; Fort Lauderdale &amp; Miami'), 'Co-ed &amp;middot; Fort Lauderdale &amp;amp; Miami');
  assert.equal(escapeAttr('a "quote"'), 'a &quot;quote&quot;');
  assert.equal(escapeHtml('x & <br>'), 'x &amp; &lt;br&gt;');
});

test('moveInOrder swaps an event with its neighbor and renumbers', () => {
  const list = [
    { id: 'a', sort_order: 0 },
    { id: 'b', sort_order: 1 },
    { id: 'c', sort_order: 2 },
  ];
  const up = moveInOrder(list, 'b', 'up');
  assert.deepEqual(up.map((e) => e.id), ['b', 'a', 'c']);
  assert.deepEqual(up.map((e) => e.sort_order), [0, 1, 2]);

  const down = moveInOrder(list, 'b', 'down');
  assert.deepEqual(down.map((e) => e.id), ['a', 'c', 'b']);
  assert.deepEqual(down.map((e) => e.sort_order), [0, 1, 2]);

  // Boundaries are no-ops (order unchanged).
  assert.deepEqual(moveInOrder(list, 'a', 'up').map((e) => e.id), ['a', 'b', 'c']);
  assert.deepEqual(moveInOrder(list, 'c', 'down').map((e) => e.id), ['a', 'b', 'c']);

  // Unknown id → unchanged, still renumbered.
  assert.deepEqual(moveInOrder(list, 'z', 'up').map((e) => e.id), ['a', 'b', 'c']);
});
