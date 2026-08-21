import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../supabase/migrations/0009_event_checkin.sql', import.meta.url), 'utf8').toLowerCase();

test('0009 makes double check-in impossible at the database level', () => {
  assert.match(sql, /alter table event_attendance add constraint [a-z_]+ unique \(ticket_id\)/);
  assert.match(sql, /drop constraint if exists/, 'must be safe to re-run');
});

test('0009 grants attendance reads to authenticated only', () => {
  assert.match(sql, /create policy[^;]*on event_attendance[^;]*for select[^;]*to authenticated/s);
  assert.doesNotMatch(sql, /to anon/, 'attendance must never be readable by anon');
});

test('0009 indexes attendance by event for the roster', () => {
  assert.match(sql, /create index if not exists [a-z_]+ on event_attendance \(event_id\)/);
});
