import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPwrhausAdmin, require2fa } from '../functions/lib/auth.js';

const ON = { AUTH_REQUIRE_2FA: 'true' };
const OFF = {};

test('recognizes the explicit PWRHaus admin app metadata role', () => {
  assert.equal(isPwrhausAdmin({ app_metadata: { pwrhaus_role: 'admin' }, aal: 'aal2' }, ON), true);
});

test('does not authorize a role stored in user metadata', () => {
  assert.equal(isPwrhausAdmin({ user_metadata: { pwrhaus_role: 'admin' }, aal: 'aal2' }, ON), false);
});

test('rejects missing or non-admin roles', () => {
  assert.equal(isPwrhausAdmin({ app_metadata: {} , aal: 'aal2' }, ON), false);
  assert.equal(isPwrhausAdmin({ app_metadata: { pwrhaus_role: 'member' }, aal: 'aal2' }, ON), false);
  assert.equal(isPwrhausAdmin({ app_metadata: { pwrhaus_role: 'admin' }, aal: 'aal1' }, ON), false);
  assert.equal(isPwrhausAdmin(null, ON), false);
});

// TEMPORARY, 2026-10-21: the default is OFF and this is fail-OPEN. These tests
// pin that deliberately so the posture cannot drift unnoticed in either
// direction -- if someone restores the fail-closed default, the first test here
// fails loudly and points at the plan doc rather than silently locking the
// owner out again.
test('2FA defaults OFF when nothing is configured', () => {
  assert.equal(require2fa({}), false);
  assert.equal(require2fa({ AUTH_REQUIRE_2FA: '' }), false);
  assert.equal(require2fa({ AUTH_REQUIRE_2FA: 'false' }), false);
  assert.equal(require2fa({ AUTH_REQUIRE_2FA: undefined }), false);
});

test('switching 2FA on is typo-tolerant, because leaving it off is the costly mistake', () => {
  for (const v of ['true', 'True', 'TRUE', '  true  ', '1', 'yes', 'YES', 'on', 'On']) {
    assert.equal(require2fa({ AUTH_REQUIRE_2FA: v }), true, `${JSON.stringify(v)} should enable 2FA`);
  }
});

test('with 2FA off, an admin on a single factor is authorized', () => {
  assert.equal(isPwrhausAdmin({ app_metadata: { pwrhaus_role: 'admin' }, aal: 'aal1' }, OFF), true);
  assert.equal(isPwrhausAdmin({ app_metadata: { pwrhaus_role: 'admin' } }, OFF), true);
});

test('2FA being off never bypasses the admin role check', () => {
  assert.equal(isPwrhausAdmin({ app_metadata: { pwrhaus_role: 'member' }, aal: 'aal1' }, OFF), false);
  assert.equal(isPwrhausAdmin({ user_metadata: { pwrhaus_role: 'admin' } }, OFF), false);
  assert.equal(isPwrhausAdmin(null, OFF), false);
  assert.equal(isPwrhausAdmin({}, OFF), false);
});
