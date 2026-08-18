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
  assert.deepEqual(ghl.calls[0], {
    email: 'a@x.com',
    full_name: 'A',
    phone: '1',
    tier: 'free',
    source: 'site',
  });
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

test('createContact appends an inquiry row for a brand-new contact', async () => {
  const db = createFakeDb();
  const ghl = fakeGhl();

  await createContact({ db, ghl }, {
    email: 'a@x.com', full_name: 'A', phone: '1', tier: 'free',
    source: 'web_sponsor', notes: 'Interested in Hole in One',
  });

  assert.equal(db._inquiries.length, 1);
  assert.equal(db._inquiries[0].source, 'web_sponsor');
  assert.equal(db._inquiries[0].notes, 'Interested in Hole in One');
});

test('createContact appends a second inquiry for a repeat submission without duplicating the contact', async () => {
  const db = createFakeDb();
  const ghl = fakeGhl();

  const first = await createContact({ db, ghl }, {
    email: 'a@x.com', tier: 'free', source: 'web_free_profile', notes: null,
  });
  const second = await createContact({ db, ghl }, {
    email: 'a@x.com', tier: 'free', source: 'web_sponsor', notes: 'Now interested in sponsoring',
  });

  assert.equal(second.id, first.id, 'must not create a second contact');
  assert.equal(ghl.calls.length, 1, 'must not re-push to GHL');
  assert.equal(db._inquiries.length, 2, 'both inquiries must be recorded');
  assert.equal(db._inquiries[1].source, 'web_sponsor');
  assert.equal(db._inquiries[1].contact_id, first.id);
});

test('createContact stores the first-touch note on the contact row', async () => {
  const db = createFakeDb();
  const ghl = fakeGhl();

  const c = await createContact({ db, ghl }, {
    email: 'a@x.com', tier: 'free', source: 'web_lessons', notes: 'First message',
  });

  assert.equal(c.notes, 'First message');
});

test('createContact records no inquiry when the email is missing', async () => {
  const db = createFakeDb();
  const ghl = fakeGhl();

  await assert.rejects(() => createContact({ db, ghl }, { email: '' }), /email is required/);
  assert.equal(db._inquiries.length, 0);
});

test('createContact keeps the enquiry when the GHL push fails', async () => {
  const db = createFakeDb();
  const ghl = { async upsertContact() { throw new Error('ghl 503'); } };
  const log = { error() {} };

  const c = await createContact({ db, ghl, log }, {
    email: 'a@x.com', tier: 'free', source: 'web_sponsor', notes: 'Interested',
  });

  assert.equal(c.email, 'a@x.com');
  assert.equal(c.ghl_contact_id, null, 'left unlinked so a later submission self-heals it');
  assert.equal(db._inquiries.length, 1, 'the enquiry must survive a CRM outage');
  assert.equal(db._inquiries[0].source, 'web_sponsor');
});

test('createContact falls back to the known row when setContactGhlId returns null', async () => {
  const db = createFakeDb();
  const ghl = fakeGhl();
  await db.insertContact({ email: 'b@x.com', full_name: 'B', phone: '2', tier: 'free', source: 'site', notes: null });
  const stranded = await db.findContactByEmail('b@x.com');

  // Simulate the row vanishing between lookup and update.
  db.setContactGhlId = async () => null;

  const c = await createContact({ db, ghl }, {
    email: 'b@x.com', tier: 'free', source: 'web_sponsor', notes: null,
  });

  assert.equal(c.id, stranded.id);
  assert.equal(db._inquiries.length, 1);
  assert.equal(db._inquiries[0].contact_id, stranded.id);
});
