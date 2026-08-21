import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPwrhausAdmin } from '../functions/lib/auth.js';

test('recognizes the explicit PWRHaus admin app metadata role', () => {
  assert.equal(isPwrhausAdmin({ app_metadata: { pwrhaus_role: 'admin' }, aal: 'aal2' }), true);
});

test('does not authorize a role stored in user metadata', () => {
  assert.equal(isPwrhausAdmin({ user_metadata: { pwrhaus_role: 'admin' }, aal: 'aal2' }), false);
});

test('rejects missing or non-admin roles', () => {
  assert.equal(isPwrhausAdmin({ app_metadata: {} , aal: 'aal2' }), false);
  assert.equal(isPwrhausAdmin({ app_metadata: { pwrhaus_role: 'member' }, aal: 'aal2' }), false);
  assert.equal(isPwrhausAdmin({ app_metadata: { pwrhaus_role: 'admin' }, aal: 'aal1' }), false);
  assert.equal(isPwrhausAdmin(null), false);
});
