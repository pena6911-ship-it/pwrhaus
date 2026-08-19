import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../supabase/migrations/0003_events_cms.sql', import.meta.url), 'utf8').toLowerCase();

test('0003 adds the CMS columns events lacked', () => {
  for (const col of ['slug', 'venue', 'summary', 'body', 'image', 'image_alt', 'registration_url', 'sort_order', 'updated_at']) {
    assert.match(sql, new RegExp(`alter table events add column (if not exists )?${col}\\b`), `missing add column ${col}`);
  }
  assert.match(sql, /slug\s+text unique/, 'slug must be unique for /events/<slug>/');
  assert.match(sql, /sort_order\s+int not null default 0/, 'sort_order drives drag-reorder');
});

test('0003 creates the site_content singleton table', () => {
  assert.match(sql, /create table (if not exists )?site_content/);
  assert.match(sql, /key\s+text\s+primary key/);
  assert.match(sql, /value\s+jsonb\s+not null/);
});

test('0003 enables RLS with public-published / authenticated-all policies', () => {
  assert.match(sql, /alter table events\s+enable row level security/);
  assert.match(sql, /alter table site_content\s+enable row level security/);
  assert.match(sql, /create policy[^;]*on events[^;]*for select[^;]*using \(published = true\)/s);
  assert.match(sql, /create policy[^;]*on events[^;]*to authenticated[^;]*using \(true\)/s);
  assert.match(sql, /create policy[^;]*on site_content[^;]*for select/s);
  assert.match(sql, /create policy[^;]*on site_content[^;]*to authenticated/s);
});

test('0003 provisions the public event-media storage bucket', () => {
  assert.match(sql, /storage\.buckets/);
  assert.match(sql, /'event-media'/);
  assert.match(sql, /storage\.objects/, 'must define storage RLS policies');
});
