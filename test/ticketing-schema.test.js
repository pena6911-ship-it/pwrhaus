import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../supabase/migrations/0006_event_ticketing.sql', import.meta.url), 'utf8').toLowerCase();

test('0006 adds the event ticketing columns', () => {
  for (const c of ['member_price_cents', 'nonmember_price_cents', 'sales_end_at', 'tickets_enabled']) {
    assert.match(sql, new RegExp(`alter table events add column (if not exists )?${c}\\b`), `missing events.${c}`);
  }
  assert.match(sql, /tickets_enabled\s+boolean not null default false/, 'sales must be off until deliberately enabled');
});

test('0006 extends orders and tickets', () => {
  assert.match(sql, /alter table orders add column (if not exists )?manage_token\s+text unique/);
  assert.match(sql, /alter table tickets alter column contact_id drop not null/, 'tickets are unassigned until claimed');
  for (const c of ['ticket_no', 'tier_sold', 'qr_token', 'assigned_at']) {
    assert.match(sql, new RegExp(`alter table tickets add column (if not exists )?${c}\\b`), `missing tickets.${c}`);
  }
  assert.match(sql, /tier_sold[^;]*check \(tier_sold in \('member','non_member'\)\)/s);
  assert.match(sql, /qr_token\s+text unique/);
});

test('0006 grants dashboard read on orders + tickets to authenticated only', () => {
  assert.match(sql, /create policy[^;]*on orders[^;]*for select[^;]*to authenticated/s);
  assert.match(sql, /create policy[^;]*on tickets[^;]*for select[^;]*to authenticated/s);
  assert.doesNotMatch(sql, /to anon/, 'ticket + order data must never be readable by anon');
});
