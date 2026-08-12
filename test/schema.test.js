import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../supabase/migrations/0001_init.sql', import.meta.url), 'utf8').toLowerCase();

test('schema declares every spec-required table', () => {
  for (const table of ['contacts', 'memberships', 'membership_events', 'events', 'orders', 'order_events', 'tickets', 'event_attendance', 'sponsors']) {
    assert.ok(sql.includes(`create table ${table}`) || sql.includes(`create table if not exists ${table}`), `missing table: ${table}`);
  }
});

test('money is integer cents and timestamps are timestamptz', () => {
  assert.ok(sql.includes('amount_cents'), 'orders/order_events must use amount_cents');
  assert.ok(!/amount\s+numeric|amount\s+decimal|amount\s+float/.test(sql), 'no float/decimal money columns allowed');
  assert.ok(sql.includes('timestamptz'), 'timestamps must be timestamptz');
});

test('idempotency + join key constraints exist', () => {
  assert.ok(sql.includes('ghl_contact_id'), 'contacts must carry ghl_contact_id');
  assert.ok(/idempotency_key[^;]*unique|unique[^;]*idempotency_key/.test(sql), 'orders.idempotency_key must be unique');
  assert.ok(/stripe_event_id[^;]*unique|unique[^;]*stripe_event_id/.test(sql), 'order_events.stripe_event_id must be unique');
});
