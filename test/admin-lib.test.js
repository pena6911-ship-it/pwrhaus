import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugify, validateEvent, usd, computeStats, sortByOrder, nextSortOrder, moveInOrder, escapeHtml, escapeAttr, weekAgoIso, crmDateRange, tierLabel, tokenFromScan, resolveJsqr, shouldFallbackToJsqr, checkinOverlayState, priceInputToCents } from '../src/admin/lib.js';

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

test('crmDateRange returns calendar boundaries for today, month, and quarter', () => {
  const ref = new Date(2026, 7, 22, 15, 30).getTime();
  const today = crmDateRange('today', ref);
  assert.equal(new Date(today.from).getDate(), 22);
  assert.equal(new Date(today.to).getDate(), 23);

  const month = crmDateRange('month', ref);
  assert.equal(new Date(month.from).getDate(), 1);
  assert.equal(new Date(month.to).getMonth(), 8);

  const quarter = crmDateRange('quarter', ref);
  assert.equal(new Date(quarter.from).getMonth(), 6);
  assert.equal(new Date(quarter.from).getDate(), 1);
  assert.equal(new Date(quarter.to).getMonth(), 9);
});

test('crmDateRange supports a custom inclusive date range', () => {
  const range = crmDateRange('custom', Date.now(), '2026-08-01', '2026-08-15');
  assert.equal(new Date(range.from).getDate(), 1);
  assert.equal(new Date(range.to).getDate(), 16);
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

test('native QR scanning falls back to jsQR after sustained empty results', () => {
  assert.equal(shouldFallbackToJsqr('native', true, 3499), false);
  assert.equal(shouldFallbackToJsqr('native', true, 3500), true);
  assert.equal(shouldFallbackToJsqr('jsqr', true, 5000), false);
  assert.equal(shouldFallbackToJsqr('native', false, 5000), false);
});

test('check-in overlay pauses only for completed scan outcomes', () => {
  assert.deepEqual(checkinOverlayState({ ok: true }), { kind: 'ok', title: 'Checked in' });
  assert.deepEqual(checkinOverlayState({ ok: false, code: 'already_checked_in' }), { kind: 'warn', title: 'Already checked in' });
  assert.deepEqual(checkinOverlayState({ ok: false, code: 'needs_attendee' }), null);
  assert.deepEqual(checkinOverlayState({ ok: false, code: 'queued' }), { kind: 'warn', title: 'Saved for sync' });
  assert.deepEqual(checkinOverlayState({ ok: false, code: 'ticket_expired' }), { kind: 'err', title: 'Check-in not completed' });
});

test('priceInputToCents treats blank as "not set" and rounds dollars to cents', () => {
  // Blank must be null, not 0 — clearing the field has to clear the column,
  // not silently make the event free.
  assert.equal(priceInputToCents(''), null);
  assert.equal(priceInputToCents('   '), null);
  assert.equal(priceInputToCents(null), null);
  assert.equal(priceInputToCents(undefined), null);

  assert.equal(priceInputToCents('75'), 7500);
  assert.equal(priceInputToCents('85.50'), 8550);
  assert.equal(priceInputToCents('0'), 0);
  // Float noise must not produce 8549.
  assert.equal(priceInputToCents('85.49'), 8549);

  assert.ok(Number.isNaN(priceInputToCents('abc')));
});

test('validateEvent allows blank tier prices and rejects bad ones', () => {
  const base = {
    name: 'X', slug: 'x-y', city: 'Miami', venue: 'V',
    starts_at: '2026-09-01T12:00:00-04:00', price_cents: 15000, capacity: 40,
    summary: 's', body: 'b', image: '/x.jpg', image_alt: 'alt',
  };
  // Blank tier prices are the normal flat-price case.
  assert.equal(validateEvent({ ...base }).ok, true);
  assert.equal(validateEvent({ ...base, member_price_cents: null, nonmember_price_cents: null }).ok, true);
  assert.equal(validateEvent({ ...base, member_price_cents: 7500, nonmember_price_cents: 9500 }).ok, true);
  // Equal prices are legitimate.
  assert.equal(validateEvent({ ...base, member_price_cents: 9500, nonmember_price_cents: 9500 }).ok, true);

  assert.ok(validateEvent({ ...base, member_price_cents: NaN }).errors.member_price_cents);
  assert.ok(validateEvent({ ...base, nonmember_price_cents: -1 }).errors.nonmember_price_cents);
  assert.ok(validateEvent({ ...base, member_price_cents: 12.5 }).errors.member_price_cents);
});

test('validateEvent catches a member price above the non-member price', () => {
  const base = {
    name: 'X', slug: 'x-y', city: 'Miami', venue: 'V',
    starts_at: '2026-09-01T12:00:00-04:00', price_cents: 15000, capacity: 40,
    summary: 's', body: 'b', image: '/x.jpg', image_alt: 'alt',
  };
  // Swapped fields would otherwise only surface after somebody was overcharged.
  const swapped = validateEvent({ ...base, member_price_cents: 15000, nonmember_price_cents: 7500 });
  assert.equal(swapped.ok, false);
  assert.match(swapped.errors.member_price_cents, /higher than/);
});
