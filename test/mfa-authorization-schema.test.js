import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql = fs.readFileSync(new URL('../supabase/migrations/0012_require_mfa.sql', import.meta.url), 'utf8');

test('MFA authorization migration requires aal2 alongside the admin role', () => {
  assert.match(sql, /auth\.jwt\(\)\s*->>\s*'aal'/);
  assert.match(sql, /'aal2'/);
  assert.match(sql, /auth\.jwt\(\)\s*->\s*'app_metadata'\s*->>\s*'pwrhaus_role'/);
});

test('MFA authorization migration replaces all dashboard policies', () => {
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
