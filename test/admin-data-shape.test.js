import { test } from 'node:test';
import assert from 'node:assert/strict';
import adminData from '../src/_data/admin.js';

// Eleventy merges every export of a _data module into the data object and then
// interpolates those values straight into window.__PWRHAUS. A function reaching
// that object is serialized as its own source text, which does not throw — it
// just makes the flag permanently truthy, so 2FA could never be switched off and
// nothing would report an error. These assert the SHAPE, not the value.
test('every value the dashboard config injects is a primitive', () => {
  for (const [key, value] of Object.entries(adminData())) {
    assert.notEqual(typeof value, 'function', `admin.${key} must not be a function`);
    assert.ok(['string', 'boolean'].includes(typeof value), `admin.${key} must be a string or boolean, got ${typeof value}`);
  }
});

test('require2fa is injected as a real boolean', () => {
  assert.equal(typeof adminData().require2fa, 'boolean');
});
