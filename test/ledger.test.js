import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reduceOrderStatus, netRevenueCents } from '../functions/lib/ledger.js';

test('reduceOrderStatus applies precedence refunded > paid > failed > created', () => {
  assert.equal(reduceOrderStatus([]), 'created');
  assert.equal(reduceOrderStatus([{ event_type: 'created' }]), 'created');
  assert.equal(reduceOrderStatus([{ event_type: 'created' }, { event_type: 'failed' }]), 'failed');
  assert.equal(reduceOrderStatus([{ event_type: 'failed' }, { event_type: 'paid' }]), 'paid');
  assert.equal(reduceOrderStatus([{ event_type: 'paid' }, { event_type: 'refunded' }]), 'refunded');
});

test('netRevenueCents sums paid minus refunded', () => {
  assert.equal(netRevenueCents([]), 0);
  assert.equal(netRevenueCents([
    { event_type: 'paid', amount_cents: 65000 },
    { event_type: 'refunded', amount_cents: 5000 },
    { event_type: 'created', amount_cents: 0 },
  ]), 60000);
});
