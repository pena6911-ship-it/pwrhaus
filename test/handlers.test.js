import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeContactCreateHandler, makeStripeWebhookHandler } from '../functions/lib/handlers.js';

function req(method, body, headers = {}) {
  return new Request('http://local/fn', {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const silentLog = { info() {}, warn() {}, error() {} };

test('contact-create handler returns 201 and the created contact', async () => {
  const handler = makeContactCreateHandler({
    createContact: async (_deps, input) => ({ id: 'c_1', ghl_contact_id: 'ghl_1', email: input.email }),
    deps: {},
    log: silentLog,
  });
  const res = await handler(req('POST', { email: 'a@x.com' }));
  assert.equal(res.status, 201);
  assert.deepEqual(await res.json(), { id: 'c_1', ghl_contact_id: 'ghl_1' });
});

test('contact-create handler rejects non-POST and missing email', async () => {
  const handler = makeContactCreateHandler({ createContact: async () => ({}), deps: {} });
  assert.equal((await handler(req('GET'))).status, 405);
  const bad = await handler(req('POST', {}));
  assert.equal(bad.status, 400);
  assert.deepEqual(await bad.json(), { error: 'email_required' });
});

test('contact-create handler ignores a client-supplied tier and forces free', async () => {
  let received;
  const handler = makeContactCreateHandler({
    createContact: async (_deps, input) => {
      received = input;
      return { id: 'c_1', ghl_contact_id: 'ghl_1' };
    },
    deps: {},
    log: silentLog,
  });

  const res = await handler(req('POST', { email: 'a@x.com', tier: 'inner_circle' }));

  assert.equal(res.status, 201);
  assert.equal(received.tier, 'free');
});

test('stripe-webhook handler verifies signature then records the event', async () => {
  const recorded = [];
  const handler = makeStripeWebhookHandler({
    recordStripeEvent: async (_deps, event) => { recorded.push(event); return { status: 'recorded' }; },
    deps: {},
    log: silentLog,
    verify: (_raw, sig) => {
      if (sig !== 'good') throw new Error('bad sig');
      return { id: 'evt_1', type: 'payment_intent.succeeded', data: { object: {} } };
    },
  });
  const ok = await handler(req('POST', { any: 'payload' }, { 'stripe-signature': 'good' }));
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { status: 'recorded' });
  assert.equal(recorded.length, 1);

  const bad = await handler(req('POST', { any: 'payload' }, { 'stripe-signature': 'bad' }));
  assert.equal(bad.status, 400);
});

test('stripe-webhook handler returns 503 and calls log.warn when no_order', async () => {
  const warns = [];
  const log = { info() {}, warn(...a) { warns.push(a); }, error() {} };
  const handler = makeStripeWebhookHandler({
    recordStripeEvent: async () => ({ status: 'no_order' }),
    deps: {},
    log,
    verify: () => ({ id: 'evt_race', type: 'payment_intent.succeeded', data: { object: {} } }),
  });
  const res = await handler(req('POST', { any: 'payload' }, { 'stripe-signature': 'good' }));
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { status: 'no_order' });
  assert.equal(warns.length, 1); // log.warn was called once
});
