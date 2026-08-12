import { test } from 'node:test';
import assert from 'node:assert/strict';
import { orderIdempotencyKey, assertPresent } from '../functions/lib/idempotency.js';

test('orderIdempotencyKey is deterministic and namespaced', () => {
  assert.equal(orderIdempotencyKey('stripe', 'pi_123'), 'stripe:pi_123');
  assert.equal(orderIdempotencyKey('stripe', 'pi_123'), orderIdempotencyKey('stripe', 'pi_123'));
});

test('assertPresent throws a named error on empty values', () => {
  assert.throws(() => assertPresent('', 'email'), /email is required/);
  assert.throws(() => assertPresent(undefined, 'contact_id'), /contact_id is required/);
  assert.doesNotThrow(() => assertPresent('ok', 'email'));
});
