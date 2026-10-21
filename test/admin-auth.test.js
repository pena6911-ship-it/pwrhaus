import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPwrhausAdmin, require2fa } from '../functions/lib/auth.js';

const ON = { AUTH_REQUIRE_2FA: 'true' };
const OFF = { AUTH_REQUIRE_2FA: 'false' };

test('recognizes the explicit PWRHaus admin app metadata role', () => {
  assert.equal(isPwrhausAdmin({ app_metadata: { pwrhaus_role: 'admin' }, aal: 'aal2' }), true);
});

test('does not authorize a role stored in user metadata', () => {
  assert.equal(isPwrhausAdmin({ user_metadata: { pwrhaus_role: 'admin' }, aal: 'aal2' }), false);
});

test('rejects missing or non-admin roles', () => {
  assert.equal(isPwrhausAdmin({ app_metadata: {} , aal: 'aal2' }), false);
  assert.equal(isPwrhausAdmin({ app_metadata: { pwrhaus_role: 'member' }, aal: 'aal2' }), false);
  assert.equal(isPwrhausAdmin({ app_metadata: { pwrhaus_role: 'admin' }, aal: 'aal1' }, ON), false);
  assert.equal(isPwrhausAdmin(null), false);
});

test('2FA is required unless the env var is the explicit string false', () => {
  assert.equal(require2fa({}), true);
  assert.equal(require2fa({ AUTH_REQUIRE_2FA: 'true' }), true);
  assert.equal(require2fa({ AUTH_REQUIRE_2FA: '' }), true);
  assert.equal(require2fa({ AUTH_REQUIRE_2FA: 'False' }), true);   // typo stays closed
  assert.equal(require2fa({ AUTH_REQUIRE_2FA: '0' }), true);       // truthy-looking stays closed
  assert.equal(require2fa({ AUTH_REQUIRE_2FA: 'false' }), false);
});

test('with 2FA disabled, an admin on a single factor is authorized', () => {
  assert.equal(isPwrhausAdmin({ app_metadata: { pwrhaus_role: 'admin' }, aal: 'aal1' }, OFF), true);
  assert.equal(isPwrhausAdmin({ app_metadata: { pwrhaus_role: 'admin' } }, OFF), true);
});

test('disabling 2FA never bypasses the admin role check', () => {
  assert.equal(isPwrhausAdmin({ app_metadata: { pwrhaus_role: 'member' }, aal: 'aal1' }, OFF), false);
  assert.equal(isPwrhausAdmin({ user_metadata: { pwrhaus_role: 'admin' } }, OFF), false);
  assert.equal(isPwrhausAdmin(null, OFF), false);
  assert.equal(isPwrhausAdmin({}, OFF), false);
});
