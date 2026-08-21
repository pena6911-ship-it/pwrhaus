import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeTicketsAvailabilityHandler } from '../functions/lib/tickets-availability.js';

const EVENT = {
  id: 'evt-1', slug: 'august-scramble', name: 'August Scramble', capacity: 24,
  tickets_enabled: true, price_cents: 7500, member_price_cents: 6500, nonmember_price_cents: 7500,
  sales_end_at: '2026-12-30T23:59:00-05:00', starts_at: '2027-01-05T15:30:00-05:00',
};
const NOW = () => Date.parse('2026-08-20T12:00:00Z');

function harness({ event = EVENT, issued = 0 } = {}) {
  const db = {
    findEventBySlug: async (slug) => (slug === 'august-scramble' ? event : null),
    countIssuedTickets: async () => issued,
  };
  return makeTicketsAvailabilityHandler({ db, now: NOW });
}

const get = (qs) => new Request('https://x/api/tickets/availability' + qs);

test('reports remaining spots for an open event', async () => {
  const res = await harness({ issued: 6 })(get('?slug=august-scramble'));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.remaining, 18);
  assert.equal(body.capacity, 24);
  assert.equal(body.sales_open, true);
});

test('reports zero and closed sales when the event is full', async () => {
  const body = await (await harness({ issued: 24 })(get('?slug=august-scramble'))).json();
  assert.equal(body.remaining, 0);
  assert.equal(body.sales_open, false);
  assert.equal(body.reason, 'insufficient_capacity');
});

test('never reports a negative remaining count', async () => {
  const body = await (await harness({ issued: 30 })(get('?slug=august-scramble'))).json();
  assert.equal(body.remaining, 0);
});

test('reports closed sales when ticketing is disabled', async () => {
  const body = await (await harness({ event: { ...EVENT, tickets_enabled: false } })(get('?slug=august-scramble'))).json();
  assert.equal(body.sales_open, false);
  assert.equal(body.reason, 'tickets_disabled');
});

test('an unknown slug is not found', async () => {
  assert.equal((await harness()(get('?slug=nope'))).status, 404);
  assert.equal((await harness()(get(''))).status, 404);
});

test('exposes only availability — no attendee, order or contact data', async () => {
  const body = await (await harness({ issued: 3 })(get('?slug=august-scramble'))).json();
  assert.deepEqual(Object.keys(body).sort(), ['capacity', 'reason', 'remaining', 'sales_open']);
});

test('rejects a non-GET', async () => {
  const res = await harness()(new Request('https://x/api/tickets/availability?slug=august-scramble', { method: 'POST' }));
  assert.equal(res.status, 405);
});
