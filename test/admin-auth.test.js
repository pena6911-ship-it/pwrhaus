import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPwrhausAdmin } from '../functions/lib/auth.js';

test('recognizes the explicit PWRHaus admin app metadata role', () => {
  assert.equal(isPwrhausAdmin({ app_metadata: { pwrhaus_role: 'admin' } }), true);
});

test('does not authorize a role stored in user metadata', () => {
  assert.equal(isPwrhausAdmin({ user_metadata: { pwrhaus_role: 'admin' } }), false);
});

test('rejects missing or non-admin roles', () => {
  assert.equal(isPwrhausAdmin({ app_metadata: {} }), false);
  assert.equal(isPwrhausAdmin({ app_metadata: { pwrhaus_role: 'member' } }), false);
  assert.equal(isPwrhausAdmin(null), false);
});
