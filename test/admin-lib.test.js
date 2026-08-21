import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugify, validateEvent, usd, computeStats, sortByOrder, nextSortOrder, moveInOrder, escapeHtml, escapeAttr, weekAgoIso, tierLabel, tokenFromScan, resolveJsqr } from '../src/admin/lib.js';

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

test('weekAgoIso returns the ISO instant 7 days before the reference', () => {
  const ref = Date.parse('2026-08-20T12:00:00.000Z');
  assert.equal(weekAgoIso(ref), '2026-08-13T12:00:00.000Z');
  // Default reference is "now": result must parse and sit ~7 days back.
  const ms = Date.now() - Date.parse(weekAgoIso());
  assert.ok(ms > 6.9 * 864e5 && ms < 7.1 * 864e5);
});

test('tierLabel maps known tiers and passes unknown through', () => {
  assert.equal(tierLabel('free'), 'Free');
  assert.equal(tierLabel('member'), 'Member');
  assert.equal(tierLabel('inner_circle'), 'Inner circle');
  assert.equal(tierLabel('mystery'), 'mystery');
});

test('tokenFromScan extracts the ticket token from a scanned QR url', () => {
  assert.equal(tokenFromScan('https://pwrhaus.netlify.app/checkin/?t=abc123'), 'abc123');
  // Percent-encoded tokens must come back decoded, ready to send to the API.
  assert.equal(tokenFromScan('https://x/checkin/?t=a%2Bb%2Fc'), 'a+b/c');
  // Extra params must not be swallowed into the token.
  assert.equal(tokenFromScan('https://x/checkin/?t=abc&utm=qr'), 'abc');
});

test('tokenFromScan ignores codes that are not our tickets', () => {
  assert.equal(tokenFromScan('https://example.com/'), '');
  assert.equal(tokenFromScan('just some text'), '');
  assert.equal(tokenFromScan(''), '');
  assert.equal(tokenFromScan(null), '');
});

test('resolveJsqr accepts either UMD global shape', () => {
  const fn = () => {};
  assert.equal(resolveJsqr({ jsQR: fn }), fn);
  // A bundle that wraps the decoder as `default` must still resolve, otherwise a
  // working decoder reads as "missing" and the scanner falls back for no reason.
  assert.equal(resolveJsqr({ jsQR: { default: fn } }), fn);
});

test('resolveJsqr returns null when the decoder truly did not load', () => {
  assert.equal(resolveJsqr({}), null);
  assert.equal(resolveJsqr(undefined), null);
  assert.equal(resolveJsqr({ jsQR: undefined }), null);
  // A non-callable global is not a decoder, however truthy it looks.
  assert.equal(resolveJsqr({ jsQR: {} }), null);
  assert.equal(resolveJsqr({ jsQR: 'yes' }), null);
});
