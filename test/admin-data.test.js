import { test } from 'node:test';
import assert from 'node:assert/strict';

async function load(key) { return (await import(`../src/_data/admin.js?${key}`)).default(); }

test('admin config is empty strings when env absent', async () => {
  const prev = { u: process.env.SUPABASE_URL, k: process.env.SUPABASE_ANON_KEY };
  delete process.env.SUPABASE_URL; delete process.env.SUPABASE_ANON_KEY;
  try {
    const admin = await load('empty');
    assert.equal(admin.supabaseUrl, '');
    assert.equal(admin.supabaseAnonKey, '');
  } finally {
    if (prev.u === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = prev.u;
    if (prev.k === undefined) delete process.env.SUPABASE_ANON_KEY; else process.env.SUPABASE_ANON_KEY = prev.k;
  }
});

test('admin config reads the public Supabase url + anon key', async () => {
  process.env.SUPABASE_URL = 'https://proj.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'anon-abc';
  const admin = await load('set');
  assert.equal(admin.supabaseUrl, 'https://proj.supabase.co');
  assert.equal(admin.supabaseAnonKey, 'anon-abc');
});

test('admin config exposes the public GHL location id (empty when absent)', async () => {
  const prev = process.env.GHL_LOCATION_ID;
  delete process.env.GHL_LOCATION_ID;
  try {
    assert.equal((await load('ghl-empty')).ghlLocationId, '');
    process.env.GHL_LOCATION_ID = 'loc-123';
    assert.equal((await load('ghl-set')).ghlLocationId, 'loc-123');
  } finally {
    if (prev === undefined) delete process.env.GHL_LOCATION_ID; else process.env.GHL_LOCATION_ID = prev;
  }
});
