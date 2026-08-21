import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeTicketsLookupHandler } from '../functions/lib/tickets-lookup.js';

function harness() {
  const db = {
    findOrderByStripeSession: async (id) =>
      (id === 'cs_good' ? { id: 'ord-1', manage_token: 'tok-abc', stripe_payment_intent_id: 'pi_1' } : null),
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
  assert.deepEqual(Object.keys(body), ['manage_url']);
  assert.equal(body.manage_token, undefined);
  assert.equal(body.token, undefined);
  assert.equal(body.order, undefined);
});

test('non-GET requests are rejected', async () => {
  const handler = harness();
  const res = await handler(new Request('https://x/api/tickets/lookup?session_id=cs_good', { method: 'POST' }));
  assert.equal(res.status, 405);
});
