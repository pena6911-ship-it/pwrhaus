import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeContactCreateHandler, makeContactReconcileHandler, makeStripeWebhookHandler } from '../functions/lib/handlers.js';

function req(method, body, headers = {}) {
  return new Request('http://local/fn', {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function rawReq(method, body, headers = {}) {
  return new Request('http://local/fn', {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body,
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

test('contact-create handler silently accepts and discards honeypot submissions', async () => {
  let called = false;
  const handler = makeContactCreateHandler({
    createContact: async () => { called = true; return { id: 'c_1', ghl_contact_id: 'g_1' }; },
    deps: {},
    log: silentLog,
  });

  const res = await handler(req('POST', {
    email: 'bot@x.com',
    company_website: 'http://spam.example',
  }));

  assert.equal(res.status, 201);
  assert.equal(called, false, 'createContact must not run for honeypot hits');
  const body = await res.json();
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  // Shape must be indistinguishable from a real success: every genuine 201
  // carries a non-null ghl_contact_id, so returning null here would tell a bot
  // exactly which of its submissions were discarded.
  assert.match(body.id, UUID_RE);
  assert.match(body.ghl_contact_id, UUID_RE);
});

test('contact-create handler rejects a malformed email', async () => {
  const handler = makeContactCreateHandler({
    createContact: async () => ({ id: 'c_1', ghl_contact_id: 'g_1' }),
    deps: {},
    log: silentLog,
  });

  const res = await handler(req('POST', { email: 'not-an-email' }));

  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: 'invalid_email' });
});

test('contact-create handler passes a sanitized payload to createContact', async () => {
  let received;
  const handler = makeContactCreateHandler({
    createContact: async (_deps, input) => { received = input; return { id: 'c_1', ghl_contact_id: 'g_1' }; },
    deps: {},
    log: silentLog,
  });

  await handler(req('POST', {
    email: 'A@X.com',
    source: 'evil',
    full_name: 'n'.repeat(200),
    company_website: '',
  }));

  assert.equal(received.email, 'a@x.com');
  assert.equal(received.source, 'site');
  assert.equal(received.full_name.length, 120);
  assert.equal(received.tier, 'free');
  assert.equal('company_website' in received, false);
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

test('contact-reconcile handler rejects missing and wrong bearer tokens', async () => {
  const handler = makeContactReconcileHandler({
    reconcileContacts: async () => ({ processed: 0, linked: 0, failed: 0, failures: [] }),
    deps: {},
    env: { RECONCILE_ADMIN_TOKEN: 'secret' },
    log: silentLog,
  });

  const missing = await handler(req('POST', {}));
  assert.equal(missing.status, 401);
  assert.deepEqual(await missing.json(), { error: 'unauthorized' });

  const wrong = await handler(req('POST', {}, { Authorization: 'Bearer wrong' }));
  assert.equal(wrong.status, 401);
  assert.deepEqual(await wrong.json(), { error: 'unauthorized' });
});

test('contact-reconcile handler rejects malformed JSON before parsing it when unauthorized', async () => {
  let built = false;
  const handler = makeContactReconcileHandler({
    reconcileContacts: async () => ({ processed: 0, linked: 0, failed: 0, failures: [] }),
    deps: () => { built = true; return {}; },
    env: { RECONCILE_ADMIN_TOKEN: 'secret' },
    log: silentLog,
  });

  const res = await handler(rawReq('POST', '{malformed'));

  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: 'unauthorized' });
  assert.equal(built, false);
});

test('contact-reconcile handler rejects malformed authenticated JSON', async () => {
  const handler = makeContactReconcileHandler({
    reconcileContacts: async () => ({ processed: 0, linked: 0, failed: 0, failures: [] }),
    deps: {},
    env: { RECONCILE_ADMIN_TOKEN: 'secret' },
    log: silentLog,
  });

  const res = await handler(rawReq('POST', '{malformed', { Authorization: 'Bearer secret' }));

  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: 'invalid_json' });
});

test('contact-reconcile handler rejects all requests when the admin token is unset', async () => {
  const handler = makeContactReconcileHandler({
    reconcileContacts: async () => ({ processed: 0, linked: 0, failed: 0, failures: [] }),
    deps: {},
    env: {},
    log: silentLog,
  });

  const res = await handler(req('POST', {}, { Authorization: 'Bearer secret' }));

  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: 'unauthorized' });
});

test('contact-reconcile handler rejects non-POST requests before checking credentials', async () => {
  const handler = makeContactReconcileHandler({
    reconcileContacts: async () => ({ processed: 0, linked: 0, failed: 0, failures: [] }),
    deps: {},
    env: {},
    log: silentLog,
  });

  const res = await handler(req('GET'));

  assert.equal(res.status, 405);
});

test('contact-reconcile handler treats a JSON null body as an empty options object', async () => {
  let receivedOptions;
  const handler = makeContactReconcileHandler({
    reconcileContacts: async (_deps, options) => {
      receivedOptions = options;
      return { processed: 0, linked: 0, failed: 0, failures: [] };
    },
    deps: {},
    env: { RECONCILE_ADMIN_TOKEN: 'secret' },
    log: silentLog,
  });

  const res = await handler(rawReq('POST', 'null', { Authorization: 'Bearer secret' }));

  assert.equal(res.status, 200);
  assert.deepEqual(receivedOptions, { limit: undefined });
});

test('contact-reconcile handler runs with a valid bearer token and passes limit', async () => {
  let receivedLimit;
  const handler = makeContactReconcileHandler({
    reconcileContacts: async (_deps, options) => {
      receivedLimit = options.limit;
      return { processed: 1, linked: 1, failed: 0, failures: [] };
    },
    deps: {},
    env: { RECONCILE_ADMIN_TOKEN: 'secret' },
    log: silentLog,
  });

  const res = await handler(req('POST', { limit: 7 }, { Authorization: 'Bearer secret' }));

  assert.equal(res.status, 200);
  assert.equal(receivedLimit, 7);
  assert.deepEqual(await res.json(), { processed: 1, linked: 1, failed: 0, failures: [] });
});

test('contact-reconcile handler returns 500 when the pre-batch query fails', async () => {
  const handler = makeContactReconcileHandler({
    reconcileContacts: async () => { throw new Error('database unavailable'); },
    deps: {},
    env: { RECONCILE_ADMIN_TOKEN: 'secret' },
    log: silentLog,
  });

  const res = await handler(req('POST', {}, { Authorization: 'Bearer secret' }));

  assert.equal(res.status, 500);
  assert.deepEqual(await res.json(), { error: 'reconcile_failed' });
});
