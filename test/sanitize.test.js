import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidEmail,
  truncate,
  sanitizeContactInput,
  ALLOWED_SOURCES,
} from '../functions/lib/sanitize.js';

test('isValidEmail accepts a normal address and rejects malformed ones', () => {
  assert.equal(isValidEmail('a@x.com'), true);
  assert.equal(isValidEmail('first.last@sub.example.co'), true);
  assert.equal(isValidEmail('no-at-sign'), false);
  assert.equal(isValidEmail('spaces in@x.com'), false);
  assert.equal(isValidEmail('a@nodot'), false);
  assert.equal(isValidEmail(''), false);
  assert.equal(isValidEmail(null), false);
  assert.equal(isValidEmail(12345), false);
});

test('isValidEmail rejects addresses longer than 254 characters', () => {
  const long = 'a'.repeat(250) + '@x.com';
  assert.equal(long.length > 254, true);
  assert.equal(isValidEmail(long), false);
});

test('truncate trims, nulls empties, and caps length', () => {
  assert.equal(truncate('  hello  ', 10), 'hello');
  assert.equal(truncate('', 10), null);
  assert.equal(truncate('   ', 10), null);
  assert.equal(truncate(null, 10), null);
  assert.equal(truncate(undefined, 10), null);
  assert.equal(truncate('abcdefghijk', 5), 'abcde');
});

test('sanitizeContactInput forces tier free and lowercases the email', () => {
  const out = sanitizeContactInput({ email: '  A@X.COM ', tier: 'inner_circle' });
  assert.equal(out.tier, 'free');
  assert.equal(out.email, 'a@x.com');
});

test('sanitizeContactInput passes through whitelisted sources', () => {
  for (const s of ALLOWED_SOURCES) {
    assert.equal(sanitizeContactInput({ email: 'a@x.com', source: s }).source, s);
  }
});

test('sanitizeContactInput falls back to site for unknown sources', () => {
  assert.equal(sanitizeContactInput({ email: 'a@x.com', source: 'evil' }).source, 'site');
  assert.equal(sanitizeContactInput({ email: 'a@x.com' }).source, 'site');
});

test('sanitizeContactInput caps field lengths', () => {
  const out = sanitizeContactInput({
    email: 'a@x.com',
    full_name: 'n'.repeat(200),
    phone: 'p'.repeat(100),
    notes: 'x'.repeat(3000),
  });
  assert.equal(out.full_name.length, 120);
  assert.equal(out.phone.length, 40);
  assert.equal(out.notes.length, 2000);
});

test('sanitizeContactInput never returns a company_website key', () => {
  const out = sanitizeContactInput({ email: 'a@x.com', company_website: 'spam' });
  assert.equal('company_website' in out, false);
});
