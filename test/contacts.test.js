import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createContact } from '../functions/lib/contacts.js';
import { createFakeDb } from './helpers/fake-db.js';

function fakeGhl() {
  const calls = [];
  return {
    calls,
    async upsertContact(input) { calls.push(input); return 'ghl_new'; },
  };
}

test('createContact writes fact first, then pushes to GHL, then stores ghl id', async () => {
  const db = createFakeDb();
  const ghl = fakeGhl();
  const c = await createContact({ db, ghl }, { email: 'a@x.com', full_name: 'A', phone: '1', tier: 'free', source: 'site' });
  assert.equal(c.email, 'a@x.com');
  assert.equal(c.ghl_contact_id, 'ghl_new');
  assert.equal(ghl.calls.length, 1);
  assert.equal(ghl.calls[0].email, 'a@x.com');
});

test('createContact is idempotent by email and does not re-push to GHL when ghl_contact_id is already set', async () => {
  const db = createFakeDb();
  const ghl = fakeGhl();
  const first = await createContact({ db, ghl }, { email: 'a@x.com', full_name: 'A', phone: '1', tier: 'free', source: 'site' });
  const second = await createContact({ db, ghl }, { email: 'a@x.com', full_name: 'A', phone: '1', tier: 'free', source: 'site' });
  assert.equal(second.id, first.id);
  assert.equal(ghl.calls.length, 1); // not called again
});

test('createContact self-heals a stranded contact (ghl_contact_id null)', async () => {
  const db = createFakeDb();
  // Insert a contact directly with ghl_contact_id left null (simulates a prior GHL failure)
  await db.insertContact({ email: 'b@x.com', full_name: 'B', phone: '2', tier: 'free', source: 'site' });

  const ghl = fakeGhl(); // upsertContact returns 'ghl_new'
  const healed = await createContact({ db, ghl }, { email: 'b@x.com', full_name: 'B', phone: '2', tier: 'free', source: 'site' });

  assert.equal(healed.ghl_contact_id, 'ghl_new');
  assert.equal(ghl.calls.length, 1); // exactly one upsertContact call
  assert.equal(ghl.calls[0].email, 'b@x.com');
});

test('createContact requires an email', async () => {
  const db = createFakeDb();
  const ghl = fakeGhl();
  await assert.rejects(() => createContact({ db, ghl }, { email: '' }), /email is required/);
});
