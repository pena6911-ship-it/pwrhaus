import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGhlClient } from '../functions/lib/ghl.js';

function fakeFetch(response) {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, opts });
    return response;
  };
  return { fetchImpl, calls };
}

test('upsertContact posts deterministic tier and source tags to GHL and returns the contact id', async () => {
  const { fetchImpl, calls } = fakeFetch({
    ok: true,
    status: 200,
    json: async () => ({ contact: { id: 'ghl_123' } }),
  });
  const ghl = createGhlClient({ apiKey: 'k', locationId: 'loc_1', fetchImpl });
  const id = await ghl.upsertContact({
    email: 'a@x.com',
    full_name: 'A',
    phone: '1',
    tier: 'free',
    source: 'Web Free Profile',
  });
  assert.equal(id, 'ghl_123');
  assert.equal(calls.length, 1);
  const body = JSON.parse(calls[0].opts.body);
  assert.equal(body.email, 'a@x.com');
  assert.equal(body.locationId, 'loc_1');
  assert.deepEqual(body.tags, ['pwrhaus_tier_free', 'pwrhaus_source_web_free_profile']);
  assert.equal(calls[0].opts.headers.Authorization, 'Bearer k');
});

test('upsertContact throws on a non-2xx response', async () => {
  const { fetchImpl } = fakeFetch({ ok: false, status: 401, json: async () => ({}) });
  const ghl = createGhlClient({ apiKey: 'k', locationId: 'loc_1', fetchImpl });
  await assert.rejects(() => ghl.upsertContact({ email: 'a@x.com' }), /GHL upsert failed: 401/);
});
