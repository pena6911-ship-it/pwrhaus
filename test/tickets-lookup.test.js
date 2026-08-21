import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeTicketsLookupHandler } from '../functions/lib/tickets-lookup.js';

function harness({ tickets } = {}) {
  const db = {
    findOrderByStripeSession: async (id) =>
      (id === 'cs_good' ? { id: 'ord-1', manage_token: 'tok-abc', stripe_payment_intent_id: 'pi_1' } : null),
    listTicketsByOrder: async () => (tickets ?? [
      { id: 't1', contact_id: 'c1' },
      { id: 't2', contact_id: null },
    ]),
  };
  return makeTicketsLookupHandler({ db });
}

const get = (qs) => new Request('https://x/api/tickets/lookup' + qs);

test('an unknown session id is not found', async () => {
  const handler = harness();
  const res = await handler(get('?session_id=cs_missing'));
  assert.equal(res.status, 404);
});

test('a missing session id is not found', async () => {
  const handler = harness();
  const res = await handler(get(''));
  assert.equal(res.status, 404);
});

test('a known session resolves to its manage url, and nothing else', async () => {
  const handler = harness();
  const res = await handler(get('?session_id=cs_good'));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.manage_url, 'https://x/tickets/manage/?token=tok-abc');

  // The raw token must appear only inside manage_url — never as its own field,
  // and no other order/contact/ticket data may leak through this endpoint.
  // unassigned_count is a bare number: it carries no identity.
  assert.deepEqual(Object.keys(body).sort(), ['manage_url', 'unassigned_count']);
  assert.equal(body.manage_token, undefined);
  assert.equal(body.token, undefined);
  assert.equal(body.order, undefined);
});

test('non-GET requests are rejected', async () => {
  const handler = harness();
  const res = await handler(new Request('https://x/api/tickets/lookup?session_id=cs_good', { method: 'POST' }));
  assert.equal(res.status, 405);
});

test('reports how many seats still need a guest name', async () => {
  const handler = harness();
  const res = await handler(get('?session_id=cs_good'));
  assert.equal((await res.json()).unassigned_count, 1);
});

test('a fully assigned order reports zero unassigned seats', async () => {
  // A single-ticket order auto-assigns the buyer their own seat, so there is
  // nobody left to add — the thanks page must not offer an "Add your guests"
  // link that leads to an empty form.
  const handler = harness({ tickets: [{ id: 't1', contact_id: 'c1' }] });
  const res = await handler(get('?session_id=cs_good'));
  const body = await res.json();
  assert.equal(body.unassigned_count, 0);
  assert.ok(body.manage_url, 'the link itself still resolves for later reassignment');
});
