import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordStripeEvent } from '../functions/lib/orders.js';
import { createFakeDb } from './helpers/fake-db.js';

function paidEvent(id, pi, amount) {
  return { id, type: 'payment_intent.succeeded', data: { object: { id: pi, amount_received: amount } } };
}

test('recordStripeEvent writes a paid ledger row for a known order', async () => {
  const db = createFakeDb();
  await db.insertOrder({ contact_id: 'c1', type: 'membership', amount_cents: 65000, currency: 'usd', stripe_payment_intent_id: 'pi_1', idempotency_key: 'stripe:pi_1' });
  const res = await recordStripeEvent({ db }, paidEvent('evt_1', 'pi_1', 65000));
  assert.equal(res.status, 'recorded');
  assert.equal(res.orderEvent.event_type, 'paid');
  assert.equal(res.orderEvent.amount_cents, 65000);
});

test('recordStripeEvent is idempotent on event id', async () => {
  const db = createFakeDb();
  await db.insertOrder({ contact_id: 'c1', type: 'membership', amount_cents: 65000, currency: 'usd', stripe_payment_intent_id: 'pi_1', idempotency_key: 'stripe:pi_1' });
  await recordStripeEvent({ db }, paidEvent('evt_1', 'pi_1', 65000));
  const again = await recordStripeEvent({ db }, paidEvent('evt_1', 'pi_1', 65000));
  assert.equal(again.status, 'duplicate');
});

test('recordStripeEvent returns no_order when the payment intent is unknown', async () => {
  const db = createFakeDb();
  const res = await recordStripeEvent({ db }, paidEvent('evt_1', 'pi_missing', 65000));
  assert.equal(res.status, 'no_order');
});

test('recordStripeEvent ignores unmapped event types', async () => {
  const db = createFakeDb();
  const res = await recordStripeEvent({ db }, { id: 'evt_9', type: 'customer.created', data: { object: {} } });
  assert.equal(res.status, 'ignored');
});
