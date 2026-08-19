import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconcileContacts } from '../functions/lib/contact-reconciliation.js';
import { createFakeDb } from './helpers/fake-db.js';

function fakeGhl({ failEmails = new Set() } = {}) {
  const calls = [];
  return {
    calls,
    async upsertContact(input) {
      calls.push(input);
      if (failEmails.has(input.email)) throw new Error('GHL upsert failed: 503');
      return `ghl_${input.email}`;
    },
  };
}

const silentLog = { info() {}, warn() {}, error() {} };

test('reconcileContacts links stranded contacts through GHL', async () => {
  const db = createFakeDb();
  await db.insertContact({
    email: 'a@x.com',
    full_name: 'A',
    phone: '1',
    tier: 'free',
    source: 'web_free_profile',
    notes: null,
  });
  const ghl = fakeGhl();

  const result = await reconcileContacts({ db, ghl, log: silentLog }, { limit: 25 });

  assert.deepEqual(result, { processed: 1, linked: 1, failed: 0, failures: [] });
  assert.equal(ghl.calls.length, 1);
  assert.deepEqual(ghl.calls[0], {
    email: 'a@x.com',
    full_name: 'A',
    phone: '1',
    tier: 'free',
    source: 'web_free_profile',
  });
  const healed = await db.findContactByEmail('a@x.com');
  assert.equal(healed.ghl_contact_id, 'ghl_a@x.com');
});

test('fake DB stranded query excludes contacts that already have a GHL id', async () => {
  const db = createFakeDb();
  const linked = await db.insertContact({
    email: 'linked@x.com',
    full_name: 'Linked',
    phone: null,
    tier: 'free',
    source: 'site',
    notes: null,
  });
  await db.setContactGhlId(linked.id, 'ghl_existing');
  await db.insertContact({
    email: 'stranded@x.com',
    full_name: 'Stranded',
    phone: null,
    tier: 'free',
    source: 'site',
    notes: null,
  });

  const rows = await db.findContactsMissingGhlId({ limit: 25 });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].email, 'stranded@x.com');
});

test('reconcileContacts continues when one GHL push fails', async () => {
  const db = createFakeDb();
  await db.insertContact({
    email: 'fail@x.com',
    full_name: 'Fail',
    phone: null,
    tier: 'free',
    source: 'site',
    notes: null,
  });
  await db.insertContact({
    email: 'ok@x.com',
    full_name: 'Ok',
    phone: null,
    tier: 'free',
    source: 'site',
    notes: null,
  });
  const logs = [];
  const log = { info() {}, warn() {}, error(...args) { logs.push(args); } };
  const ghl = fakeGhl({ failEmails: new Set(['fail@x.com']) });

  const result = await reconcileContacts({ db, ghl, log }, { limit: 25 });

  assert.equal(result.processed, 2);
  assert.equal(result.linked, 1);
  assert.equal(result.failed, 1);
  assert.deepEqual(result.failures, [
    { contact_id: 'c_1', email: 'fail@x.com', error: 'GHL upsert failed: 503' },
  ]);
  assert.equal((await db.findContactByEmail('fail@x.com')).ghl_contact_id, null);
  assert.equal((await db.findContactByEmail('ok@x.com')).ghl_contact_id, 'ghl_ok@x.com');
  assert.equal(logs.length, 1);
  assert.equal(logs[0][0], 'contact.reconcile_failed');
});

test('reconcileContacts caps requested limit at 100', async () => {
  const db = createFakeDb();
  for (let i = 0; i < 105; i += 1) {
    await db.insertContact({
      email: `lead${i}@x.com`,
      full_name: `Lead ${i}`,
      phone: null,
      tier: 'free',
      source: 'site',
      notes: null,
    });
  }
  const ghl = fakeGhl();

  const result = await reconcileContacts({ db, ghl, log: silentLog }, { limit: 500 });

  assert.equal(result.processed, 100);
  assert.equal(result.linked, 100);
  assert.equal(ghl.calls.length, 100);
});
