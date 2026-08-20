import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../supabase/migrations/0005_lock_down_pii.sql', import.meta.url), 'utf8').toLowerCase();

test('0005 enables RLS on every previously-unprotected data table', () => {
  for (const t of ['contacts', 'contact_inquiries', 'memberships', 'membership_events', 'orders', 'order_events', 'tickets', 'event_attendance', 'sponsors']) {
    assert.match(sql, new RegExp(`alter table ${t}\\s+enable row level security`), `missing RLS on ${t}`);
  }
});

test('0005 grants read on contacts + inquiries to authenticated only (never anon)', () => {
  assert.match(sql, /create policy[^;]*on contacts[^;]*for select[^;]*to authenticated/s);
  assert.match(sql, /create policy[^;]*on contact_inquiries[^;]*for select[^;]*to authenticated/s);
  assert.doesNotMatch(sql, /to anon/, 'the lockdown must not grant anon any access to PII');
});
