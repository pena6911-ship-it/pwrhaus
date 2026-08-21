import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql = fs.readFileSync(new URL('../supabase/migrations/0010_admin_authorization.sql', import.meta.url), 'utf8');

test('admin authorization migration gates dashboard policies on app_metadata', () => {
  assert.match(sql, /auth\.jwt\(\)\s*->\s*'app_metadata'\s*->>\s*'pwrhaus_role'/);
  assert.doesNotMatch(sql, /using\s*\(\s*true\s*\)/i);
  assert.doesNotMatch(sql, /with\s+check\s*\(\s*true\s*\)/i);
});

test('admin authorization migration replaces every dashboard policy', () => {
  for (const policy of [
    'events_admin_all',
    'site_content_admin_all',
    'event_media_admin_write',
    'contacts_admin_read',
    'contact_inquiries_admin_read',
    'orders_admin_read',
    'tickets_admin_read',
    'event_attendance_admin_read',
  ]) {
    assert.match(sql, new RegExp(`drop policy if exists ${policy}`, 'i'));
    assert.match(sql, new RegExp(`create policy ${policy}`, 'i'));
  }
});
