import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapStripeEventType, extractPaymentIntent, amountCentsOf } from '../functions/lib/stripe-events.js';

test('mapStripeEventType maps the three handled events and ignores others', () => {
  assert.equal(mapStripeEventType('payment_intent.succeeded'), 'paid');
  assert.equal(mapStripeEventType('charge.refunded'), 'refunded');
  assert.equal(mapStripeEventType('payment_intent.payment_failed'), 'failed');
  assert.equal(mapStripeEventType('customer.created'), null);
});

test('extractPaymentIntent reads the id from PI and charge events', () => {
  const pi = { type: 'payment_intent.succeeded', data: { object: { id: 'pi_1', amount_received: 65000 } } };
  const charge = { type: 'charge.refunded', data: { object: { payment_intent: 'pi_1', amount_refunded: 5000 } } };
  assert.equal(extractPaymentIntent(pi), 'pi_1');
  assert.equal(extractPaymentIntent(charge), 'pi_1');
});

test('amountCentsOf reads the correct amount field per event', () => {
  assert.equal(amountCentsOf({ type: 'payment_intent.succeeded', data: { object: { amount_received: 65000 } } }), 65000);
  assert.equal(amountCentsOf({ type: 'charge.refunded', data: { object: { amount_refunded: 5000 } } }), 5000);
  assert.equal(amountCentsOf({ type: 'payment_intent.payment_failed', data: { object: { amount: 65000 } } }), 65000);
});
