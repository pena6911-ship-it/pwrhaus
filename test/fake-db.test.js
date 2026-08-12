import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeDb } from './helpers/fake-db.js';

test('fake db inserts and finds a contact by email', async () => {
  const db = createFakeDb();
  assert.equal(await db.findContactByEmail('a@x.com'), null);
  const c = await db.insertContact({ email: 'a@x.com', full_name: 'A', phone: '1', tier: 'free', source: 'site' });
  assert.ok(c.id);
  assert.equal(c.ghl_contact_id, null);
  assert.equal((await db.findContactByEmail('a@x.com')).id, c.id);
});

test('fake db sets ghl id on a contact', async () => {
  const db = createFakeDb();
  const c = await db.insertContact({ email: 'a@x.com', full_name: 'A', phone: '1', tier: 'free', source: 'site' });
  const updated = await db.setContactGhlId(c.id, 'ghl_9');
  assert.equal(updated.ghl_contact_id, 'ghl_9');
});

test('fake db enforces order idempotency lookup and payment-intent lookup', async () => {
  const db = createFakeDb();
  const o = await db.insertOrder({ contact_id: 'c1', type: 'membership', amount_cents: 65000, currency: 'usd', stripe_payment_intent_id: 'pi_1', idempotency_key: 'stripe:pi_1' });
  assert.equal((await db.findOrderByIdempotencyKey('stripe:pi_1')).id, o.id);
  assert.equal((await db.findOrderByPaymentIntent('pi_1')).id, o.id);
  assert.equal(await db.findOrderByIdempotencyKey('nope'), null);
});

test('fake db records order events and finds them by stripe event id', async () => {
  const db = createFakeDb();
  const oe = await db.insertOrderEvent({ order_id: 'o1', event_type: 'paid', amount_cents: 65000, stripe_event_id: 'evt_1' });
  assert.ok(oe.id);
  assert.equal((await db.findOrderEventByStripeEventId('evt_1')).id, oe.id);
  assert.equal(await db.findOrderEventByStripeEventId('evt_none'), null);
});
